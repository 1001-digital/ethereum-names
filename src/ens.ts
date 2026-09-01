import type { Address, PublicClient } from 'viem'
import { getEnsAddress, getEnsAvatar, getEnsName, getEnsText } from 'viem/actions'

/**
 * Thin ENS reads over viem's universal resolver. Names arriving here are
 * already ENSIP-15 normalized — `canonicalFor` in the client is the single
 * normalization point, mirroring how the registry readers take canonical names.
 */

/** Resolve a normalized ENS name to an address. */
export function ensResolve(client: PublicClient, name: string): Promise<Address | null> {
  return getEnsAddress(client, { name })
}

/** Reverse resolve an address to its primary ENS name. */
export function ensReverse(client: PublicClient, address: Address): Promise<string | null> {
  return getEnsName(client, { address })
}

/** Read the ENS avatar record for a normalized name. */
export function ensAvatar(client: PublicClient, name: string): Promise<string | null> {
  return getEnsAvatar(client, { name })
}

/** Read an arbitrary ENS text record for a normalized name. */
export function ensText(client: PublicClient, name: string, key: string): Promise<string | null> {
  return getEnsText(client, { name, key })
}
