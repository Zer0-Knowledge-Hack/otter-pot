# Design: Relayer receipt confirmation and single chain config (#27)

## Technical Approach

Approach A. `chain.ts` gains a narrow `PuertoDeCadena` port (viem adapter in production, fake in tests) and an isolate-wide `ColaDeTransacciones`. All writes (`confirmarResultado`, `crearReto`, `reembolsar`) run send -> receipt -> status check inside one queue slot. `handleConfirmar` keeps the winner guard by passing `buildAndSendConfirmResult` a writer adapter that calls `confirmarResultado`. `ConfirmationStore` gains a resolution status; failure releases the lock.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Queue scope | Module-level `Map<operatorAddress, ColaDeTransacciones>` in `chain.ts`; injectable via `crearChainClient(config, { cola })` | Queue per `crearChainClient` instance | `telegram.ts:64` builds a new client per webhook request; a per-instance queue serializes nothing |
| Queue semantics | `run = tail.then(task); tail = run.then(noop, noop); return run` | Mutex lib; chaining on `run` | Tail never rejects, so a failed task cannot poison the queue; no dependency |
| Lock span | Slot held through send, `waitForTransactionReceipt({ timeout: 60_000 })` and the `challengeStatus` re-read | Release after broadcast | Next nonce is read only after the previous tx mined; explicit timeout bounds a stuck slot |
| Test seam | `PuertoDeCadena` port (`enviar`, `esperarRecibo`, `leerEstado`, `leerDecimales`, `idDeRetoCreado`) | Injecting raw viem `PublicClient`/`WalletClient` | viem generics force `as unknown` casts in fakes; a domain port keeps fakes trivial and `any`-free. Adjusts the orchestrator's "inject public/wallet client" note |
| Winner guard | Keep `buildAndSendConfirmResult(params, { writeContract: c => chain.confirmarResultado(c.args[0], c.args[1], { alEnviar }) })`; remove `ChainClient.writer` | `confirmarResultado` reading the store | Guard stays single-sourced in `confirmTx.ts`; `writer` was a queue bypass |
| Error classes | In `errores.ts` (pure); `chain.ts` imports them | In `chain.ts` | Avoids `errores -> chain` dependency |
| State shape | Optional fields on `ChallengeConfirmationState` | New store/record | Backward compatible with stored states and existing tests |

## Typed Errors (`src/telegram/errores.ts`)

- `TransaccionRevertidaError { operacion: "confirmResult" | "createChallenge" | "refund"; txHash: Hex }`
- `RetoNoResueltoError { challengeId: bigint; estadoObservado: number; txHash: Hex }`
- `EnvioFallidoError { operacion; cause }` wraps send/wait/timeout errors; `nombreDeErrorDeContrato` already walks `.cause`.

`describirErrorDeContrato` checks these `instanceof` first; `EnvioFallidoError` without a contract name yields "No pude enviar la transacción: <cause shortMessage>".

## State Model and Retry Rule

`resolutionStatus?: "enviada" | "confirmada" | "fallida"`, `resolutionTxHash?: string`.

    consensus (lock = consensusTriggeredFor, status undefined)
      -> alEnviar(hash): enviada
      -> verified: confirmada
      -> any error (guard, send, revert, not-Resolved): fallida + consensusTriggeredFor = null

Retry rule (spec assumption confirmed, made precise): a new tx is sent only when `consensusTriggeredFor === null`. Votes are kept on `fallida`, so the next `/confirmar` recounts and re-triggers. The pre-broadcast window (lock set, status undefined) counts as in flight. New helpers in `confirmations.ts`: `marcarEnviada`, `marcarConfirmada`, `marcarFallida`; `getChallengeStatus` additively exposes `resolutionStatus`.

## handleConfirmar Flow

`alreadyTriggered` message depends on status (in flight vs resolved). On consensus: guard + `confirmarResultado` -> `marcarConfirmada` -> history -> announce. `catch`: `marcarFallida` -> `describirErrorDeContrato` message + "Podés volver a confirmar para reintentar". No announcement or history outside `confirmada`.

## Stylus Alias Mapping (verified)

Spec list is incomplete, and the existing `ALIAS_STYLUS` long names (`not_an_operator`, ...) are never emitted. Codes from committed `lib.rs`/`logic.rs`:

| Code | Canonical | Code | Canonical |
|---|---|---|---|
| `no_op` | NotAnOperator | `notopen` | ChallengeNotOpen |
| `not_owner` | NotOwner | `notlocked` | ChallengeNotLocked |
| `nopart` | new ParticipantsMissingOrNotParticipant (neutral message; emitted by create and claim) | `deposited` | AlreadyDeposited |
| `dep0` | ZeroDeposit | `incdep` | new IncorrectDeposit |
| `depmax` | DepositExceedsMaximum | `winzero` | WinnerIsZeroAddress |
| `pay`,`refpay`,`pull` | TransferFailed | `winpart` | WinnerNotParticipant |
| `vred`,`vdep`,`appr` | new TreasuryCallFailed | `nodln` | DeadlineNotReached |
| `noref` | NotRefunded | `claimed` | AlreadyClaimed |
| `inited` | new AlreadyInitialized | `operator_is_zero` | OperatorIsZeroAddress |
| `vault0` | new VaultIsZeroAddress | | |

Main checkout's uncommitted payout work adds `ratemax`, `recipient0`, `bad_status`, `norecover`, `payfee`; map them only if #19 lands first. Stylus `Err(Vec<u8>)` reverts carry raw ASCII bytes (e.g. `0x6e6f5f6f70`), which `desdeData` cannot ABI-decode: add a UTF-8 decode of short printable revert data before canonizing.

## File Changes

| File | Action |
|---|---|
| `packages/worker/src/orchestrator.ts`, `test/orchestrator.test.ts` | Delete |
| `src/confirmTx.ts` | Remove `createOperatorWriter*`, `OperatorWriterConfig`, `OperatorEnv`, duplicate key regex, comments |
| `test/confirmTx.test.ts` | Remove L258-286 |
| `src/index.ts` | Remove `Env.ARBITRUM_RPC_URL` |
| `src/telegram/chain.ts` | Port, queue, `confirmarResultado`, receipt checks, URL validation, drop `writer` |
| `src/telegram/errores.ts` | Error classes, aliases, byte decode, messages |
| `src/confirmations.ts`, `src/telegram/retos.ts` | State lifecycle, flow |
| `wrangler.toml` | `[vars]`: `ENVIRONMENT`, `CHAIN_ID = "421614"`, `keep_vars = true`; comments list `wrangler secret put` for key/RPC |
| `.dev.vars.example` | 421614, Sepolia RPC, `0x<pool-address>` placeholders |
| `docs/SDD.md` 9.2, 11; `docs/TESTING.md` 4 | Docs (SDD in Spanish) |

Docs: SDD 9.2 adds "current implementation" notes (in-memory `ConfirmationStore`, isolate-scoped queue, Durable Object pending DD-07, state names `enviada/confirmada/fallida`, receipt timeout); SDD 11 states the operator key and RPC are secrets and that no write path bypasses the winner guard. TESTING 4 renames `failed`/`confirmed` to the code names and marks cross-isolate nonces as best effort.

## Testing Strategy (strict-TDD order)

1. `errores.test.ts`: short codes (data bytes and text), typed error messages, unknown fallback.
2. `chain.test.ts`: URL invalid/protocol, per-variable messages, no key echo.
3. `cola.test` in `chain.test.ts`: ordering, failure isolation.
4. `chain.test.ts` with fake port: confirmar success/reverted/not-Resolved/send error; second send after first receipt; `crearReto`/`reembolsar` reverted.
5. `confirmations.test.ts`: mark helpers, release, retry, no duplicate.
6. `retos.test.ts` (`CadenaFalsa` gains `confirmarResultado`): announce only on success, failure messages, retry.
7. Static: `wrangler.toml` regex scan; no `ARBITRUM_RPC_URL`/`orchestrator` refs.

Manual: one Sepolia resolution.

## Commit Slicing

1. `chore(worker)`: deletions. 2. `fix(worker)`: config + chain URL validation. 3. `fix(worker)`: errors, queue, receipt flow, state. 4. `docs`: SDD/TESTING.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No data migration. Deploy needs `CHAIN_RPC_URL`, `OPERATOR_PRIVATE_KEY` secrets and address vars set before `wrangler deploy`.

## Open Questions

- [ ] `nopart` is emitted for both empty roster and non-participant claim; a neutral message is proposed (spec expects "same message as the Solidity error"; no single equivalent exists).
- [ ] `keep_vars = true` keeps dashboard address vars across `wrangler deploy`; alternative is `wrangler secret put` for addresses too.
- [ ] Receipt timeout may hide a later-mined tx; retry then reverts `notlocked` (readable). Pre-send status read deferred.
- [ ] Telegram webhook deadline vs. queue wait under load.
