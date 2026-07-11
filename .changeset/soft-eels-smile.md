---
'@1001-digital/ethereum-names': minor
---

Make the set of resolved name systems configurable. GNS and WNS were hardcoded into the
resolving path, so adding a TLD meant forking the library. They are now just the default
entries in a `registries` list — any contract with the same read interface (`computeId`,
`resolve`, `reverseResolve`, `text`) can join:

```ts
import { createEthereumNames, DEFAULT_REGISTRIES } from '@1001-digital/ethereum-names'

const names = createEthereumNames({
  registries: [...DEFAULT_REGISTRIES, { id: 'foo', suffix: '.foo', contract: '0x…' }],
})

await names.resolve('alice.foo')     // → 0x…
await names.reverseAll('0xd8dA…')    // → { ens, gns, wns, foo }
```

A registry's `id` names it everywhere: `system()`, `lookup()`, the `reverseAll()` keys, and
the `bareLabel` / `reversePriority` options. Suffixes are matched longest-first, so `.gwei`
is never shadowed by `.wei` regardless of order. Invalid registries (the reserved id `ens`,
duplicate ids, a suffix without its leading dot) throw at construction.

Also exported: `DEFAULT_REGISTRIES` and the `NameRegistry` type. `detectSystem` takes an
optional third `registries` argument.

Backwards compatible: `NameSystem` widens rather than changes, `ReverseNames` keeps `ens` /
`gns` / `wns` always present, `gnsContract` / `wnsContract` still override the default
addresses, and the defaults are unchanged.
