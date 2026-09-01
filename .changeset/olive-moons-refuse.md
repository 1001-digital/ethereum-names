---
'@1001-digital/ethereum-names': minor
---

Make the resolved name systems configurable, and report *why* a lookup ended the way it did.

GNS and WNS were hardcoded into the resolving path, so adding a TLD meant forking the
library. They are now the default entries in a `registries` list — any contract with the
same read interface (`computeId`, `resolve`, `reverseResolve`, `text`) can join:

```ts
import { createEthereumNames, DEFAULT_REGISTRIES } from '@1001-digital/ethereum-names'

const names = createEthereumNames({
  registries: [...DEFAULT_REGISTRIES, { id: 'foo', suffixes: ['.foo'], contract: '0x…' }],
})
```

Registry ids are **inferred**, so `reverseAll()` keys, `system()`, `bareLabel` and
`priority` stay exactly typed for custom registries — a typo is a compile error rather than
a silent `null`, and `NameSystem` stays a closed union for everyone else.

**Collisions are surfaced instead of guessed.** A name can be claimed by more than one
system — two registries claiming a suffix, or a registry with permissionless namespaces
claiming everything. `lookup()` now reports `status: 'ambiguous'` with every match, and
`resolve()` returns `null` rather than silently privileging one registry. Configure with
`collisions: 'safe' | 'priority' | fn`, and resolve explicitly with `resolveIn(system, name)`.

**Results carry their evidence.** `lookup()` gained `status`
(`resolved` / `not-found` / `unverified` / `ambiguous` / `error`), `verified`, `ambiguous`,
and `matches`. Two facts that used to collapse into `null` are now distinguishable: a
reverse record that fails forward verification (`'unverified'` — it claims an address it
does not own) and an RPC failure (`'error'`, not `'not-found'`).

**New:** `resolveIn()`, `systemsFor()`, `systems()`, `describe()`, `detectSystems()`,
`DEFAULT_REGISTRIES`, `RESERVED_SUFFIXES`, and a `priority` option that covers reverse
order *and* forward collision tie-breaking. `systems()` returns display descriptors
(`label`, `url`) so apps can render "what resolved" without hardcoding ids — they are
config-supplied display data and must never be rendered as verification signals.

**Guardrails:** invalid registries throw at construction rather than failing silently later
— unknown `bareLabel`/`priority` ids, invalid contract addresses, duplicate ids, suffixes
without a leading dot, registries claiming nothing. `.eth` is reserved and cannot be claimed
by a registry, since a suffix claim takes that suffix away from ENS.

Backwards compatible: the default client resolves, reverses and routes exactly as before,
`ReverseNames` is still `{ ens, gns, wns }`, `NameSystem` is unchanged, `gnsContract` /
`wnsContract` still override the default addresses, and `reversePriority` still works
(deprecated in favor of `priority`).
