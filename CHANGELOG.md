# @1001-digital/ethereum-names

## 0.3.0

### Minor Changes

- [`31364f6`](https://github.com/1001-digital/ethereum-names/commit/31364f6d682194fdbbe3481bb3df07efd0353347) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Make bare-label resolution configurable and default it to ENS.

  Bare labels (no dot, e.g. `alice`) are ambiguous now that both GNS (`.gwei`) and WNS (`.wei`) accept them — and they can point to different owners. Rather than silently guess, `detectSystem` and the client now route bare labels to a configurable `bareLabel` system.

  - New `bareLabel` option (`'ens' | 'gns' | 'wns'`), defaulting to `'ens'`. `detectSystem(input, bareLabel?)` takes an optional second argument.
  - **Behavior change:** in `0.2.0` a bare label resolved as `.gwei`; it now resolves against ENS by default. Since ENS has no bare-label namespace, `resolve('alice')` returns `null` unless you set `bareLabel: 'gns'` or `'wns'` (or pass an explicit `alice.gwei` / `alice.wei`).

## 0.2.0

### Minor Changes

- [#1](https://github.com/1001-digital/ethereum-names/pull/1) [`e52b565`](https://github.com/1001-digital/ethereum-names/commit/e52b565cdf181a8d7aa10a8b395ac0235d6668be) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Add support for the Wei Name Service (WNS) — resolve, reverse-resolve, and read records for `.wei` names.

  - `.wei` names now route to the new `wns` system (`detectSystem`/`system` return `'wns'`).
  - `reverseAll` returns `{ ens, gns, wns }`, and `reversePriority` defaults to `['ens', 'gns', 'wns']`.
  - New `wnsContract` config option and exported `DEFAULT_WNS_CONTRACT` constant.
  - GNS and WNS now resolve against their immutable mainnet registries via a shared minimal ABI, dropping the `@donnoh/gns-utils` and `wns-utils` runtime dependencies (the package now has **zero runtime dependencies**).

## 0.1.0

### Minor Changes

- Initial release. One clean, viem-powered API to resolve Ethereum names across ENS and the Gwei Name Service (GNS): `resolve`, `reverse`, `reverseAll`, `lookup`, `getAvatar`, `getText`, with forward-verified reverse lookups and per-system routing.
