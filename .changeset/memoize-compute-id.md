---
'@1001-digital/ethereum-names': patch
---

Memoize `computeId` per client: repeat registry reads of the same canonical name — a `lookup()` followed by a `getText()`, or resolving a name twice — now reuse the token id instead of paying the on-chain round-trip again. Only non-zero ids are cached (GNS answers `0` for unregistered names, which can change once the name is registered), and the memo is bounded and scoped to each client instance.
