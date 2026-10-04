import { describe, expect, it } from "vitest";
import { encodeErrorResult } from "viem";
import {
  CHALLENGE_POOL_ERRORS_ABI,
  describirErrorDeContrato,
  EnvioFallidoError,
  nombreDeErrorDeContrato,
  RetoNoResueltoError,
  TransaccionRevertidaError,
} from "../src/telegram/errores";

const HASH = "0xfeed000000000000000000000000000000000000000000000000000000000000";

/** Bytes ASCII crudos del revert de un contrato Stylus (`Err(Vec<u8>)`). */
function bytesAscii(codigo: string): string {
  return `0x${Array.from(codigo, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")}`;
}

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

describe("codigos cortos del contrato Rust/Stylus", () => {
  const CASOS: [string, string][] = [
    ["no_op", "NotAnOperator"],
    ["not_owner", "NotOwner"],
    ["nopart", "ParticipantsMissingOrNotParticipant"],
    ["dep0", "ZeroDeposit"],
    ["depmax", "DepositExceedsMaximum"],
    ["pay", "TransferFailed"],
    ["refpay", "TransferFailed"],
    ["pull", "TransferFailed"],
    ["vred", "TreasuryCallFailed"],
    ["vdep", "TreasuryCallFailed"],
    ["appr", "TreasuryCallFailed"],
    ["noref", "NotRefunded"],
    ["inited", "AlreadyInitialized"],
    ["vault0", "VaultIsZeroAddress"],
    ["notopen", "ChallengeNotOpen"],
    ["notlocked", "ChallengeNotLocked"],
    ["deposited", "AlreadyDeposited"],
    ["incdep", "IncorrectDeposit"],
    ["winzero", "WinnerIsZeroAddress"],
    ["winpart", "WinnerNotParticipant"],
    ["nodln", "DeadlineNotReached"],
    ["claimed", "AlreadyClaimed"],
    ["operator_is_zero", "OperatorIsZeroAddress"],
  ];

  it.each(CASOS)("%s en el texto del revert se canoniza como %s", (codigo, canonico) => {
    expect(nombreDeErrorDeContrato(new Error(`execution reverted: ${codigo}`))).toBe(canonico);
  });

  it.each(CASOS)("%s como bytes ASCII crudos se canoniza como %s", (codigo, canonico) => {
    const error = new Error("reverted") as Error & { data: string };
    error.data = bytesAscii(codigo);
    expect(nombreDeErrorDeContrato(error)).toBe(canonico);
  });

  it("decodifica los bytes crudos de no_op (0x6e6f5f6f70)", () => {
    const error = new Error("reverted") as Error & { data: string };
    error.data = "0x6e6f5f6f70";
    expect(nombreDeErrorDeContrato(error)).toBe("NotAnOperator");
  });

  it("un codigo corto desconocido no se inventa y cae al mensaje generico", () => {
    const error = new Error("execution reverted: zzz_desconocido") as Error & { data: string };
    error.data = bytesAscii("zzz_desconocido");
    expect(nombreDeErrorDeContrato(error)).toBeNull();
    expect(describirErrorDeContrato(error)).toBe("execution reverted: zzz_desconocido");
  });

  it("no mapea los codigos exclusivos de #19", () => {
    for (const codigo of ["ratemax", "recipient0", "bad_status", "norecover", "payfee"]) {
      expect(nombreDeErrorDeContrato(new Error(`execution reverted: ${codigo}`))).toBeNull();
    }
  });

  it("nopart tiene un unico mensaje neutral para roster vacio y no participante", () => {
    const mensaje = describirErrorDeContrato(new Error("execution reverted: nopart"));
    expect(mensaje).toMatch(/participantes/i);
    expect(mensaje).not.toMatch(/nopart/);
  });

  it("los codigos nuevos tienen un mensaje para el usuario", () => {
    for (const [codigo] of CASOS) {
      const mensaje = describirErrorDeContrato(new Error(`execution reverted: ${codigo}`));
      expect(mensaje, codigo).not.toMatch(/^execution reverted/);
      expect(mensaje, codigo).not.toMatch(/El contrato rechazó la operación \(/);
    }
  });
});

describe("errores tipados de la transaccion", () => {
  it("TransaccionRevertidaError explica que la cadena revirtio la tx e incluye el hash", () => {
    const error = new TransaccionRevertidaError("confirmResult", HASH);
    expect(error.operacion).toBe("confirmResult");
    expect(error.txHash).toBe(HASH);
    const mensaje = describirErrorDeContrato(error);
    expect(mensaje).toMatch(/revirti/i);
    expect(mensaje).toContain(HASH);
  });

  it("RetoNoResueltoError explica que el reto no quedo resuelto y muestra el estado", () => {
    const error = new RetoNoResueltoError(7n, 1, HASH);
    expect(error.challengeId).toBe(7n);
    expect(error.estadoObservado).toBe(1);
    const mensaje = describirErrorDeContrato(error);
    expect(mensaje).toMatch(/resuelto/i);
    expect(mensaje).toContain("1");
  });

  it("EnvioFallidoError sin nombre de contrato dice que no pudo enviar y muestra la causa", () => {
    const causa = Object.assign(new Error("largo"), { shortMessage: "HTTP request failed" });
    const mensaje = describirErrorDeContrato(new EnvioFallidoError("confirmResult", causa));
    expect(mensaje).toBe("No pude enviar la transacción: HTTP request failed");
  });

  it("EnvioFallidoError usa el mensaje del contrato cuando la causa es un revert conocido", () => {
    const mensaje = describirErrorDeContrato(new EnvioFallidoError("confirmResult", errorEnvuelto("NotAnOperator")));
    expect(mensaje).toMatch(/operador/i);
  });

  it("nombreDeErrorDeContrato recorre la causa de EnvioFallidoError", () => {
    expect(nombreDeErrorDeContrato(new EnvioFallidoError("refund", errorEnvuelto("DeadlineNotReached")))).toBe(
      "DeadlineNotReached",
    );
  });
});

