import { type Address, createPublicClient, getAddress, http, isAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { normalizeName } from '@donnoh/gns-utils'
import { ensAvatar, ensResolve, ensReverse, ensText } from './ens.js'
import { DEFAULT_GNS_CONTRACT, gnsResolve, gnsReverse, gnsText } from './gns.js'
import type { EthereumNames, EthereumNamesConfig, NameSystem, ResolvedName } from './types.js'
import { detectSystem, safeNormalizeEns } from './utils.js'

/**
 * Create a unified ENS + GNS name client.
 *
 * @example
 * ```ts
 * import { createEthereumNames } from '@1001-digital/ethereum-names'
 *
 * const names = createEthereumNames()
 *
 * await names.resolve('vitalik.eth')   // ENS  → 0x...
 * await names.resolve('alice.gwei')    // GNS  → 0x...
 * await names.reverse('0xd8dA...')     // → 'vitalik.eth' | 'alice.gwei' | null
 * ```
 *
 * @example
 * ```ts
 * // Bring your own viem client
 * import { createPublicClient, http } from 'viem'
 * import { mainnet } from 'viem/chains'
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() })
 * const names = createEthereumNames({ client })
 * ```
 */
export function createEthereumNames(config: EthereumNamesConfig = {}): EthereumNames {
  const client =
    config.client ??
    createPublicClient({
      chain: config.chain ?? mainnet,
      transport: http(config.rpcUrl),
    })

  const gnsContract = config.gnsContract ?? DEFAULT_GNS_CONTRACT
  const reversePriority: NameSystem[] = config.reversePriority ?? ['ens', 'gns']

  /** Canonical form of a name for a given system. */
  function canonical(name: string, system: NameSystem | null): string | null {
    if (system === 'gns') return normalizeName(name)
    if (system === 'ens') return safeNormalizeEns(name)
    return null
  }

  async function resolveName(name: string, system: NameSystem): Promise<Address | null> {
    try {
      if (system === 'ens') return await ensResolve(client, name)
      return await gnsResolve(client, gnsContract, name)
    } catch {
      return null
    }
  }

  async function reverseFor(system: NameSystem, address: Address): Promise<string | null> {
    try {
      if (system === 'ens') return await ensReverse(client, address)
      return await gnsReverse(client, gnsContract, address)
    } catch {
      return null
    }
  }

  return {
    client,

    system(name) {
      return detectSystem(name)
    },

    async resolve(nameOrAddress) {
      if (!nameOrAddress) return null
      if (isAddress(nameOrAddress)) return getAddress(nameOrAddress)
      const system = detectSystem(nameOrAddress)
      if (!system) return null
      return resolveName(nameOrAddress, system)
    },

    async reverse(address) {
      if (!isAddress(address)) return null
      const checksummed = getAddress(address)
      for (const system of reversePriority) {
        const name = await reverseFor(system, checksummed)
        if (name) return name
      }
      return null
    },

    async lookup(input): Promise<ResolvedName> {
      if (isAddress(input)) {
        const address = getAddress(input)
        for (const system of reversePriority) {
          const name = await reverseFor(system, address)
          if (name) return { input, name, address, system }
        }
        return { input, name: null, address, system: null }
      }

      const system = detectSystem(input)
      if (!system) return { input, name: null, address: null, system: null }
      const address = await resolveName(input, system)
      return { input, name: canonical(input, system), address, system }
    },

    async getAvatar(name) {
      const system = detectSystem(name)
      try {
        if (system === 'ens') return await ensAvatar(client, name)
        if (system === 'gns') return await gnsText(client, gnsContract, name, 'avatar')
      } catch {
        return null
      }
      return null
    },

    async getText(name, key) {
      const system = detectSystem(name)
      try {
        if (system === 'ens') return await ensText(client, name, key)
        if (system === 'gns') return await gnsText(client, gnsContract, name, key)
      } catch {
        return null
      }
      return null
    },
  }
}
