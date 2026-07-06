import { type Address, getAddress, isAddressEqual, zeroAddress } from 'viem'
import type { PublicClient } from 'viem'
import { readContract } from 'viem/actions'
import { WNS_CONTRACT, normalizeName, wnsAbi } from 'wns-utils'

/** The canonical WNS contract. */
export const DEFAULT_WNS_CONTRACT = WNS_CONTRACT as Address

/**
 * Compute the on-chain token id for a `.wei` name. WNS `computeId` is a `pure`
 * hash, so it returns a non-zero id for any well-formed label regardless of
 * whether the name is registered — "not found" is detected downstream via the
 * zero address / empty record, not via the id.
 */
function tokenId(client: PublicClient, contract: Address, name: string): Promise<bigint> {
  return readContract(client, {
    address: contract,
    abi: wnsAbi,
    functionName: 'computeId',
    args: [normalizeName(name)],
  }) as Promise<bigint>
}

/** Resolve a `.wei` name to an address. */
export async function wnsResolve(
  client: PublicClient,
  contract: Address,
  name: string,
): Promise<Address | null> {
  const id = await tokenId(client, contract, name)
  const addr = (await readContract(client, {
    address: contract,
    abi: wnsAbi,
    functionName: 'resolve',
    args: [id],
  })) as Address
  if (!addr || isAddressEqual(addr, zeroAddress)) return null
  return getAddress(addr)
}

/** Reverse resolve an address to its primary `.wei` name. */
export async function wnsReverse(
  client: PublicClient,
  contract: Address,
  address: Address,
): Promise<string | null> {
  const name = (await readContract(client, {
    address: contract,
    abi: wnsAbi,
    functionName: 'reverseResolve',
    args: [address],
  })) as string
  return name || null
}

/** Read a text record for a `.wei` name. */
export async function wnsText(
  client: PublicClient,
  contract: Address,
  name: string,
  key: string,
): Promise<string | null> {
  const id = await tokenId(client, contract, name)
  const value = (await readContract(client, {
    address: contract,
    abi: wnsAbi,
    functionName: 'text',
    args: [id, key],
  })) as string
  return value || null
}
