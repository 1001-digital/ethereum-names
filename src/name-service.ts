import { type Address, getAddress, isAddressEqual, zeroAddress } from 'viem'
import type { PublicClient } from 'viem'
import { readContract } from 'viem/actions'
import type { NameRegistry } from './types.js'
import { lower } from './utils.js'

/**
 * GNS and WNS are ERC-721 name registries with identical read interfaces,
 * both immutably deployed to Ethereum mainnet. We talk to them directly over
 * the shared viem client rather than pulling in a per-service utility library:
 * the addresses are frozen, the token id is derived on-chain by the pure
 * `computeId`, and normalization is a trivial lowercase/trim/suffix.
 *
 * Nothing here is GNS- or WNS-specific beyond the two default addresses below.
 * Any registry with the same read surface is just another entry in
 * {@link DEFAULT_REGISTRIES}, or in the `registries` config option.
 */

/** The Gwei Name Service registry (`.gwei`). Same address on mainnet and Sepolia. */
export const DEFAULT_GNS_CONTRACT = '0x9D51D507BC7264d4fE8Ad1cf7Fe191933A0a81d6' as Address
/** The Wei Name Service registry (`.wei`). */
export const DEFAULT_WNS_CONTRACT = '0x0000000000696760E15f265e828DB644A0c242EB' as Address

/**
 * The registries resolved against out of the box. Spread this to add your own
 * without dropping GNS and WNS:
 *
 * ```ts
 * createEthereumNames({
 *   registries: [...DEFAULT_REGISTRIES, { id: 'foo', suffixes: ['.foo'], contract: '0x…' }],
 * })
 * ```
 */
export const DEFAULT_REGISTRIES = [
  {
    id: 'gns',
    contract: DEFAULT_GNS_CONTRACT,
    suffixes: ['.gwei'],
    bareLabels: true,
    label: 'Gwei Name Service',
    url: 'https://gwei.domains',
  },
  {
    id: 'wns',
    contract: DEFAULT_WNS_CONTRACT,
    suffixes: ['.wei'],
    bareLabels: true,
    label: 'Wei Name Service',
    url: 'https://wei.domains',
  },
] as const satisfies readonly NameRegistry[]

/** The read surface every registry must expose. */
export const nameServiceAbi = [
  {
    type: 'function',
    name: 'computeId',
    stateMutability: 'pure',
    inputs: [{ name: 'fullName', type: 'string' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'resolve',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'reverseResolve',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'text',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ type: 'string' }],
  },
] as const

/**
 * Normalize a name to the canonical form a registry expects: lowercased and
 * trimmed, with the registry's primary suffix appended to a bare label.
 *
 * A name that already carries one of the registry's suffixes is left alone, and
 * so is any other dotted name — a registry with permissionless namespaces
 * (`wildcard`) owns TLDs we cannot enumerate, and one with no suffixes at all
 * takes bare labels as-is.
 */
export function canonicalName(name: string, suffixes: readonly string[]): string {
  const value = lower(name)
  if (suffixes.some((suffix) => value.endsWith(suffix))) return value
  if (value.includes('.')) return value
  return suffixes[0] ? value + suffixes[0] : value
}

/** Compute the on-chain token id for a canonical name. */
function tokenId(client: PublicClient, contract: Address, fullName: string): Promise<bigint> {
  return readContract(client, {
    address: contract,
    abi: nameServiceAbi,
    functionName: 'computeId',
    args: [fullName],
  }) as Promise<bigint>
}

/**
 * Resolve a name to an address. GNS returns id `0` for unregistered names,
 * WNS's pure `computeId` never does — the zero-address check below covers both.
 */
export async function nsResolve(
  client: PublicClient,
  contract: Address,
  fullName: string,
): Promise<Address | null> {
  const id = await tokenId(client, contract, fullName)
  if (id === 0n) return null
  const addr = (await readContract(client, {
    address: contract,
    abi: nameServiceAbi,
    functionName: 'resolve',
    args: [id],
  })) as Address
  if (!addr || isAddressEqual(addr, zeroAddress)) return null
  return getAddress(addr)
}

/** Reverse resolve an address to its primary name. */
export async function nsReverse(
  client: PublicClient,
  contract: Address,
  address: Address,
): Promise<string | null> {
  const name = (await readContract(client, {
    address: contract,
    abi: nameServiceAbi,
    functionName: 'reverseResolve',
    args: [address],
  })) as string
  return name || null
}

/** Read a text record for a name. */
export async function nsText(
  client: PublicClient,
  contract: Address,
  fullName: string,
  key: string,
): Promise<string | null> {
  const id = await tokenId(client, contract, fullName)
  if (id === 0n) return null
  const value = (await readContract(client, {
    address: contract,
    abi: nameServiceAbi,
    functionName: 'text',
    args: [id, key],
  })) as string
  return value || null
}
