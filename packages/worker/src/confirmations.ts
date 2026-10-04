/**
 * Conteo de confirmaciones y consenso — W2.1 (docs/backend-plan.md, Fase 2).
 *
 * Lógica pura, separada de KV y del webhook a propósito: así se puede probar sin
 * necesitar un binding real de Cloudflare, y el mismo módulo sirve tanto para
 * `InMemoryConfirmationStore` (tests/dev local) como para un adaptador de KV real
 * (Fase 3, cuando se conecte al contrato).
 *
 * W2.2 (identidad de quien confirma) sigue bloqueado por coordinación con el
 * frontend — ver docs/backend-plan.md#pendientes. Lo único que este módulo puede
 * garantizar hoy es la mitad que le toca: nunca acepta una confirmación sin una
 * wallet_address explícita, nunca la asume ni la infiere.
 */

export type WalletAddress = string;
export type ChallengeId = string;

/**
 * Ciclo de vida de la resolución on-chain de un reto:
 * `enviada` (tx transmitida) -> `confirmada` (recibo exitoso y reto Resuelto) o
 * `fallida` (cualquier error; libera el candado para poder reintentar).
 */
export type ResolutionStatus = "enviada" | "confirmada" | "fallida";

export interface ChallengeConfirmationState {
  /** wallet que confirmó -> ganador que propuso. Un wallet solo puede tener un voto vigente. */
  votes: Record<WalletAddress, WalletAddress>;
  /** ganador para el que ya se disparó consenso, o null si todavía no se alcanzó. */
  consensusTriggeredFor: WalletAddress | null;
  /** umbral de consenso vigente para este reto — se fija con la primera confirmación, no cambia después. */
  threshold: number;
  /** Estado de la resolución on-chain. Ausente mientras no se transmitió ninguna tx. */
  resolutionStatus?: ResolutionStatus;
  /** Hash de la última tx de resolución transmitida. */
  resolutionTxHash?: string;
}

export interface ConfirmationStore {
  get(challengeId: ChallengeId): Promise<ChallengeConfirmationState | null>;
  put(challengeId: ChallengeId, state: ChallengeConfirmationState): Promise<void>;
}

/** Store en memoria — para tests y para `wrangler dev` local mientras no exista el namespace de KV real. */
export class InMemoryConfirmationStore implements ConfirmationStore {
  private readonly data = new Map<ChallengeId, ChallengeConfirmationState>();

  async get(challengeId: ChallengeId): Promise<ChallengeConfirmationState | null> {
    return this.data.get(challengeId) ?? null;
  }

  async put(challengeId: ChallengeId, state: ChallengeConfirmationState): Promise<void> {
    this.data.set(challengeId, state);
  }
}

export interface RegisterConfirmationResult {
  accepted: boolean;
  reason?: "invalid-wallet";
  consensusReached: boolean;
  alreadyTriggered: boolean;
  winner?: WalletAddress;
}

const emptyState = (threshold: number): ChallengeConfirmationState => ({
  votes: {},
  consensusTriggeredFor: null,
  threshold,
});

export async function registerConfirmation(
  store: ConfirmationStore,
  challengeId: ChallengeId,
  walletAddress: WalletAddress | null | undefined,
  proposedWinner: WalletAddress,
  threshold: number,
): Promise<RegisterConfirmationResult> {
  // Guardia de W2.2: sin wallet verificable, rechazo explícito. Nunca se infiere ni se asume una dirección.
  if (!walletAddress || walletAddress.trim() === "") {
    return { accepted: false, reason: "invalid-wallet", consensusReached: false, alreadyTriggered: false };
  }

  // El umbral se fija con la primera confirmación del reto y no se vuelve a tocar después,
  // aunque una llamada posterior pase un valor distinto — evita que el umbral "flote" a mitad de reto.
  const state = (await store.get(challengeId)) ?? emptyState(threshold);

  // El consenso se dispara una sola vez por reto — confirmaciones posteriores no lo vuelven a disparar.
  if (state.consensusTriggeredFor) {
    return {
      accepted: true,
      consensusReached: false,
      alreadyTriggered: true,
      winner: state.consensusTriggeredFor,
    };
  }

  // Un wallet solo tiene un voto vigente — confirmar de nuevo reemplaza el voto anterior, no lo duplica.
  const votes: Record<WalletAddress, WalletAddress> = { ...state.votes, [walletAddress]: proposedWinner };

  const counts = new Map<WalletAddress, number>();
  for (const candidate of Object.values(votes)) {
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }

  // Usa el umbral persistido (state.threshold), no el parámetro de esta llamada puntual —
  // el umbral se fija con la primera confirmación y no puede cambiar después. Si se usara el
  // parámetro, una llamada posterior con un threshold distinto podría disparar consenso para
  // un candidato que no es el que realmente cruzó el umbral fijado originalmente.
  let winner: WalletAddress | undefined;
  for (const [candidate, count] of counts) {
    if (count >= state.threshold) {
      winner = candidate;
      break;
    }
  }

  await store.put(challengeId, { votes, consensusTriggeredFor: winner ?? null, threshold: state.threshold });

  return { accepted: true, consensusReached: Boolean(winner), alreadyTriggered: false, winner };
}

/** Aplica un cambio al estado guardado; si el reto no tiene estado, no inventa uno. */
async function actualizarEstado(
  store: ConfirmationStore,
  challengeId: ChallengeId,
  cambio: (estado: ChallengeConfirmationState) => ChallengeConfirmationState,
): Promise<void> {
  const state = await store.get(challengeId);
  if (!state) return;
  await store.put(challengeId, cambio(state));
}

/** La tx de resolución se transmitió. El candado de consenso sigue tomado: está en vuelo. */
export async function marcarEnviada(
  store: ConfirmationStore,
  challengeId: ChallengeId,
  txHash: string,
): Promise<void> {
  await actualizarEstado(store, challengeId, (s) => ({
    ...s,
    resolutionStatus: "enviada",
    resolutionTxHash: txHash,
  }));
}

/** Recibo exitoso y reto Resuelto: único estado que habilita anuncio e historial. */
export async function marcarConfirmada(
  store: ConfirmationStore,
  challengeId: ChallengeId,
  txHash: string,
): Promise<void> {
  await actualizarEstado(store, challengeId, (s) => ({
    ...s,
    resolutionStatus: "confirmada",
    resolutionTxHash: txHash,
  }));
}

/**
 * Cualquier error de la resolución. Libera el candado (`consensusTriggeredFor = null`)
 * y conserva los votos, así el próximo `/confirmar` recuenta y vuelve a disparar.
 */
export async function marcarFallida(store: ConfirmationStore, challengeId: ChallengeId): Promise<void> {
  await actualizarEstado(store, challengeId, (s) => ({
    ...s,
    resolutionStatus: "fallida",
    consensusTriggeredFor: null,
  }));
}

/**
 * Estado de un reto para exponer al bot/Mini App — W4.1 (docs/backend-plan.md, Fase 4).
 * Refleja exactamente lo que hay en el store al momento de la consulta, sin cachear nada.
 */
export interface ChallengeStatus {
  challengeId: ChallengeId;
  confirmationsCount: number;
  /** null si el reto todavía no recibió ninguna confirmación (no se fijó umbral todavía). */
  threshold: number | null;
  consensusReached: boolean;
  winner?: WalletAddress;
  /** Estado de la resolución on-chain, si ya se intentó. */
  resolutionStatus?: ResolutionStatus;
}

export async function getChallengeStatus(
  store: ConfirmationStore,
  challengeId: ChallengeId,
): Promise<ChallengeStatus> {
  const state = await store.get(challengeId);

  if (!state) {
    return { challengeId, confirmationsCount: 0, threshold: null, consensusReached: false };
  }

  return {
    challengeId,
    confirmationsCount: Object.keys(state.votes).length,
    threshold: state.threshold,
    consensusReached: Boolean(state.consensusTriggeredFor),
    winner: state.consensusTriggeredFor ?? undefined,
    resolutionStatus: state.resolutionStatus,
  };
}
