---
"@1001-digital/ethereum-names": minor
---

Add support for the Wei Name Service (WNS) — resolve, reverse-resolve, and read records for `.wei` names, powered by [`wns-utils`](https://www.npmjs.com/package/wns-utils).

- `.wei` names now route to the new `wns` system (`detectSystem`/`system` return `'wns'`).
- `reverseAll` returns `{ ens, gns, wns }`, and `reversePriority` defaults to `['ens', 'gns', 'wns']`.
- New `wnsContract` config option and exported `DEFAULT_WNS_CONTRACT` constant.
