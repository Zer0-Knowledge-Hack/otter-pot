# packages/arc

Solidity implementation of `ChallengePool` for **Arc**, Circle's USDC-native EVM L1.

Built during ETHOnline 2026 (Continuity track). The Rust/Stylus contracts in `packages/stylus` are the earlier ETH Lima deliverable and are left untouched — Stylus compiles to WASM on Arbitrum Nitro and does not port to EVM, so this is a rewrite, not a migration.

## Deployment

Live on Arc testnet — see [`deployments/arc-testnet.json`](deployments/arc-testnet.json).

| | |
|---|---|
| ChallengePool | [`0x3953ecD3f1797FD18b22a151fEF20C3f5Ae0aD0B`](https://testnet.arcscan.app/address/0x3953ecD3f1797FD18b22a151fEF20C3f5Ae0aD0B) |
| USDC (system contract) | `0x3600000000000000000000000000000000000000` |
| Chain ID | `5042002` |

## Arc specifics

USDC is the native gas token and exposes a **dual interface over a single balance**:

- native (`msg.value`, `address.balance`) — 18 decimals
- ERC-20 (`balanceOf`, `transfer`, `transferFrom`) — 6 decimals, used by application logic

The two views differ by a factor of `10^12`. `ChallengePool` therefore has no `payable` function and never reads `msg.value` or `address(this).balance`. There is no wrapped USDC: the ERC-20 address *is* the pool token.

Because USDC is simultaneously gas and application token, transferring USDC to an account also funds its gas.

## Development

Foundry only — no external dependencies, nothing is fetched from the network.

```bash
forge build
forge test
```

`forge-std` is intentionally absent; the test suite declares a minimal `Vm` cheatcode interface and `require`-based assertions instead.

## Deploying

Copy `.env.example` to `.env` and fill in a funded key. Testnet USDC comes from https://faucet.circle.com.

```bash
forge create src/ChallengePool.sol:ChallengePool \
  --rpc-url "$ARC_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  --constructor-args "$ARC_USDC" 500
```

`--constructor-args` is variadic and swallows any flag placed after it, so keep `--broadcast` before it. `forge script` is not used because it requires `forge-std`.

## ABI

[`abi/ChallengePool.json`](abi/ChallengePool.json), consumed by the worker.

Note for integrators: reverts are **custom errors**, not byte strings as in the Stylus version.
