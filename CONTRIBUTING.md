# Contributing to OtterPot

Thanks for your interest in OtterPot, a shared-prize-pool challenge platform for friends, built on Arbitrum (Stylus/Rust) with Telegram as the user interface.

This guide explains how to set up the project, how we work, and what we expect from a contribution.

## Source of truth

The business and architecture specification lives in [`docs/SDD.md`](docs/SDD.md). If the code and the SDD disagree, **update the SDD first, then the code**. Contract function names must match the SDD exactly; renaming one requires updating the SDD in the same change.

Also read [`AGENTS.md`](AGENTS.md) for build commands and security boundaries.

Planning and verification documents:

- [`docs/ROADMAP.md`](docs/ROADMAP.md): MVP definition, workstreams, phases and release gates.
- [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md): decision log for the current iteration.
- [`docs/TESTING.md`](docs/TESTING.md): what to test per component and how.

Issues in the **ArbitrumSingapur** milestone link the sections that apply to them.

## Repository layout

```
packages/
  stylus/     Rust/Stylus contracts (ChallengePool, TreasuryVault, AaveV3Strategy)
  nextjs/     Landing page + Telegram Mini App (Next.js, Wagmi)
  worker/     Telegram bot + orchestrator (Cloudflare Workers, TypeScript)
  sweeper/    Cron worker that moves idle funds to the yield strategy
docs/         SDD, product, validation and planning documents
```

## Getting started

Prerequisites: Node.js (LTS), Yarn 3.2.3 (the repo is locked with Yarn; do not use npm or pnpm), Rust toolchain, `cargo-stylus`, Docker (for the local Nitro dev node).

```bash
git clone https://github.com/Zer0-Knowledge-Hack/otter-pot.git
cd otter-pot
yarn install --immutable
```

Never commit private keys, Privy secrets, RPC keys, or real environment values. Use `dev.vars` locally and `wrangler secret put` in Cloudflare. Contract addresses are injected through environment variables, not hardcoded in code or in `wrangler.toml`.

## Build and test

**Contracts (`packages/stylus`)**

```bash
cargo fmt
cargo clippy
cargo stylus check
cargo test
cargo stylus export-abi   # whenever public functions change
```

Do not use `unwrap()` on paths that handle user funds; propagate errors explicitly.

**Worker and sweeper (`packages/worker`, `packages/sweeper`)**

```bash
npm run lint
npm test
wrangler dev
```

Use strict typing. Do not use `any` in the module that builds transactions to the contract.

**Mini App (`packages/nextjs`)**

```bash
yarn next:lint
yarn next:check-types
```

## Workflow

1. **Pick or open an issue.** Use the issue templates. Comment on the issue before starting so work is not duplicated.
2. **Branch from `master`** using a prefix that matches the change: `feat/...`, `fix/...`, `docs/...`, `test/...`, `chore/...`.
3. **Keep changes focused.** One concern per pull request. If a change grows large, split it into reviewable slices.
4. **Open a pull request** against `master` and fill in the pull request template. Link the issue (`Closes #123`).
5. **Get a review.** At least one teammate must approve. Address feedback with new commits; do not force-push over a review in progress.

## Labels and milestones

Every issue carries one **priority** label (`P0` blocks the MVP, `P1` clearly improves it, `P2` is for later), one **area** label (`area:contracts`, `area:worker`, `area:sweeper`, `area:frontend`, `area:security`, `area:docs`, `area:pitch`, `area:infra`) and one type label (`bug`, `enhancement`, `documentation`). Issues are grouped under a milestone. State dependencies explicitly in the issue body ("Blocked by #N") and do not start work that depends on an unmerged issue.

## Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

```
feat(contracts): add refund() with proportional yield reimbursement
fix(worker): reject confirmations without a verified wallet
docs(sdd): align fee recipient section with the implementation
```

Do not add AI attribution trailers or `Co-Authored-By` lines to commits.

## Before you call a task done

1. **Touches `packages/stylus`:** `cargo fmt`, `cargo clippy`, `cargo stylus check`, `cargo test`.
2. **Touches `packages/worker`:** `npm run lint`, `npm test`.
3. **Changes the data model, challenge lifecycle, fee model, or treasury model:** reflect it in `docs/SDD.md` before closing.
4. **Changes a deployed contract:** redeploy, then propagate the new address and ABI to `packages/worker/contracts`, the Mini App environment variables, and the scripts. Coordinate with the team first.

## Security boundaries

Never do the following without explicit approval from the team:

- Commit keys, secrets, or real environment variables.
- Give the Worker's operator account any function that can move funds to an address other than the winner computed by the contract.
- Change the `TreasuryVault` yield strategy address without an approved, recorded admin decision (SDD section 7.3).
- Modify addresses of already-deployed contracts in configuration files without coordinating with the team.

To report a vulnerability, please do not open a public issue. Contact the maintainers privately (see `SECURITY.md` once available) and give us reasonable time to respond.

## Honesty in documentation and demos

Only describe what the project actually does. If a feature is roadmap, label it as roadmap. This applies to the README, pitch material, and hackathon submissions alike.

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
