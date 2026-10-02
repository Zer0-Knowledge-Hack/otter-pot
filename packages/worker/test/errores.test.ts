import { describe, expect, it } from "vitest";
import { encodeErrorResult } from "viem";
import { CHALLENGE_POOL_ERRORS_ABI, describirErrorDeContrato, nombreDeErrorDeContrato } from "../src/telegram/errores";

/** Error con la forma que arma viem cuando el nodo devuelve un custom error. */
function errorDeViem(errorName: string): Error {
  const error = new Error(
    `The contract function "createChallenge" reverted.\n\nError: ${errorName}()`,
  ) as Error & { name: string; data: { errorName: string } };
  error.name = "ContractFunctionRevertedError";
  error.data = { errorName };
  return error;
}

/** Error envuelto, como llega realmente al handler: causa anidada. */
function errorEnvuelto(errorName: string): Error {
  const externo = new Error(
    'The contract function "confirmResult" reverted.',
  ) as Error & { cause?: unknown };
  externo.name = "ContractFunctionExecutionError";
  externo.cause = errorDeViem(errorName);
  return externo;
}

describe("decodificación de custom errors del ChallengePool", () => {
  it("lee el nombre del error de la causa anidada de viem", () => {
    expect(nombreDeErrorDeContrato(errorEnvuelto("WinnerNotParticipant"))).toBe("WinnerNotParticipant");
  });

  it("lee el nombre del error cuando viene plano", () => {
    expect(nombreDeErrorDeContrato(errorDeViem("NotAnOperator"))).toBe("NotAnOperator");
  });

  it("cae al texto del mensaje cuando no hay datos estructurados", () => {
    expect(nombreDeErrorDeContrato(new Error("execution reverted: ChallengeNotLocked"))).toBe(
      "ChallengeNotLocked",
    );
    expect(
      nombreDeErrorDeContrato(new Error(`reverted with custom error 'AlreadyDeposited()'`)),
    ).toBe("AlreadyDeposited");
  });

  it("no inventa un nombre cuando el error no es del contrato", () => {
    expect(nombreDeErrorDeContrato(new Error("fetch failed"))).toBeNull();
    expect(nombreDeErrorDeContrato(undefined)).toBeNull();
  });

  /** El reto puede seguir apuntando al contrato Rust en Arbitrum, que revierte con byte-strings. */
  it("traduce también los revert-strings del contrato Rust/Stylus", () => {
    expect(nombreDeErrorDeContrato(new Error("execution reverted: not_an_operator"))).toBe(
      "NotAnOperator",
    );
    expect(nombreDeErrorDeContrato(new Error("execution reverted: winner_not_participant"))).toBe(
      "WinnerNotParticipant",
    );
  });

  it("el ABI de errores cubre cada custom error declarado en el contrato", () => {
    const nombres = CHALLENGE_POOL_ERRORS_ABI.map((e) => e.name).sort();
    expect(nombres).toEqual(
      [
        "AlreadyClaimed",
        "AlreadyDeposited",
        "ChallengeNotLocked",
        "ChallengeNotOpen",
        "DeadlineNotReached",
        "DepositExceedsMaximum",
        "DuplicateParticipant",
        "NoParticipants",
        "NotAParticipant",
        "NotAnOperator",
        "NotOwner",
        "NotRefunded",
        "OperatorIsZeroAddress",
        "ParticipantIsZeroAddress",
        "Reentrancy",
        "TransferFailed",
        "WinnerIsZeroAddress",
        "WinnerNotParticipant",
        "ZeroDeposit",
      ].sort(),
    );
  });

  it("decodifica un error crudo ABI-encoded con el ABI de errores", () => {
    const data = encodeErrorResult({ abi: CHALLENGE_POOL_ERRORS_ABI, errorName: "DuplicateParticipant" });
    const error = new Error("reverted") as Error & { data: string };
    error.data = data;
    expect(nombreDeErrorDeContrato(error)).toBe("DuplicateParticipant");
  });
});

describe("mensajes legibles para el usuario de Telegram", () => {
  it("DuplicateParticipant explica que hay una wallet repetida", () => {
    const mensaje = describirErrorDeContrato(errorDeViem("DuplicateParticipant"));
    expect(mensaje).toMatch(/repetid/i);
    expect(mensaje).not.toMatch(/DuplicateParticipant/);
  });

  it("ParticipantIsZeroAddress explica que una wallet no es válida", () => {
    const mensaje = describirErrorDeContrato(errorDeViem("ParticipantIsZeroAddress"));
    expect(mensaje).toMatch(/wallet/i);
    expect(mensaje).not.toMatch(/ParticipantIsZeroAddress/);
  });

  it("traduce el resto de los errores del ciclo de vida", () => {
    expect(describirErrorDeContrato(errorEnvuelto("DeadlineNotReached"))).toMatch(/plazo/i);
    expect(describirErrorDeContrato(errorEnvuelto("AlreadyDeposited"))).toMatch(/depositaste|depósito/i);
    expect(describirErrorDeContrato(errorEnvuelto("NotAnOperator"))).toMatch(/operador/i);
    expect(describirErrorDeContrato(errorEnvuelto("WinnerNotParticipant"))).toMatch(/participante/i);
  });

  it("un error que no es del contrato se devuelve tal cual, sin inventar traducción", () => {
    expect(describirErrorDeContrato(new Error("fetch failed"))).toBe("fetch failed");
  });

  it("un valor que no es Error se vuelve texto en vez de romper", () => {
    expect(describirErrorDeContrato("algo raro")).toBe("algo raro");
  });
});
