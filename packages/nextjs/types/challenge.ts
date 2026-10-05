/**
 * Estados alineados con IChallengePool.challengeStatus:
 * 0 Abierto → open | 1 Bloqueado → locked | 2 Resuelto → resolved | 3 Reembolsado → refunded
 */
export type ChallengeStatus =
  | "open"
  | "active"
  | "locked"
  | "resolving"
  | "resolved"
  | "refunded"
  | "cancelled";

export type OnChainStatusByte = 0 | 1 | 2 | 3;

export type ChallengeCategory = "fitness" | "learning" | "gaming" | "savings" | "other";

export type DepositStatus = "pending" | "deposited" | "confirmed" | "failed" | "refund_claimed";

export type Challenge = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  goal: string;
  /** Apuesta requerida por participante (humanos; 6 decimals on-chain) */
  amount: number;
  /** USDC por defecto; USDT soportado en UI (el pool on-chain usa el token de init). */
  currency: "USDC" | "USDT";
  /** uids Firebase de participantes */
  participants: string[];
  /** wallets unidas en Firebase (índice UI; puede crecer) */
  participantWallets: string[];
  /**
   * Wallets congeladas en createChallenge on-chain.
   * Solo estas pueden llamar deposit() en el contrato.
   */
  onChainParticipantWallets?: string[] | null;
  status: ChallengeStatus;
  /** Mirror de challengeStatus on-chain cuando exista */
  onChainStatus?: OnChainStatusByte;
  contractAddress: string;
  onChainChallengeId?: string | null;
  creatorWallet: string;
  imageUrl?: string;
  createdAt: number;
  /** Deadline ms (UI); on-chain usa segundos */
  deadline: number;
  poolTotal?: number;
  depositedCount?: number;
  minParticipants?: number;
  maxParticipants?: number;
  /** Commission bps — default 500 = 5% (IChallengePool) */
  commissionBps?: number;
  commission?: number;
  totalPayout?: number;
  winnerId?: string | null;
  winnerWallet?: string | null;
  refundPerParticipant?: number;
  lockedAt?: number;
  resolvedAt?: number;
  refundedAt?: number;
  public?: boolean;
  chainId?: number;
  txHash?: string | null;
};

export type ChallengeParticipant = {
  userId: string;
  challengeId: string;
  joinedAt: number;
  walletAddress: string;
  depositStatus: DepositStatus;
  confirmed: boolean;
  username?: string;
  depositAmount?: number;
  depositedAt?: number;
  refundClaimed?: boolean;
  refundClaimedAt?: number;
  onChainTxHash?: string | null;
};

export const STATUS_LABELS: Record<ChallengeStatus, string> = {
  open: "Abierto",
  active: "Abierto",
  locked: "Bloqueado",
  resolving: "Resolviendo",
  resolved: "Resuelto",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
};

export function toOnChainStatus(status: ChallengeStatus): OnChainStatusByte {
  if (status === "locked") return 1;
  if (status === "resolved") return 2;
  if (status === "refunded") return 3;
  return 0;
}

/** Labels IChallengePool.challengeStatus (0–3). Fuente única — no duplicar en UI. */
export function getChallengeStatusLabel(status: number | OnChainStatusByte | ChallengeStatus): string {
  if (typeof status === "string") {
    return STATUS_LABELS[status] ?? status;
  }
  switch (status) {
    case 0:
      return "Abierto";
    case 1:
      return "Bloqueado";
    case 2:
      return "Resuelto";
    case 3:
      return "Reembolsado";
    default:
      return "Desconocido";
  }
}

export function isJoinable(status: ChallengeStatus): boolean {
  return status === "open" || status === "active";
}

export function isDepositable(status: ChallengeStatus): boolean {
  return status === "open" || status === "active";
}
