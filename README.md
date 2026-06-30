# @1001-digital/ethereum-names

One clean, [viem](https://viem.sh)-powered API to resolve Ethereum names across both
[ENS](https://ens.domains) and the [Gwei Name Service](https://gwei.domains) (GNS).

Point it at a name — `vitalik.eth` or `alice.gwei` — and it figures out which system to
ask. Point it at an address and it gives you back the primary name. No branching in your
app code.

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
await names.resolve('alice')          // bare label → treated as alice.gwei
await names.resolve('0xd8dA...')      // address → returned checksummed

// Reverse: address → primary name (tries ENS, then GNS)
await names.reverse('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
// => 'vitalik.eth' | 'alice.gwei' | null

// Rich lookup: resolve or reverse, and learn which system answered
await names.lookup('alice.gwei')
// => { input: 'alice.gwei', name: 'alice.gwei', address: '0x...', system: 'gns' }

// Records work across both systems
await names.getAvatar('vitalik.eth')
await names.getText('alice.gwei', 'url')

// Pure, offline system detection
names.system('alice.gwei') // 'gns'
names.system('foo.eth')    // 'ens'
```

## How resolution is routed

| Input                       | System |
| --------------------------- | ------ |
| `*.gwei`                    | GNS    |
| bare label (no dot)         | GNS    |
| any other dotted name `*.eth`, `*.box`, … | ENS |
| `0x…` address               | passed through (checksummed) |

Reverse lookups try each system in order (ENS first by default) and return the first
match. Configure the order with `reversePriority`.

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
const gnsFirst = createEthereumNames({ reversePriority: ['gns', 'ens'] })
```

| Option            | Type                  | Description                                                           |
| ----------------- | --------------------- | -------------------------------------------------------------------- |
| `client`          | `PublicClient`        | A viem client to read from. Its chain must have ENS contracts.       |
| `rpcUrl`          | `string`              | RPC endpoint used when no `client` is given.                         |
| `chain`           | `Chain`               | Chain used when no `client` is given. Defaults to `mainnet`.         |
| `gnsContract`     | `Address`             | Override the GNS contract address.                                   |
| `reversePriority` | `('ens' \| 'gns')[]`  | Order reverse lookups try each system. Defaults to `['ens', 'gns']`. |

> **Note:** ENS resolution relies on viem's ENS actions, which require a chain with ENS
> contracts configured (such as `mainnet`). GNS is live at the same address on Ethereum
> mainnet and Sepolia.

## API

### `createEthereumNames(config?) → EthereumNames`

| Method                  | Returns                       | Description                                              |
| ----------------------- | ----------------------------- | ------------------------------------------------------- |
| `resolve(nameOrAddress)`| `Promise<Address \| null>`    | Name → address. Addresses pass through, checksummed.    |
| `reverse(address)`      | `Promise<string \| null>`     | Address → primary name across systems.                  |
| `lookup(input)`         | `Promise<ResolvedName>`       | Resolve or reverse, with the answering `system`.        |
| `getAvatar(name)`       | `Promise<string \| null>`     | Avatar record (ENS avatar, or GNS `avatar` text).       |
| `getText(name, key)`    | `Promise<string \| null>`     | Arbitrary text record.                                  |
| `system(name)`          | `'ens' \| 'gns' \| null`      | Offline system detection.                               |
| `client`                | `PublicClient`                | The underlying viem client.                             |

Also exported: `detectSystem(name)`, `DEFAULT_GNS_CONTRACT`, and the types
`EthereumNames`, `EthereumNamesConfig`, `NameSystem`, `ResolvedName`.

## Credits

GNS resolution builds on [`@donnoh/gns-utils`](https://www.npmjs.com/package/@donnoh/gns-utils)
by [lucadonnoh](https://github.com/lucadonnoh/gwei-names).

## License

MIT © [1001.digital](https://1001.digital)
