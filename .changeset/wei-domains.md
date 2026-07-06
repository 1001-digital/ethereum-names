---
"@1001-digital/ethereum-names": minor
---

Add support for the Wei Name Service (WNS) — resolve, reverse-resolve, and read records for `.wei` names.

- `.wei` names now route to the new `wns` system (`detectSystem`/`system` return `'wns'`).
- `reverseAll` returns `{ ens, gns, wns }`, and `reversePriority` defaults to `['ens', 'gns', 'wns']`.
- New `wnsContract` config option and exported `DEFAULT_WNS_CONTRACT` constant.
- GNS and WNS now resolve against their immutable mainnet registries via a shared minimal ABI, dropping the `@donnoh/gns-utils` and `wns-utils` runtime dependencies (the package now has **zero runtime dependencies**).
