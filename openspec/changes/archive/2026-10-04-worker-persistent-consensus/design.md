# Design: Persistent Atomic Consensus with Tx Lifecycle (#26)

## Technical Approach

A pure transition core (`src/consensus/core.ts`) is executed by `ConsensusLedger`, a serial command runner over a one-key `LedgerStorage`. Thin fetch-based Durable Object shells host the ledger (`ConfirmationStore`, one per challenge) and the dedupe log (`UpdateDedupe`, one per chat). The Worker depends only on the `ConsensusGateway` interface. All chain I/O stays in the Worker, in `src/telegram/resolucion.ts`, which is the single send path. Specs: `worker-consensus-lifecycle`, `telegram-update-dedupe`.

## Architecture Decisions

| Topic | Choice | Rejected | Rationale |
|---|---|---|---|
| DO API | `fetch` handler with a typed JSON command union. The shell does not import `cloudflare:workers`. | RPC `extends DurableObject` | Plain vitest cannot resolve `cloudflare:workers`. Without that import, the shell can be built with a fake `state.storage`. |
| Atomicity | Each command runs as get, pure transition, put, inside a promise-chain queue. In production, DO input gates give the same guarantee. | `blockConcurrencyWhile` per call | The queue makes the fake behave like the DO, so the concurrency tests prove real behavior. |
| Fencing | `beginSubmit` returns a monotonic `attempt`. `mark*` calls carrying a stale `attempt` are rejected (`stale_attempt`). | No fencing | A holder whose lease was taken over cannot overwrite the new state. |
| Lease | `LEASE_MS = 180_000`, set at `beginSubmit` and renewed at `markSubmitted`. `RECEIPT_TIMEOUT_MS = 90_000`. | 30 s; 10 min | The lease must outlive the holder's legitimate work. A viem broadcast takes about 4 RPC calls at a 10 s default timeout, with retries about 60 s. The receipt wait is capped at 90 s, and blocks take 2 s or less on Arc/Arbitrum. Three minutes is an acceptable wait before a human retry. |
| Stale in-flight state | `beginSubmit` treats an expired `submitting` or `submitted` as `failed("lease_expired")` and grants exactly one new attempt. | Admin reset | Recovers from a crash without operator access. |
| Pre-send check | The holder always reads `challengeStatus` before sending. 2 (Resuelto) leads to `markConfirmed` with no tx. 3 (Reembolsado) leads to `markFailed("refunded_onchain")`. | Check only on retry | One code path, and it makes a resend after lease expiry safe. |
| Receipt boundary | #26 covers `waitForTransactionReceipt({timeout})` plus `status`, which drive `confirmed` or `failed`. #27 owns nonce serialization, `ChainConfig` unification, and the post-receipt Resuelto re-read. | Full DD-08 here | Prevents scope creep. |
| Dedupe | Per-chat `UpdateDedupe` with a FIFO list. `RETENTION = 200`. The update is marked before routing. Key: `message.chat.id ?? callback_query.message.chat.id ?? "nochat"`. | KV with TTL (racy); a singleton DO (hotspot) | Telegram redelivers only pending updates (at most 100 per batch, 40 webhook connections). 200 covers that window at about 2 KB per chat. |
| Missing binding | Fall back to the in-memory gateway, or skip dedupe, with `console.warn`. A dedupe error fails open. | Fail closed | Mirrors `resolverStore`/`BOT_KV`. The `beginSubmit` CAS already blocks a double send, and dropping an update is worse than processing it twice. |
| History | Written only when `markConfirmed` returns `firstConfirmation: true`. | Write at broadcast | Required by the spec. |
| `orchestrator.ts` | Deleted, together with its test. | Align it | It is an unwired duplicate. |
| Migration | One tag `v1`: `new_sqlite_classes = ["ConfirmationStore","UpdateDedupe"]`. | One tag per class | Tags are immutable. The Free plan requires SQLite-backed DOs. |

## State Machine

| Phase | Command | Result |
|---|---|---|
| collecting | `vote` | Stays in `collecting`, or moves to `consensus{winner}`. Exactly one call returns `consensusTriggered`. The threshold is fixed by the first vote. |
| consensus, failed, expired submitting/submitted | `beginSubmit` | `submitting{attempt+1, leaseUntil}` |
| submitting | `markSubmitted` / `markConfirmed` / `markFailed` | `submitted{txHash}` / `confirmed` / `failed{reason}` |
| submitted | `markConfirmed` / `markFailed` | `confirmed` / `failed` |
| any phase except collecting | `vote` | `{kind:"frozen", phase}`. State is unchanged. |

## Data Flow

    webhook -> UpdateDedupe[chat].markIfNew(update_id) --dup--> 200
                  | new
                  v
    router -> handleConfirmar --vote--> ConfirmationStore[challenge]
              handleReintentar                 | consensus | failed
                  \______ resolverEnCadena ____/
                          beginSubmit (CAS) -> challengeStatus?
                          -> buildConfirmResultCall (guard) -> writeContract
                          -> markSubmitted -> esperarRecibo -> markConfirmed|markFailed
                          -> history (first confirmation only) -> reply

When `/confirmar` reaches `consensus` or `failed`, it goes through `resolverEnCadena`. A `/confirmar` during `submitting` or `submitted` gets the reply "en curso". `/reintentar <id>` requires the caller to be a participant, and uses the consensus winner, not a mention.

## Interfaces

```ts
type Phase = "collecting"|"consensus"|"submitting"|"submitted"|"confirmed"|"failed";
interface ConsensusGateway {
  vote(id, wallet, winner, threshold): Promise<VoteResult>;
  beginSubmit(id, now): Promise<{granted:true; attempt:number; winner:string} | {granted:false; phase:Phase}>;
  markSubmitted(id, attempt, txHash): Promise<MarkResult>;
  markConfirmed(id, attempt, txHash|null): Promise<MarkResult & {firstConfirmation:boolean}>;
  markFailed(id, attempt, reason): Promise<MarkResult>;
  getStatus(id): Promise<ChallengeStatus>; // + phase, txHash?, failureReason?, attempt
}
```

`buildConfirmResultCall` takes `{getStatus}` instead of `ConfirmationStore`. Its checks and error messages stay exactly as they are; `consensusReached` means `phase !== "collecting"`. `ChainClient` gains `esperarRecibo(hash, timeoutMs): Promise<"success"|"reverted">`.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/consensus/core.ts`, `ledger.ts`, `gateway.ts` | Create | Pure transitions, serial ledger, in-memory and DO gateways |
| `src/consensus/dedupe.ts` | Create | Pure FIFO dedupe |
| `src/durable/ConfirmationStore.ts`, `UpdateDedupe.ts` | Create | Fetch shells |
| `src/telegram/resolucion.ts` | Create | Single send path |
| `src/confirmations.ts` | Modify | Re-exports types; drops `registerConfirmation` and the in-memory store |
| `src/index.ts` | Modify | `Env` gains `CONFIRMATION_STORE?`/`UPDATE_DEDUPE?: DurableObjectNamespace`; exports both classes; resolves the gateway |
| `src/telegram.ts` | Modify | Dedupe before `handleUpdate` |
| `src/telegram/retos.ts`, `router.ts`, `comandos.ts` | Modify | Lifecycle replies, `/reintentar`, menu and help |
| `src/telegram/chain.ts` | Modify | `esperarRecibo` |
| `src/confirmTx.ts`, `src/status.ts` | Modify | Gateway reader, extended payload |
| `wrangler.toml` | Modify | Two DO bindings plus migration `v1` |
| `src/orchestrator.ts`, `test/orchestrator.test.ts` | Delete | Unwired duplicate |
| `docs/SDD.md` §9 | Modify | DO model, lifecycle, dedupe, `/reintentar` |
| `docs/DESIGN_DECISIONS.md` DD-07 | Modify | Adds the `submitting` lease phase |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Every transition, freeze, fencing, lease expiry, eviction | Pure core with an injected `now` |
| Unit | 5 concurrent votes; double `beginSubmit`; persistence | Ledger plus fake storage (`Promise.all`; a second ledger on the same map) |
| Unit | DO shells | Fake `state.storage` and command `Request`s |
| Integration | Confirm/retry/receipt revert/already settled/history once/non-participant; dedupe in webhook | Router and `handleTelegramWebhook` with in-memory gateway and fake `ChainClient` |
| Manual | Bindings and migration | `wrangler dev`, then `wrangler deploy --dry-run` |

## Threat Matrix

N/A: there is no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Telegram command dispatch is application routing that the specs already cover.

## Migration / Rollout

The migration is additive (`v1`). Rollback means reverting the PR and redeploying. Data in the DOs is abandoned and nothing changes on-chain. Do not delete the classes in a later migration without a new tag.

## Open Questions

- [ ] The specs do not cover recovery from an expired `submitted`. The design adds it. Add a scenario in the spec phase.
- [ ] Confirm that wrangler `^3.78` accepts `new_sqlite_classes`. If not, bump wrangler.
