# @1001-digital/ethereum-names

One clean, [viem](https://viem.sh)-powered API to resolve Ethereum names across
[ENS](https://ens.domains), the [Gwei Name Service](https://gwei.domains) (GNS), and the
[Wei Name Service](https://wei.domains) (WNS).

Point it at a name — `vitalik.eth`, `alice.gwei`, or `alice.wei` — and it figures out which
system to ask. Point it at an address and it gives you back the primary name. No branching
in your app code.

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

// Rich lookup: resolve or reverse, and learn which system answered
await names.lookup('alice.wei')
// => { input: 'alice.wei', name: 'alice.wei', address: '0x...', system: 'wns' }

// Records work across all systems
await names.getAvatar('vitalik.eth')
await names.getText('alice.wei', 'url')

// Pure, offline system detection
names.system('alice.gwei') // 'gns'
names.system('alice.wei')  // 'wns'
names.system('foo.eth')    // 'ens'
```

## How resolution is routed

| Input                       | System |
| --------------------------- | ------ |
| `*.wei`                     | WNS    |
| `*.gwei`                    | GNS    |
| any suffix from a custom registry | that registry (see [Custom registries](#custom-registries)) |
| any other dotted name `*.eth`, `*.box`, … | ENS |
| bare label (no dot)         | `bareLabel` option (default ENS) |
| `0x…` address               | passed through (checksummed) |

Suffixes are matched longest-first, so `.gwei` is never mistaken for `.wei`.

A bare label like `alice` is ambiguous — GNS (`.gwei`) and WNS (`.wei`) both accept bare
labels, and they can point to different owners. Rather than guess, it resolves against the
`bareLabel` system, which defaults to `ens`. Since ENS has no bare-label namespace, bare
labels resolve to `null` by default; set `bareLabel: 'gns'` or `'wns'` to opt a label like
`alice` into that registry.

Reverse lookups try each system in order (ENS first by default) and return the first
match. Configure the order with `reversePriority`, or use `reverseAll` to get the primary
name from **all** systems at once.

By default, reverse lookups are **forward-verified**: after reading an address's primary
name, the library resolves that name back and confirms it points to the same address
before trusting it. This guards against spoofed reverse records (ENS reverse records are
not self-validating). Disable with `verify: false` to save a round-trip.

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
const gnsFirst = createEthereumNames({ reversePriority: ['gns', 'ens', 'wns'] })

// Treat bare labels (e.g. `alice`) as `.gwei` names
const gwei = createEthereumNames({ bareLabel: 'gns' })
await gwei.resolve('alice') // → resolves alice.gwei
```

| Option            | Type                  | Description                                                           |
| ----------------- | --------------------- | -------------------------------------------------------------------- |
| `client`          | `PublicClient`        | A viem client to read from. Its chain must have ENS contracts.       |
| `rpcUrl`          | `string`              | RPC endpoint used when no `client` is given.                         |
| `chain`           | `Chain`               | Chain used when no `client` is given. Defaults to `mainnet`.         |
| `registries`      | `NameRegistry[]`      | The non-ENS registries to resolve against. Defaults to `DEFAULT_REGISTRIES` (GNS + WNS). |
| `gnsContract`     | `Address`             | Override the GNS contract address.                                   |
| `wnsContract`     | `Address`             | Override the WNS contract address.                                   |
| `bareLabel`       | `NameSystem`          | System a bare label (no dot) resolves against. Defaults to `'ens'`.  |
| `reversePriority` | `NameSystem[]`        | Order reverse lookups try each system. Defaults to `'ens'` then each registry — `['ens', 'gns', 'wns']`. |
| `verify`          | `boolean`             | Forward-verify reverse lookups before trusting them. Defaults to `true`. |

> **Note:** ENS resolution relies on viem's ENS actions, which require a chain with ENS
> contracts configured (such as `mainnet`). GNS and WNS are live on Ethereum mainnet.

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
    { id: 'foo', suffix: '.foo', contract: '0x…' },
  ],
})

await names.resolve('alice.foo')     // → '0x…' | null
names.system('alice.foo')            // → 'foo'
await names.reverseAll('0xd8dA…')    // → { ens, gns, wns, foo }
await names.getText('alice.foo', 'url')
```

The `id` you choose is the name of the system everywhere else: it is what `system()` and
`lookup()` return, what `reverseAll()` keys the result by, and what you may pass to
`bareLabel` and `reversePriority`.

```ts
// Try your registry before ENS on reverse lookups, and treat bare labels as `.foo` names
createEthereumNames({
  registries: [...DEFAULT_REGISTRIES, { id: 'foo', suffix: '.foo', contract: '0x…' }],
  reversePriority: ['foo', 'ens', 'gns', 'wns'],
  bareLabel: 'foo',
})
```

A few rules, enforced at construction (they throw rather than fail silently at resolve
time): `id` cannot be `'ens'` (reserved) and must be unique; `suffix` must include its
leading dot. Because `registries` replaces the defaults, omitting the spread is how you opt
*out* of GNS or WNS. `ens`, `gns`, and `wns` remain present as `null` keys on `reverseAll`
either way, so existing consumers of that shape keep working.

ENS itself is not pluggable this way — it resolves through viem's universal resolver, which
already covers every TLD in the ENS root (`.eth`, `.box`, offchain CCIP-read names, …).
Those work with no configuration at all.

## API

### `createEthereumNames(config?) → EthereumNames`

| Method                  | Returns                       | Description                                              |
| ----------------------- | ----------------------------- | ------------------------------------------------------- |
| `resolve(nameOrAddress)`| `Promise<Address \| null>`    | Name → address. Addresses pass through, checksummed.    |
| `reverse(address)`      | `Promise<string \| null>`     | Address → primary name across systems.                  |
| `reverseAll(address)`   | `Promise<ReverseNames>`       | Address → `{ ens, gns, wns, …registries }` primary names from every system.|
| `lookup(input)`         | `Promise<ResolvedName>`       | Resolve or reverse, with the answering `system`.        |
| `getAvatar(name)`       | `Promise<string \| null>`     | Avatar record (ENS avatar, or the registry's `avatar` text). |
| `getText(name, key)`    | `Promise<string \| null>`     | Arbitrary text record.                                  |
| `system(name)`          | `NameSystem \| null`          | Offline system detection.                               |
| `client`                | `PublicClient`                | The underlying viem client.                             |

Also exported: `detectSystem(name, bareLabel?, registries?)`, `DEFAULT_REGISTRIES`,
`DEFAULT_GNS_CONTRACT`, `DEFAULT_WNS_CONTRACT`, and the types `EthereumNames`,
`EthereumNamesConfig`, `NameRegistry`, `NameSystem`, `ResolvedName`, `ReverseNames`.

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
