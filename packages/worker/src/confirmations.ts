/**
 * Tipos compartidos del consenso — W2.1 (docs/backend-plan.md, Fase 2), reubicados en #26.
 *
 * El conteo ya no vive acá: ahora es un ledger durable por reto (`./consensus`), con
 * transiciones puras (`./consensus/core`) y una puerta única (`ConsensusGateway`).
 * Este módulo solo re-exporta los tipos que el resto del worker ya importaba.
 *
 * W2.2 (identidad de quien confirma) sigue bloqueado por coordinación con el
 * frontend — ver docs/backend-plan.md#pendientes. Lo único que el ledger puede
 * garantizar hoy es la mitad que le toca: nunca acepta un voto sin una
 * wallet explícita, nunca la asume ni la infiere.
 */

export type {
  ChallengeId,
  ChallengeStatus,
  Phase,
  WalletAddress,
} from "./consensus/core";
export type { ConsensusGateway } from "./consensus/gateway";
