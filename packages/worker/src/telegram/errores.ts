/**
 * Traducción de los errores del `ChallengePool` a mensajes que un humano pueda leer.
 *
 * Por qué existe: el contrato Solidity desplegado en Arc
 * (`packages/arc/src/ChallengePool.sol`) revierte con *custom errors*
 * (`DuplicateParticipant()`, `NotAnOperator()`, …), no con strings. Sin decodificar,
 * al usuario de Telegram le llegaba un volcado del estilo
 * «The contract function "createChallenge" reverted. Error: DuplicateParticipant()»,
 * que no le dice qué hacer.
 *
 * El contrato Rust/Stylus que sigue vivo en Arbitrum revierte con byte-strings
 * (`not_an_operator`). Ambas formas se mapean al mismo nombre canónico, así que el
 * worker puede apuntar a cualquiera de las dos cadenas sin cambiar los mensajes.
 */

import { decodeErrorResult, parseAbi } from "viem";
import type { Hex } from "viem";

// ─── Errores tipados de la transacción ───────────────────────────────────────

/** Escrituras que el worker firma con la cuenta operadora. */
export type OperacionDeEscritura = "confirmResult" | "createChallenge" | "refund";

const NOMBRE_DE_OPERACION: Record<OperacionDeEscritura, string> = {
  confirmResult: "resolución del reto",
  createChallenge: "creación del reto",
  refund: "reembolso del reto",
};

/** La tx se minó pero con `receipt.status === "reverted"`. */
export class TransaccionRevertidaError extends Error {
  constructor(
    readonly operacion: OperacionDeEscritura,
    readonly txHash: Hex,
  ) {
    super(`La transacción de ${operacion} fue revertida por la cadena (${txHash})`);
    this.name = "TransaccionRevertidaError";
  }
}

/** La tx se minó con éxito pero el contrato no reporta el reto como Resuelto. */
export class RetoNoResueltoError extends Error {
  constructor(
    readonly challengeId: bigint,
    readonly estadoObservado: number,
    readonly txHash: Hex,
  ) {
    super(`El reto ${challengeId} quedó en el estado ${estadoObservado} en vez de Resuelto (${txHash})`);
    this.name = "RetoNoResueltoError";
  }
}

/** Falló el envío, la espera del recibo (RPC, timeout) o la relectura posterior. */
export class EnvioFallidoError extends Error {
  readonly cause: unknown;

  constructor(
    readonly operacion: OperacionDeEscritura,
    cause: unknown,
  ) {
    super(`Falló el envío de ${operacion}: ${textoDeCausa(cause)}`);
    this.name = "EnvioFallidoError";
    this.cause = cause;
  }
}

/** Texto corto de una causa: prefiere el `shortMessage` de viem al volcado largo. */
function textoDeCausa(causa: unknown): string {
  if (typeof causa === "object" && causa !== null) {
    const corto = (causa as { shortMessage?: unknown }).shortMessage;
    if (typeof corto === "string" && corto !== "") return corto;
  }
  return causa instanceof Error ? causa.message : String(causa);
}

/**
 * ABI de los custom errors del contrato. Verificado contra
 * `packages/arc/abi/ChallengePool.json` (el ABI exportado del deployment) y
 * `packages/arc/src/ChallengePool.sol`.
 */
export const CHALLENGE_POOL_ERRORS_ABI = parseAbi([
  "error NotOwner()",
  "error NotAnOperator()",
  "error NotAParticipant()",
  "error AlreadyDeposited()",
  "error ChallengeNotOpen()",
  "error ChallengeNotLocked()",
  "error WinnerIsZeroAddress()",
  "error WinnerNotParticipant()",
  "error DeadlineNotReached()",
  "error NotRefunded()",
  "error AlreadyClaimed()",
  "error NoParticipants()",
  "error DuplicateParticipant()",
  "error ParticipantIsZeroAddress()",
  "error ZeroDeposit()",
  "error DepositExceedsMaximum()",
  "error OperatorIsZeroAddress()",
  "error TransferFailed()",
  "error Reentrancy()",
] as const);

const NOMBRES: ReadonlySet<string> = new Set<string>(CHALLENGE_POOL_ERRORS_ABI.map((e) => e.name));

/** Revert-strings del contrato Rust/Stylus → nombre canónico del custom error. */
const ALIAS_STYLUS: Record<string, string> = {
  not_owner: "NotOwner",
  not_an_operator: "NotAnOperator",
  not_a_participant: "NotAParticipant",
  already_deposited: "AlreadyDeposited",
  challenge_not_open: "ChallengeNotOpen",
  challenge_not_locked: "ChallengeNotLocked",
  winner_is_zero_address: "WinnerIsZeroAddress",
  winner_not_participant: "WinnerNotParticipant",
  deadline_not_reached: "DeadlineNotReached",
  not_refunded: "NotRefunded",
  already_claimed: "AlreadyClaimed",
  no_participants: "NoParticipants",
  zero_deposit: "ZeroDeposit",
  deposit_exceeds_maximum: "DepositExceedsMaximum",
  // El Rust valida el monto exacto; el Solidity ya no puede fallar así porque
  // el `transferFrom` mueve exactamente `requiredDeposit`.
  incorrect_deposit_amount: "AlreadyDeposited",

  // Códigos cortos que el contrato Stylus emite de verdad (`Err(Vec<u8>)`), tomados
  // de `challenge_pool/src/{lib,logic}.rs` y `treasury_vault`. Los nombres largos de
  // arriba no se emiten nunca; se conservan por compatibilidad.
  no_op: "NotAnOperator",
  nopart: "ParticipantsMissingOrNotParticipant",
  dep0: "ZeroDeposit",
  depmax: "DepositExceedsMaximum",
  pay: "TransferFailed",
  refpay: "TransferFailed",
  pull: "TransferFailed",
  vred: "TreasuryCallFailed",
  vdep: "TreasuryCallFailed",
  appr: "TreasuryCallFailed",
  noref: "NotRefunded",
  inited: "AlreadyInitialized",
  vault0: "VaultIsZeroAddress",
  notopen: "ChallengeNotOpen",
  notlocked: "ChallengeNotLocked",
  deposited: "AlreadyDeposited",
  incdep: "IncorrectDeposit",
  winzero: "WinnerIsZeroAddress",
  winpart: "WinnerNotParticipant",
  nodln: "DeadlineNotReached",
  claimed: "AlreadyClaimed",
  operator_is_zero: "OperatorIsZeroAddress",
};

/** Mensaje para el usuario. Explica qué pasó y, cuando aplica, qué hacer. */
const MENSAJES: Record<string, string> = {
  DuplicateParticipant:
    "Hay una wallet repetida entre los participantes: cada persona puede estar una sola vez en el reto. Sacá el duplicado y volvé a abrirlo.",
  ParticipantIsZeroAddress:
    "Uno de los participantes no tiene una wallet válida vinculada. Que vuelva a vincularla con /wallet antes de abrir el reto.",
  NoParticipants: "El reto no tiene participantes.",
  ZeroDeposit: "El depósito tiene que ser mayor que cero.",
  DepositExceedsMaximum: "El depósito supera el máximo permitido por el contrato (10.000 USDC por cabeza).",
  ChallengeNotOpen: "El reto ya no admite depósitos: o está completo o ya se resolvió.",
  ChallengeNotLocked:
    "El reto no está bloqueado: falta que todos depositen, o ya se resolvió o se reembolsó.",
  AlreadyDeposited: "Ya depositaste en este reto.",
  NotAParticipant: "No sos participante de este reto.",
  NotAnOperator:
    "La cuenta operadora del bot no está autorizada en el contrato. Avisale al equipo: falta un addOperator.",
  NotOwner: "Esa operación es solo del dueño del contrato.",
  WinnerNotParticipant:
    "El ganador propuesto no es participante del reto, así que el contrato rechazó la resolución.",
  WinnerIsZeroAddress: "El ganador no tiene una wallet válida vinculada.",
  DeadlineNotReached: "Todavía no venció el plazo del reto, así que no se puede reembolsar.",
  NotRefunded: "El reto no está reembolsado, no hay nada que reclamar.",
  AlreadyClaimed: "Ya reclamaste tu parte de este reembolso.",
  OperatorIsZeroAddress: "La dirección del operador no es válida.",
  TransferFailed: "La transferencia de USDC falló. Revisá el saldo y el approve del token.",
  Reentrancy: "El contrato rechazó una llamada reentrante.",
  // `nopart` lo emiten tanto la creación (lista de participantes vacía) como el
  // reclamo (quien reclama no participa): no hay un único equivalente Solidity.
  ParticipantsMissingOrNotParticipant:
    "El reto no tiene participantes válidos, o la wallet que intentó la operación no participa en él.",
  TreasuryCallFailed: "Falló la llamada a la tesorería del contrato. Probá de nuevo más tarde o avisale al equipo.",
  AlreadyInitialized: "El contrato ya estaba inicializado.",
  VaultIsZeroAddress: "La dirección de la tesorería no es válida.",
  IncorrectDeposit: "El monto del depósito no coincide con el que exige el reto.",
};

/** `execution reverted: Nombre` o `reverted with custom error 'Nombre()'`. */
const NOMBRE_EN_TEXTO = /(?:custom error\s*'?|reverted:?\s*|Error:\s*)([A-Za-z_][A-Za-z0-9_]*)\s*\(?/g;

const HEX_DATA = /^0x[0-9a-fA-F]*$/;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function canonizar(nombre: string): string | null {
  if (NOMBRES.has(nombre)) return nombre;
  const alias = ALIAS_STYLUS[nombre.toLowerCase()];
  return alias ?? null;
}

/** Intenta decodificar los bytes crudos del revert con el ABI de errores. */
function desdeData(data: unknown): string | null {
  if (typeof data !== "string" || !HEX_DATA.test(data) || data.length < 4) return null;
  if (data.length >= 10) {
    try {
      const decodificado = decodeErrorResult({ abi: CHALLENGE_POOL_ERRORS_ABI, data: data as `0x${string}` });
      if (decodificado.errorName) return decodificado.errorName;
    } catch {
      // No es un custom error ABI-encoded: puede ser un código ASCII corto de Stylus.
    }
  }
  return desdeAscii(data);
}

/** Máximo de bytes de un código corto de Stylus que se intenta leer como texto. */
const MAX_BYTES_CODIGO_CORTO = 32;
const CODIGO_CORTO = /^[a-z0-9_]+$/;

/**
 * Los reverts de Stylus (`Err(Vec<u8>)`) llevan los bytes ASCII del código, por ejemplo
 * `0x6e6f5f6f70` = `no_op`, que `decodeErrorResult` no puede leer. Solo se acepta texto
 * corto y claramente imprimible; cualquier otra cosa se descarta.
 */
function desdeAscii(data: string): string | null {
  const hex = data.slice(2);
  if (hex.length === 0 || hex.length % 2 !== 0 || hex.length > MAX_BYTES_CODIGO_CORTO * 2) return null;
  let texto = "";
  for (let i = 0; i < hex.length; i += 2) {
    texto += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return CODIGO_CORTO.test(texto) ? texto : null;
}

/**
 * Nombre canónico del error del contrato, o `null` si el error no viene del contrato.
 *
 * Recorre la cadena de causas de viem (`ContractFunctionExecutionError` envuelve a
 * `ContractFunctionRevertedError`) buscando datos estructurados, y solo al final cae
 * al texto del mensaje. Nunca inventa: si no reconoce el nombre, devuelve `null`.
 */
export function nombreDeErrorDeContrato(error: unknown): string | null {
  const textos: string[] = [];
  let actual: unknown = error;

  for (let profundidad = 0; esObjeto(actual) && profundidad < 10; profundidad++) {
    const data = actual.data;

    // viem expone `{ data: { errorName, args } }` en ContractFunctionRevertedError.
    if (esObjeto(data) && typeof data.errorName === "string") {
      const canonico = canonizar(data.errorName);
      if (canonico) return canonico;
    }

    // Algunos transportes solo devuelven los bytes del revert.
    const desdeBytes = desdeData(data);
    if (desdeBytes) {
      const canonico = canonizar(desdeBytes);
      if (canonico) return canonico;
    }

    if (typeof actual.errorName === "string") {
      const canonico = canonizar(actual.errorName);
      if (canonico) return canonico;
    }

    if (typeof actual.message === "string") textos.push(actual.message);
    if (typeof actual.shortMessage === "string") textos.push(actual.shortMessage);

    actual = actual.cause;
  }

  // Último recurso: el nombre suele estar escrito en el mensaje.
  for (const texto of textos) {
    NOMBRE_EN_TEXTO.lastIndex = 0;
    let match = NOMBRE_EN_TEXTO.exec(texto);
    while (match !== null) {
      const capturado = match[1];
      const canonico = capturado === undefined ? null : canonizar(capturado);
      if (canonico) return canonico;
      match = NOMBRE_EN_TEXTO.exec(texto);
    }
  }

  return null;
}

/**
 * Mensaje listo para mandarle al usuario.
 *
 * Si el error no es del contrato (red caída, RPC, gas) se devuelve su texto tal cual:
 * traducir a ciegas escondería la causa real.
 */
export function describirErrorDeContrato(error: unknown): string {
  if (error instanceof TransaccionRevertidaError) {
    return (
      `La cadena revirtió la transacción de ${NOMBRE_DE_OPERACION[error.operacion]} ` +
      `(tx ${error.txHash}), así que no se aplicó ningún cambio.`
    );
  }
  if (error instanceof RetoNoResueltoError) {
    return (
      `La transacción se minó, pero el contrato no marca el reto como resuelto ` +
      `(estado observado: ${error.estadoObservado}). Tx ${error.txHash}.`
    );
  }
  const nombre = nombreDeErrorDeContrato(error);
  if (nombre) {
    const mensaje = MENSAJES[nombre];
    if (mensaje) return mensaje;
    return `El contrato rechazó la operación (${nombre}).`;
  }
  if (error instanceof EnvioFallidoError) {
    return `No pude enviar la transacción: ${textoDeCausa(error.cause)}`;
  }
  return error instanceof Error ? error.message : String(error);
}
