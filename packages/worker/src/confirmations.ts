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

export interface ChallengeConfirmationState {
  /** wallet que confirmó -> ganador que propuso. Un wallet solo puede tener un voto vigente. */
  votes: Record<WalletAddress, WalletAddress>;
  /** ganador para el que ya se disparó consenso, o null si todavía no se alcanzó. */
  consensusTriggeredFor: WalletAddress | null;
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

const emptyState = (): ChallengeConfirmationState => ({ votes: {}, consensusTriggeredFor: null });

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

  const state = (await store.get(challengeId)) ?? emptyState();

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

  let winner: WalletAddress | undefined;
  for (const [candidate, count] of counts) {
    if (count >= threshold) {
      winner = candidate;
      break;
    }
  }

  await store.put(challengeId, { votes, consensusTriggeredFor: winner ?? null });

  return { accepted: true, consensusReached: Boolean(winner), alreadyTriggered: false, winner };
}
