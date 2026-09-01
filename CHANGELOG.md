# @1001-digital/ethereum-names

## 0.4.0

### Minor Changes

- [`d74a395`](https://github.com/1001-digital/ethereum-names/commit/d74a395cbccd41f5e85627b27fbb55786e3a0765) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Make the resolved name systems configurable, and report _why_ a lookup ended the way it did.

  GNS and WNS were hardcoded into the resolving path, so adding a TLD meant forking the
  library. They are now the default entries in a `registries` list — any contract with the
  same read interface (`computeId`, `resolve`, `reverseResolve`, `text`) can join:

  ```ts
  import {
    createEthereumNames,
    DEFAULT_REGISTRIES,
  } from "@1001-digital/ethereum-names";

  const names = createEthereumNames({
    registries: [
      ...DEFAULT_REGISTRIES,
      { id: "foo", suffixes: [".foo"], contract: "0x…" },
    ],
  });
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
  order _and_ forward collision tie-breaking. `systems()` returns display descriptors
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
