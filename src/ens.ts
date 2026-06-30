import type { Address, PublicClient } from 'viem'
import { getEnsAddress, getEnsAvatar, getEnsName, getEnsText } from 'viem/actions'
import { safeNormalizeEns } from './utils.js'

/** Resolve an ENS name to an address via viem's universal resolver. */
export async function ensResolve(client: PublicClient, name: string): Promise<Address | null> {
  const normalized = safeNormalizeEns(name)
  if (!normalized) return null
  return getEnsAddress(client, { name: normalized })
}

/** Reverse resolve an address to its primary ENS name. */
export function ensReverse(client: PublicClient, address: Address): Promise<string | null> {
  return getEnsName(client, { address })
}

/** Read the ENS avatar record for a name. */
export async function ensAvatar(client: PublicClient, name: string): Promise<string | null> {
  const normalized = safeNormalizeEns(name)
  if (!normalized) return null
  return getEnsAvatar(client, { name: normalized })
}

/** Read an arbitrary ENS text record for a name. */
export async function ensText(
  client: PublicClient,
  name: string,
  key: string,
): Promise<string | null> {
  const normalized = safeNormalizeEns(name)
  if (!normalized) return null
  return getEnsText(client, { name: normalized, key })
}
