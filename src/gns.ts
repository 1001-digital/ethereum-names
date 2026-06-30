import { GNS_CONTRACT, gnsAbi, normalizeName } from '@donnoh/gns-utils'
import { type Address, getAddress, isAddressEqual, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import type { PublicClient } from 'viem'

/** The canonical GNS contract (same address on mainnet and Sepolia). */
export const DEFAULT_GNS_CONTRACT = GNS_CONTRACT as Address

/** Compute the on-chain token id for a `.gwei` name. */
function tokenId(client: PublicClient, contract: Address, name: string): Promise<bigint> {
  return readContract(client, {
    address: contract,
    abi: gnsAbi,
    functionName: 'computeId',
    args: [normalizeName(name)],
  }) as Promise<bigint>
}

/** Resolve a `.gwei` name to an address. */
export async function gnsResolve(
  client: PublicClient,
  contract: Address,
  name: string,
): Promise<Address | null> {
  const id = await tokenId(client, contract, name)
  if (id === 0n) return null
  const addr = (await readContract(client, {
    address: contract,
    abi: gnsAbi,
    functionName: 'resolve',
    args: [id],
  })) as Address
  if (!addr || isAddressEqual(addr, zeroAddress)) return null
  return getAddress(addr)
}

/** Reverse resolve an address to its primary `.gwei` name. */
export async function gnsReverse(
  client: PublicClient,
  contract: Address,
  address: Address,
): Promise<string | null> {
  const name = (await readContract(client, {
    address: contract,
    abi: gnsAbi,
    functionName: 'reverseResolve',
    args: [address],
  })) as string
  return name || null
}

/** Read a text record for a `.gwei` name. */
export async function gnsText(
  client: PublicClient,
  contract: Address,
  name: string,
  key: string,
): Promise<string | null> {
  const id = await tokenId(client, contract, name)
  if (id === 0n) return null
  const value = (await readContract(client, {
    address: contract,
    abi: gnsAbi,
    functionName: 'text',
    args: [id, key],
  })) as string
  return value || null
}
