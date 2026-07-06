---
"@1001-digital/ethereum-names": minor
---

Make bare-label resolution configurable and default it to ENS.

Bare labels (no dot, e.g. `alice`) are ambiguous now that both GNS (`.gwei`) and WNS (`.wei`) accept them — and they can point to different owners. Rather than silently guess, `detectSystem` and the client now route bare labels to a configurable `bareLabel` system.

- New `bareLabel` option (`'ens' | 'gns' | 'wns'`), defaulting to `'ens'`. `detectSystem(input, bareLabel?)` takes an optional second argument.
- **Behavior change:** in `0.2.0` a bare label resolved as `.gwei`; it now resolves against ENS by default. Since ENS has no bare-label namespace, `resolve('alice')` returns `null` unless you set `bareLabel: 'gns'` or `'wns'` (or pass an explicit `alice.gwei` / `alice.wei`).
