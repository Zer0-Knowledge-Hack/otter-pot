import {
  ref,
  set,
  get,
  update,
  remove,
  push,
  onValue,
  query,
  orderByChild,
  limitToLast,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import { db, isFirebaseConfigured } from "./firebase.config";
import { bumpLeaderboardOnCreate, bumpLeaderboardOnWin } from "./realtime";
import type {
  Challenge,
  ChallengeCategory,
  ChallengeParticipant,
  OnChainStatusByte,
} from "~~/types/challenge";
import { isDepositable, isJoinable, toOnChainStatus } from "~~/types/challenge";
import { CHALLENGE_POOL_ADDRESS, DEFAULT_STABLE, type StableSymbol } from "~~/contracts/config";

const DEFAULT_COMMISSION_BPS = 500; // 5% — IChallengePool
const DEFAULT_MIN_PARTICIPANTS = 2;
const DEFAULT_MAX_PARTICIPANTS = 20;

function requireDb(): Database {
  if (!db || !isFirebaseConfigured) {
    throw new Error(
      "otter-pot no está configurado.",
    );
  }
  return db;
}

function challengeRef(id: string) {
  return ref(requireDb(), `challenges/${id}`);
}

function participantsRef(challengeId: string) {
  return ref(requireDb(), `challengeParticipants/${challengeId}`);
}

function participantRef(challengeId: string, userId: string) {
  return ref(requireDb(), `challengeParticipants/${challengeId}/${userId}`);
}

async function writeActivity(
  userId: string,
  id: string,
  data: {
    type: string;
    title: string;
    body?: string;
    challengeId: string;
  },
) {
  await set(ref(requireDb(), `activity/${userId}/${id}`), {
    id,
    userId,
    ...data,
    createdAt: Date.now(),
  });
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  const snap = await get(challengeRef(id));
  return snap.exists() ? (snap.val() as Challenge) : null;
}

export async function getParticipants(challengeId: string): Promise<ChallengeParticipant[]> {
  const snap = await get(participantsRef(challengeId));
  if (!snap.exists()) return [];
  return Object.values(snap.val() as Record<string, ChallengeParticipant>);
}

export async function createChallengeInFirebase(input: {
  ownerId: string;
  creatorWallet: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  goal: string;
  amount: number;
  deadline: number;
  chainId?: number;
  imageUrl?: string;
  username?: string;
  minParticipants?: number;
  maxParticipants?: number;
  public?: boolean;
  currency?: StableSymbol;
  onChainChallengeId?: string | null;
  txHash?: string | null;
  contractAddress?: string;
  /** Wallets invitadas (además del creador) */
  invitedWallets?: string[];
  /** Lista exacta enviada a createChallenge (si ya confirmó on-chain) */
  onChainParticipantWallets?: string[];
}): Promise<Challenge> {
  const challengesRef = ref(requireDb(), "challenges");
  const newRef = push(challengesRef);
  const id = newRef.key!;
  const wallet = input.creatorWallet.toLowerCase();
  const invited = (input.invitedWallets || [])
    .map(w => w.toLowerCase())
    .filter(w => w && w !== wallet);
  const allWallets = [wallet, ...invited];
  const linked = Boolean(input.onChainChallengeId);
  const frozen = (input.onChainParticipantWallets || (linked ? allWallets : [])).map(w =>
    w.toLowerCase(),
  );

  const challenge: Challenge = {
    id,
    ownerId: input.ownerId,
    creatorWallet: input.creatorWallet,
    title: input.title,
    description: input.description,
    category: input.category,
    goal: input.goal,
    amount: input.amount,
    currency: input.currency || DEFAULT_STABLE,
    participants: [input.ownerId],
    participantWallets: allWallets,
    onChainParticipantWallets: linked && frozen.length ? frozen : null,
    status: linked ? "active" : "open",
    onChainStatus: 0,
    contractAddress: input.contractAddress || CHALLENGE_POOL_ADDRESS || "",
    onChainChallengeId: input.onChainChallengeId ?? null,
    imageUrl: input.imageUrl || "",
    createdAt: Date.now(),
    deadline: input.deadline,
    poolTotal: 0,
    depositedCount: 0,
    minParticipants: input.minParticipants ?? DEFAULT_MIN_PARTICIPANTS,
    maxParticipants: input.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS,
    commissionBps: DEFAULT_COMMISSION_BPS,
    public: input.public ?? true,
    chainId: input.chainId || 421614,
    txHash: input.txHash ?? null,
  };

  await set(newRef, challenge);

  const participant: ChallengeParticipant = {
    userId: input.ownerId,
    challengeId: id,
    joinedAt: Date.now(),
    walletAddress: input.creatorWallet,
    depositStatus: "pending",
    confirmed: false,
    username: input.username,
    depositAmount: 0,
  };
  await set(participantRef(id, input.ownerId), participant);

  await writeActivity(input.ownerId, `${id}_created`, {
    type: "challenge_created",
    title: "Reto creado",
    body: input.title,
    challengeId: id,
  });

  try {
    await bumpLeaderboardOnCreate(input.ownerId, input.username);
  } catch (err) {
    console.warn("Leaderboard bump failed", err);
  }

  return challenge;
}

export async function linkChallengeOnChain(
  challengeId: string,
  data: {
    onChainChallengeId: string;
    contractAddress: string;
    txHash?: string;
    /** Lista exacta enviada a createChallenge — inmutable para depósitos */
    onChainParticipantWallets: string[];
  },
) {
  const wallets = data.onChainParticipantWallets.map(w => w.toLowerCase());
  await update(challengeRef(challengeId), {
    onChainChallengeId: data.onChainChallengeId,
    contractAddress: data.contractAddress,
    onChainParticipantWallets: wallets,
    status: "active",
    onChainStatus: 0,
    txHash: data.txHash || null,
    linkedAt: Date.now(),
  });
}

/** Sincroniza status Firebase desde challengeStatus on-chain (post-tx / reload). */
export async function syncChallengeStatusFromChain(
  challengeId: string,
  onChainStatus: OnChainStatusByte,
) {
  const status =
    onChainStatus === 1
      ? "locked"
      : onChainStatus === 2
        ? "resolved"
        : onChainStatus === 3
          ? "refunded"
          : "active";
  await update(challengeRef(challengeId), {
    onChainStatus,
    status,
  });
}

/**
 * Unirse al reto en Firebase (índice UI / lista de wallets).
 * - Antes de createChallenge: cualquiera con el link puede unirse (hasta max).
 * - Después: solo wallets congeladas en onChainParticipantWallets.
 * El contrato NO tiene join(); Unirme solo prepara la lista para createChallenge/deposit.
 */
export async function joinChallenge(input: {
  challengeId: string;
  userId: string;
  walletAddress: string;
  username?: string;
}): Promise<ChallengeParticipant> {
  const challenge = await getChallenge(input.challengeId);
  if (!challenge) throw new Error("Reto no encontrado");
  if (!isJoinable(challenge.status)) {
    throw new Error("Este reto ya no acepta participantes (no está Abierto)");
  }
  if (Date.now() > challenge.deadline) {
    throw new Error("El deadline ya pasó. Usa reembolso si aplica.");
  }

  const wallet = input.walletAddress.toLowerCase();

  // Si ya hay Challenge ID on-chain, la lista está congelada
  if (challenge.onChainChallengeId) {
    const frozen = (challenge.onChainParticipantWallets || []).map(w => w.toLowerCase());
    if (frozen.length > 0 && !frozen.includes(wallet)) {
      throw new Error(
        "Este reto ya cerró la lista on-chain. Tu wallet no estaba en createChallenge. Pide un link de un reto nuevo (o únete antes de que el creador abra pagos).",
      );
    }
  }

  const max = challenge.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS;
  const current = challenge.participants || [];
  if (current.includes(input.userId)) {
    const existing = await get(participantRef(input.challengeId, input.userId));
    if (existing.exists()) return existing.val() as ChallengeParticipant;
  }
  if (current.length >= max) throw new Error(`Cupo lleno (máx. ${max})`);

  const wallets = (challenge.participantWallets || []).map(w => w.toLowerCase());
  const alreadyJoined = await getParticipants(input.challengeId);
  const walletTakenByOther = alreadyJoined.find(
    p => p.walletAddress?.toLowerCase() === wallet && p.userId !== input.userId,
  );
  if (walletTakenByOther) {
    throw new Error("Esta wallet ya está unida al reto por otro usuario");
  }

  const participant: ChallengeParticipant = {
    userId: input.userId,
    challengeId: input.challengeId,
    joinedAt: Date.now(),
    walletAddress: input.walletAddress,
    depositStatus: "pending",
    confirmed: false,
    username: input.username,
    depositAmount: 0,
  };

  // 1) Escribir participante primero (las rules del challenge lo exigen)
  await set(participantRef(input.challengeId, input.userId), participant);

  const nextParticipants = current.includes(input.userId)
    ? current
    : [...current, input.userId];
  const nextWallets = wallets.includes(wallet) ? wallets : [...wallets, wallet];

  // 2) Actualizar índices del reto (si falla por rules, el Unirme igual quedó registrado)
  try {
    await update(challengeRef(input.challengeId), {
      participants: nextParticipants,
      participantWallets: nextWallets,
    });
  } catch (err) {
    console.warn("joinChallenge: no se pudo actualizar índices del reto", err);
  }

  try {
    await writeActivity(input.userId, `${input.challengeId}_joined`, {
      type: "challenge_joined",
      title: "Te uniste al reto",
      body: challenge.title,
      challengeId: input.challengeId,
    });
  } catch (err) {
    console.warn("joinChallenge: activity", err);
  }

  return participant;
}

/**
 * Depositar apuesta (IChallengePool.deposit).
 * En Firebase-only marca USDC simulado; con contrato el UI debe llamar on-chain primero.
 */
export async function depositStake(input: {
  challengeId: string;
  userId: string;
  walletAddress: string;
  txHash?: string;
}): Promise<{ challenge: Challenge; locked: boolean }> {
  const challenge = await getChallenge(input.challengeId);
  if (!challenge) throw new Error("Reto no encontrado");
  if (!isDepositable(challenge.status)) {
    throw new Error("Solo puedes depositar mientras el reto está Abierto");
  }
  if (Date.now() > challenge.deadline) {
    throw new Error("Deadline vencido. Inicia reembolso.");
  }

  const pSnap = await get(participantRef(input.challengeId, input.userId));
  if (!pSnap.exists()) {
    throw new Error("Únete al reto antes de depositar");
  }
  const participant = pSnap.val() as ChallengeParticipant;
  if (participant.depositStatus === "deposited" || participant.depositStatus === "confirmed") {
    throw new Error("Ya depositaste en este reto");
  }

  const amount = challenge.amount;
  await update(participantRef(input.challengeId, input.userId), {
    depositStatus: "deposited",
    confirmed: true,
    depositAmount: amount,
    depositedAt: Date.now(),
    walletAddress: input.walletAddress,
    onChainTxHash: input.txHash || null,
  });

  const refreshed = await getParticipants(input.challengeId);
  const realDeposited = refreshed.filter(
    p => p.depositStatus === "deposited" || p.depositStatus === "confirmed",
  ).length;
  const poolTotal = realDeposited * amount;

  try {
    await update(challengeRef(input.challengeId), {
      depositedCount: realDeposited,
      poolTotal,
    });
  } catch (err) {
    console.warn("No se pudo actualizar contadores del reto", err);
  }

  await writeActivity(input.userId, `${input.challengeId}_deposit_${Date.now()}`, {
    type: "deposit_received",
    title: "Depósito recibido",
    body: `${amount} USDC → ${challenge.title}`,
    challengeId: input.challengeId,
  });

  // Auto-lock: todos los inscritos depositaron y hay mínimo de jugadores
  const min = challenge.minParticipants ?? DEFAULT_MIN_PARTICIPANTS;
  const everyonePaid =
    refreshed.length >= min &&
    refreshed.every(p => p.depositStatus === "deposited" || p.depositStatus === "confirmed");

  let locked = false;
  if (everyonePaid) {
    try {
      await lockChallenge(input.challengeId);
      locked = true;
    } catch (err) {
      console.warn("Auto-lock diferido (puede hacerlo el creador)", err);
    }
  }

  const updated = (await getChallenge(input.challengeId))!;
  return { challenge: updated, locked };
}

/** ¿Puede esta wallet depositar on-chain según la lista congelada del contrato? */
export function canWalletDepositOnChain(
  challenge: Challenge,
  wallet: string | undefined | null,
): boolean {
  if (!wallet) return false;
  if (!challenge.onChainChallengeId) return false;
  const w = wallet.toLowerCase();
  const frozen = (challenge.onChainParticipantWallets || []).map(x => x.toLowerCase());
  if (frozen.length > 0) return frozen.includes(w);
  // Fallback: invitados guardados al crear (antes de linkear lista explícita)
  const invited = (challenge.participantWallets || []).map(x => x.toLowerCase());
  if (invited.length > 0) return invited.includes(w);
  return (challenge.creatorWallet || "").toLowerCase() === w;
}

/** ChallengeLocked — pozo cerrado, listo para confirmResult */
export async function lockChallenge(challengeId: string): Promise<Challenge> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) throw new Error("Reto no encontrado");
  if (challenge.status === "locked") return challenge;
  if (!isDepositable(challenge.status)) {
    throw new Error("Solo se puede bloquear un reto Abierto");
  }

  const participants = await getParticipants(challengeId);
  const paid = participants.filter(
    p => p.depositStatus === "deposited" || p.depositStatus === "confirmed",
  );
  const min = challenge.minParticipants ?? DEFAULT_MIN_PARTICIPANTS;
  if (paid.length < min) {
    throw new Error(`Se necesitan al menos ${min} depósitos para bloquear`);
  }

  const poolTotal = paid.length * challenge.amount;
  await update(challengeRef(challengeId), {
    status: "locked",
    onChainStatus: 1 as OnChainStatusByte,
    poolTotal,
    depositedCount: paid.length,
    lockedAt: Date.now(),
  });

  await writeActivity(challenge.ownerId, `${challengeId}_locked`, {
    type: "challenge_locked",
    title: "Reto bloqueado",
    body: `Pozo ${poolTotal} USDC — listo para resolver`,
    challengeId,
  });

  return (await getChallenge(challengeId))!;
}

/**
 * confirmResult — operator/creador declara ganador.
 * Commission bps sobre el pozo; payout = pool - commission.
 */
export async function confirmChallengeResult(input: {
  challengeId: string;
  operatorId: string;
  winnerUserId: string;
}): Promise<Challenge> {
  const challenge = await getChallenge(input.challengeId);
  if (!challenge) throw new Error("Reto no encontrado");
  if (challenge.status !== "locked") {
    throw new Error("El reto debe estar Bloqueado para resolver (depositen todos primero)");
  }
  if (challenge.ownerId !== input.operatorId) {
    throw new Error("Solo el creador (operator off-chain) puede confirmar el resultado");
  }

  const participants = await getParticipants(input.challengeId);
  const winner = participants.find(p => p.userId === input.winnerUserId);
  if (!winner) throw new Error("El ganador debe ser un participante del reto");
  if (winner.depositStatus !== "deposited" && winner.depositStatus !== "confirmed") {
    throw new Error("El ganador debe haber depositado");
  }

  const poolTotal = challenge.poolTotal || participants.filter(
    p => p.depositStatus === "deposited" || p.depositStatus === "confirmed",
  ).length * challenge.amount;

  const bps = challenge.commissionBps ?? DEFAULT_COMMISSION_BPS;
  const commission = Math.round((poolTotal * bps) / 10000 * 100) / 100;
  const totalPayout = Math.round((poolTotal - commission) * 100) / 100;

  await update(challengeRef(input.challengeId), {
    status: "resolved",
    onChainStatus: 2 as OnChainStatusByte,
    winnerId: winner.userId,
    winnerWallet: winner.walletAddress,
    commission,
    totalPayout,
    poolTotal,
    resolvedAt: Date.now(),
  });

  await writeActivity(input.operatorId, `${input.challengeId}_resolved`, {
    type: "challenge_resolved",
    title: "Reto resuelto",
    body: `Ganador cobra ${totalPayout} USDC (comisión ${commission})`,
    challengeId: input.challengeId,
  });

  await writeActivity(winner.userId, `${input.challengeId}_won`, {
    type: "challenge_won",
    title: "¡Ganaste el reto!",
    body: `+${totalPayout} USDC`,
    challengeId: input.challengeId,
  });

  try {
    await bumpLeaderboardOnWin(winner.userId, totalPayout, winner.username);
  } catch (err) {
    console.warn("Win leaderboard bump failed", err);
  }

  return (await getChallenge(input.challengeId))!;
}

/** refund — permissionless tras deadline sin consenso (IChallengePool.refund) */
export async function refundChallenge(challengeId: string, callerId: string): Promise<Challenge> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) throw new Error("Reto no encontrado");
  if (challenge.status === "refunded") return challenge;
  if (challenge.status === "resolved") {
    throw new Error("El reto ya fue resuelto");
  }
  if (challenge.status === "cancelled") {
    throw new Error("Reto cancelado");
  }
  if (Date.now() < challenge.deadline && challenge.status === "locked") {
    // locked before deadline: only owner can force refund? Spec says permissionless after deadline
    throw new Error("Aún no vence el deadline. Espera o resuelve con un ganador.");
  }
  if (Date.now() < challenge.deadline && (challenge.status === "open" || challenge.status === "active")) {
    // allow owner cancel-style refund early if nobody locked? Spec: after deadline.
    if (challenge.ownerId !== callerId) {
      throw new Error("Antes del deadline solo el creador puede cerrar a reembolso");
    }
  }

  const participants = await getParticipants(challengeId);
  const paid = participants.filter(
    p => p.depositStatus === "deposited" || p.depositStatus === "confirmed",
  );
  if (!paid.length) {
    await update(challengeRef(challengeId), {
      status: "refunded",
      onChainStatus: 3 as OnChainStatusByte,
      refundPerParticipant: 0,
      refundedAt: Date.now(),
    });
    return (await getChallenge(challengeId))!;
  }

  // Sin comisión en reembolso (SDD §8.3)
  const refundPerParticipant = challenge.amount;

  await update(challengeRef(challengeId), {
    status: "refunded",
    onChainStatus: 3 as OnChainStatusByte,
    refundPerParticipant,
    refundedAt: Date.now(),
  });

  await writeActivity(callerId, `${challengeId}_refunded`, {
    type: "challenge_refunded",
    title: "Reto en reembolso",
    body: `${refundPerParticipant} USDC por participante`,
    challengeId,
  });

  return (await getChallenge(challengeId))!;
}

/** claimRefund — una vez por participante */
export async function claimRefund(input: {
  challengeId: string;
  userId: string;
}): Promise<ChallengeParticipant> {
  const challenge = await getChallenge(input.challengeId);
  if (!challenge) throw new Error("Reto no encontrado");
  if (challenge.status !== "refunded") {
    throw new Error("El reto aún no está en estado Reembolsado");
  }

  const pSnap = await get(participantRef(input.challengeId, input.userId));
  if (!pSnap.exists()) throw new Error("No eres participante");
  const participant = pSnap.val() as ChallengeParticipant;
  if (participant.refundClaimed) throw new Error("Ya reclamaste tu reembolso");
  if (participant.depositStatus !== "deposited" && participant.depositStatus !== "confirmed") {
    throw new Error("No hay depósito que reembolsar");
  }

  const amount = challenge.refundPerParticipant ?? challenge.amount;
  await update(participantRef(input.challengeId, input.userId), {
    refundClaimed: true,
    refundClaimedAt: Date.now(),
    depositStatus: "refund_claimed",
  });

  await writeActivity(input.userId, `${input.challengeId}_claim_${Date.now()}`, {
    type: "refund_claimed",
    title: "Reembolso reclamado",
    body: `+${amount} USDC`,
    challengeId: input.challengeId,
  });

  return {
    ...participant,
    refundClaimed: true,
    depositStatus: "refund_claimed",
  };
}

export async function cancelChallenge(challengeId: string, ownerId: string): Promise<void> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) throw new Error("Reto no encontrado");
  if (challenge.ownerId !== ownerId) throw new Error("Solo el creador puede eliminar este reto");
  if (challenge.status === "locked" || challenge.status === "resolved") {
    throw new Error("No puedes cancelar un reto bloqueado o resuelto. Usa reembolso/resolver.");
  }
  if (challenge.status === "cancelled") return;

  await update(challengeRef(challengeId), {
    status: "cancelled",
    cancelledAt: Date.now(),
  });

  await writeActivity(ownerId, `${challengeId}_cancelled`, {
    type: "challenge_cancelled",
    title: "Reto eliminado",
    body: challenge.title,
    challengeId,
  });
}

export async function deleteChallenge(challengeId: string, ownerId: string): Promise<void> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) throw new Error("Reto no encontrado");
  if (challenge.ownerId !== ownerId) throw new Error("Solo el creador puede eliminar este reto");

  await remove(challengeRef(challengeId));
  await remove(participantsRef(challengeId));
  try {
    await remove(ref(requireDb(), `activity/${ownerId}/${challengeId}_created`));
  } catch {
    // ignore
  }
}

export function challengeShareUrl(challengeId: string, origin?: string): string {
  const base =
    origin || (typeof window !== "undefined" ? window.location.origin : "https://otterpot.app");
  // Ruta estática (Firebase Hosting / output: export) — sin [id] dinámico
  return `${base}/app/challenges/view/?id=${encodeURIComponent(challengeId)}`;
}

export function challengeShareText(challenge: Challenge): string {
  return `Únete a mi reto OtterPot: "${challenge.title}" · Reto ${challenge.amount} USDC · ${challenge.goal}`;
}

export function subscribeChallenge(
  challengeId: string,
  callback: (challenge: Challenge | null) => void,
): Unsubscribe {
  if (!db || !isFirebaseConfigured) {
    callback(null);
    return () => {};
  }
  return onValue(challengeRef(challengeId), snap => {
    callback(snap.exists() ? (snap.val() as Challenge) : null);
  });
}

export function subscribeParticipants(
  challengeId: string,
  callback: (participants: ChallengeParticipant[]) => void,
): Unsubscribe {
  if (!db || !isFirebaseConfigured) {
    callback([]);
    return () => {};
  }
  return onValue(participantsRef(challengeId), snap => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    callback(Object.values(snap.val() as Record<string, ChallengeParticipant>));
  });
}

export function subscribeChallenges(callback: (challenges: Challenge[]) => void): Unsubscribe {
  if (!db || !isFirebaseConfigured) {
    callback([]);
    return () => {};
  }
  const r = query(ref(db, "challenges"), orderByChild("createdAt"), limitToLast(100));
  return onValue(
    r,
    snap => {
      if (!snap.exists()) {
        callback([]);
        return;
      }
      const raw = snap.val() as Record<string, Challenge>;
      const list = Object.values(raw)
        .filter(c => c.status !== "cancelled")
        .sort((a, b) => b.createdAt - a.createdAt);
      callback(list);
    },
    err => {
      console.error("subscribeChallenges", err);
      callback([]);
    },
  );
}

export function subscribePublicChallenges(callback: (challenges: Challenge[]) => void): Unsubscribe {
  return subscribeChallenges(all => {
    callback(
      all.filter(
        c =>
          c.public !== false &&
          (c.status === "open" || c.status === "active" || c.status === "locked"),
      ),
    );
  });
}

export function subscribeMyChallenges(
  ownerOrParticipantId: string,
  callback: (challenges: Challenge[]) => void,
): Unsubscribe {
  return subscribeChallenges(all => {
    callback(
      all.filter(
        c =>
          c.ownerId === ownerOrParticipantId || c.participants?.includes(ownerOrParticipantId),
      ),
    );
  });
}

export type ActivityItem = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  challengeId?: string;
  createdAt: number;
};

export function subscribeUserActivity(
  uid: string,
  callback: (items: ActivityItem[]) => void,
): Unsubscribe {
  if (!db || !isFirebaseConfigured) {
    callback([]);
    return () => {};
  }
  return onValue(ref(db, `activity/${uid}`), snap => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const raw = snap.val() as Record<string, ActivityItem>;
    callback(Object.values(raw).sort((a, b) => b.createdAt - a.createdAt));
  });
}

export { toOnChainStatus };
