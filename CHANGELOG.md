# @1001-digital/ethereum-names

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
