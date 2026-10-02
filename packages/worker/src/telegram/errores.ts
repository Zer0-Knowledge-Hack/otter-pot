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
  if (typeof data !== "string" || !HEX_DATA.test(data) || data.length < 10) return null;
  try {
    const decodificado = decodeErrorResult({ abi: CHALLENGE_POOL_ERRORS_ABI, data: data as `0x${string}` });
    return decodificado.errorName ?? null;
  } catch {
    return null;
  }
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
  const nombre = nombreDeErrorDeContrato(error);
  if (nombre) {
    const mensaje = MENSAJES[nombre];
    if (mensaje) return mensaje;
    return `El contrato rechazó la operación (${nombre}).`;
  }
  return error instanceof Error ? error.message : String(error);
}
