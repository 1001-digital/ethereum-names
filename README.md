# @1001-digital/ethereum-names

One clean, [viem](https://viem.sh)-powered API to resolve Ethereum names across
[ENS](https://ens.domains), the [Gwei Name Service](https://gwei.domains) (GNS), and the
[Wei Name Service](https://wei.domains) (WNS).

Point it at a name — `vitalik.eth`, `alice.gwei`, or `alice.wei` — and it figures out which
system to ask. Point it at an address and it gives you back the primary name. No branching
in your app code.

It also tells you **what resolved and why**: which system answered, whether the answer was
verified, and whether anything else claimed the same name. Name systems increasingly
overlap, and a wallet about to send funds needs to know when they do.

## Install

```bash
npm install @1001-digital/ethereum-names viem
```

`viem` is a peer dependency.

## Usage

```ts
import { createEthereumNames } from '@1001-digital/ethereum-names'

const names = createEthereumNames()

// Forward: name → address (the system is detected from the name)
await names.resolve('vitalik.eth')    // ENS → '0xd8dA...' | null
await names.resolve('alice.gwei')     // GNS → '0x...'    | null
await names.resolve('alice.wei')      // WNS → '0x...'    | null
await names.resolve('alice')          // bare label → ENS by default (see bareLabel)
await names.resolve('0xd8dA...')      // address → returned checksummed

// Reverse: address → primary name (tries ENS, then GNS, then WNS)
await names.reverse('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
// => 'vitalik.eth' | 'alice.gwei' | 'alice.wei' | null

// Reverse across ALL systems at once (when an address has names in each)
await names.reverseAll('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
// => { ens: 'vitalik.eth', gns: 'vitalik.gwei', wns: 'vitalik.wei' }

// Rich lookup: resolve or reverse, with the evidence behind the answer
await names.lookup('alice.wei')
// => { input: 'alice.wei', name: 'alice.wei', address: '0x...', system: 'wns',
//      status: 'resolved', verified: true, ambiguous: false, matches: [...] }

// Records work across all systems
await names.getAvatar('vitalik.eth')
await names.getText('alice.wei', 'url')

// Pure, offline system detection
names.system('alice.gwei')     // 'gns'
names.systemsFor('alice.gwei') // ['gns'] — every system claiming this name

// Pure, offline profile links ("view on ENS / GNS / WNS")
names.profileUrl('vitalik.eth') // 'https://app.ens.domains/vitalik.eth'
names.profileUrl('alice.gwei')  // 'https://gwei.domains/#alice'
names.profileUrl('alice.wei')   // 'https://wei.domains/#alice'
```

## How resolution is routed

Each system declares which names it claims. A name can be claimed by more than one — that
is a **collision**, and it is handled explicitly rather than by first-match luck.

| Input | Claimed by |
| --- | --- |
| `*.gwei` | GNS |
| `*.wei` | WNS |
| any suffix from a custom registry | that registry |
| any other dotted name `*.eth`, `*.box`, … | ENS |
| bare label (no dot) | every registry accepting bare labels — GNS and WNS |
| `0x…` address | passed through (checksummed) |

The rules, in order:

1. **Suffix claims win, longest first.** `.bar.foo` beats `.foo`, and `.gwei` is never
   mistaken for `.wei`. Claiming a suffix takes it away from ENS — which is why `.eth` is
   reserved and cannot be claimed by a registry.
2. **Wildcard registries stack.** A registry with permissionless namespaces claims every
   dotted name outside its `excludeSuffixes`, on top of any suffix claim. That is how a
   name like `bob.gwei` ends up claimed by two systems.
3. **ENS is the fallback** for any dotted name no registry claimed by suffix.

`system(name)` returns the single preferred system, for UI that just wants a label.
`systemsFor(name)` returns every claimant — more than one means a collision.

### Bare labels

A bare label like `alice` is ambiguous — GNS (`.gwei`) and WNS (`.wei`) both accept bare
labels, and they can point to different owners. Rather than guess, resolution follows the
`bareLabel` option, which defaults to `ens`. Since ENS has no bare-label namespace, bare
labels resolve to `null` by default; set `bareLabel: 'gns'` or `'wns'` to opt a label like
`alice` into that registry.

### Collisions

When several systems resolve one name to **different** addresses, the default is to refuse
to guess:

```ts
const result = await names.lookup('bob.gwei')

if (result.status === 'ambiguous') {
  // result.matches → [{ system: 'gns', address: '0x123…' },
  //                   { system: 'xyz', address: '0xabc…' }]
  // Ask the user which one they meant, then resolve it explicitly:
  await names.resolveIn('gns', 'bob.gwei')
}
```

`resolve()` returns `null` for an ambiguous name, so a payment flow fails closed instead of
misrouting. Change that with `collisions`:

| `collisions` | Behavior |
| --- | --- |
| `'safe'` (default) | Never guess. `resolve()` → `null`, `lookup()` → `status: 'ambiguous'`. |
| `'priority'` | Take the first match in `priority` order. |
| `(candidates, input) => match` | Your own rule — e.g. `[...candidates].sort((a, b) => a.system.localeCompare(b.system))[0]` for a deterministic, explainable choice. |

`ambiguous` stays `true` even when a rule picked a winner, so you can still warn.

### Verification

By default, reverse lookups are **forward-verified**: after reading an address's primary
name, the library resolves that name back and confirms it points to the same address before
trusting it. This guards against spoofed reverse records (ENS reverse records are not
self-validating). Disable with `verify: false` to save a round-trip.

A record that fails verification is reported rather than dropped:

```ts
const result = await names.lookup('0xd8dA…')
result.status // 'unverified' — a name was found, but it does not own this address
result.name   // null — an unverified name is never presented as the answer
result.matches[0].name // 'someone-elses.eth' — what was claimed
```

## What resolved, and why

`lookup()` returns the evidence a wallet needs to explain — or refuse — what it is about to
do. `resolve()` returns `null` for four different reasons; `lookup()` tells them apart.

| Field | Meaning |
| --- | --- |
| `status` | `'resolved'` · `'not-found'` · `'unverified'` · `'ambiguous'` · `'error'` |
| `verified` | Whether this answer is confirmed. Reverse records need a forward check; `false` also when `verify` is off — it always means "nothing confirmed this". |
| `ambiguous` | Several systems resolved this name to **different** addresses. |
| `matches` | What each system answered, including per-system `status` and `error`. |
| `system` | Which system produced the answer. |

`'error'` is deliberately distinct from `'not-found'`: "the RPC failed" and "the name is
unregistered" are different facts, and only one of them is safe to show as "no such name".

To render a system without hardcoding a map of ids, ask the client what it knows:

```ts
names.systems()
// [{ id: 'ens', kind: 'ens', label: 'Ethereum Name Service', url: 'https://ens.domains', … },
//  { id: 'gns', kind: 'registry', label: 'Gwei Name Service', suffixes: ['.gwei'], … }]

const result = await names.lookup('alice.gwei')
names.describe(result.system!)?.label // 'Gwei Name Service'
```

> **`label` and `url` are display data, not trust signals.** They come from whoever wrote
> the config. Never render a descriptor as a verification badge — the trust signals are
> `status`, `verified`, and `ambiguous`. A registry is free to call itself anything.

## Profile links

Every system can declare where a name's public profile page lives, and
`profileUrl(name)` builds the link offline — no network call — by routing the name exactly
like resolution does:

```ts
names.profileUrl('vitalik.eth')        // 'https://app.ens.domains/vitalik.eth'
names.profileUrl('alice.gwei')         // 'https://gwei.domains/#alice'
names.profileUrl('alice.wei', 'wns')   // pin the system explicitly, skipping routing
names.profileUrl('unclaimed.foo')      // ENS fallback → 'https://app.ens.domains/unclaimed.foo'
```

It returns `null` when nothing claims the name, the name is invalid in its system, or the
system declares no profile URL. A standalone `profileUrl(name)` export does the same
against the default registries, for code that never builds a client.

Custom registries declare theirs via the `profileUrl` field — a template where `{name}`
substitutes the canonical name and `{label}` the name with the matched suffix stripped
(both URL-encoded), or a function from the canonical name to a full URL:

```ts
{ id: 'foo', suffixes: ['.foo'], contract: '0x…', profileUrl: 'https://foo.example/#{label}' }
```

The URL format is a convention of each system's frontend, not part of any on-chain
contract — display data, with the same trust caveat as `label` and `url`.

## Custom registries

GNS and WNS are just two instances of the same shape: an on-chain registry exposing
`computeId(string)`, `resolve(uint256)`, `reverseResolve(address)`, and
`text(uint256, string)`. Any registry with that read interface can join the resolving path
— no fork required. Pass it as `registries`, spreading `DEFAULT_REGISTRIES` so you *add* to
GNS and WNS instead of replacing them:

```ts
import { createEthereumNames, DEFAULT_REGISTRIES } from '@1001-digital/ethereum-names'

const names = createEthereumNames({
  registries: [
    ...DEFAULT_REGISTRIES,
    { id: 'foo', suffixes: ['.foo'], contract: '0x…', label: 'Foo Names' },
  ],
})

await names.resolve('alice.foo')     // → '0x…' | null
names.systemsFor('alice.foo')        // → ['foo']
await names.reverseAll('0xd8dA…')    // → { ens, gns, wns, foo }
```

Ids are **inferred**, so `reverseAll()` keys, `system()`, `bareLabel` and `priority` stay
exactly typed — a typo is a compile error, not a silent `null`.

| Registry field | Description |
| --- | --- |
| `id` | Names the system everywhere. Cannot be `'ens'`. |
| `contract` | The registry address. |
| `suffixes` | Suffixes it claims, leading dot included. The first is appended to bare labels. |
| `bareLabels` | Whether a bare label (`alice`) can be a name here. |
| `wildcard` | For permissionless namespaces: claims every dotted name. |
| `excludeSuffixes` | Suffixes carved out of `wildcard`. |
| `label`, `url` | Display data for `systems()`. Untrusted — see the note above. |
| `profileUrl` | Where a name's profile page lives — a `{name}`/`{label}` template, or a function. Untrusted, same caveat. |

Rules enforced at construction, so a bad config throws instead of silently resolving to
`null`: ids are unique, non-empty and never `'ens'`; contracts must be valid addresses;
suffixes must start with a dot and may not be `.eth`; a registry must claim *something*;
and `bareLabel`/`priority` must name systems that exist.

ENS itself is not pluggable this way — it resolves through viem's universal resolver, which
already covers every TLD in the ENS root (`.eth`, `.box`, offchain CCIP-read names, …).
Those work with no configuration at all.

## Configuration

```ts
import { createEthereumNames } from '@1001-digital/ethereum-names'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

// Bring your own viem client (recommended for production)
const client = createPublicClient({ chain: mainnet, transport: http('https://my-rpc') })
const names = createEthereumNames({ client })

// …or let the library create a mainnet client for you
const quick = createEthereumNames({ rpcUrl: 'https://my-rpc' })

// Prefer GNS names on reverse lookups
const gnsFirst = createEthereumNames({ priority: ['gns', 'ens', 'wns'] })

// Treat bare labels (e.g. `alice`) as `.gwei` names
const gwei = createEthereumNames({ bareLabel: 'gns' })
await gwei.resolve('alice') // → resolves alice.gwei
```

| Option | Type | Description |
| --- | --- | --- |
| `client` | `PublicClient` | A viem client to read from. Its chain must have ENS contracts. |
| `rpcUrl` | `string` | RPC endpoint used when no `client` is given. |
| `chain` | `Chain` | Chain used when no `client` is given. Defaults to `mainnet`. |
| `registries` | `NameRegistry[]` | The non-ENS registries to resolve against. Defaults to `DEFAULT_REGISTRIES` (GNS + WNS). |
| `gnsContract` | `Address` | Override the GNS contract address. |
| `wnsContract` | `Address` | Override the WNS contract address. |
| `bareLabel` | system id | System a bare label (no dot) resolves against. Defaults to `'ens'`. |
| `priority` | system id`[]` | Order systems are tried in — reverse lookups, and `collisions: 'priority'`. Defaults to `['ens', …registries]`. |
| `collisions` | `'safe' \| 'priority' \| fn` | What to do when a name resolves in several systems. Defaults to `'safe'`. |
| `verify` | `boolean` | Forward-verify reverse lookups before trusting them. Defaults to `true`. |

> **Note:** ENS resolution relies on viem's ENS actions, which require a chain with ENS
> contracts configured (such as `mainnet`). GNS and WNS are live on Ethereum mainnet.

## API

### `createEthereumNames(config?) → EthereumNames`

| Method | Returns | Description |
| --- | --- | --- |
| `resolve(nameOrAddress)` | `Promise<Address \| null>` | Name → address. Addresses pass through, checksummed. `null` for ambiguous names. |
| `resolveIn(system, name)` | `Promise<Address \| null>` | Resolve in one named system, skipping routing. Throws on an unknown system. |
| `reverse(address)` | `Promise<string \| null>` | Address → primary name across systems. |
| `reverseAll(address)` | `Promise<ReverseNames>` | Address → primary name from every configured system, keyed by id. |
| `lookup(input)` | `Promise<ResolvedName>` | Resolve or reverse, with `status`, `verified`, `ambiguous` and `matches`. |
| `getAvatar(name)` | `Promise<string \| null>` | Avatar record (ENS avatar, or the registry's `avatar` text). |
| `getText(name, key)` | `Promise<string \| null>` | Arbitrary text record. |
| `profileUrl(name, system?)` | `string \| null` | Offline link to the name's profile page on its system's frontend. |
| `system(name)` | system id `\| null` | Offline detection — the single preferred system. |
| `systemsFor(name)` | system id`[]` | Offline detection — every system claiming the name. |
| `systems()` | `SystemDescriptor[]` | Describe every configured system, for UI. |
| `describe(system)` | `SystemDescriptor \| undefined` | Describe one system by id. |
| `client` | `PublicClient` | The underlying viem client. |

Also exported: `detectSystem(name, bareLabel?, registries?)`,
`detectSystems(name, registries?)`, `profileUrl(name, bareLabel?, registries?)`,
`DEFAULT_REGISTRIES`, `DEFAULT_GNS_CONTRACT`, `DEFAULT_WNS_CONTRACT`, `RESERVED_SUFFIXES`,
and the types `CollisionResolver`, `CollisionStrategy`, `EthereumNames`,
`EthereumNamesConfig`, `MatchStatus`, `NameMatch`, `NameRegistry`, `NameSystem`,
`ProfileUrl`, `RegistryId`, `ResolutionStatus`, `ResolvedName`, `ReverseNames`,
`SystemDescriptor`, `SystemId`.

## Credits

GNS and WNS resolve against immutable mainnet registries; this library talks to them
directly with a minimal ABI, so it ships with **zero runtime dependencies** (viem is a
peer dependency). The registry interfaces come from
[`@donnoh/gns-utils`](https://www.npmjs.com/package/@donnoh/gns-utils) by
[lucadonnoh](https://github.com/lucadonnoh/gwei-names) and
[`wns-utils`](https://www.npmjs.com/package/wns-utils) by
[NaniDAO](https://github.com/NaniDAO/wns-utils).

## License

MIT © [1001.digital](https://1001.digital)
