import { normalizeName as gnsNormalizeName } from '@donnoh/gns-utils'
import { http, type Address, createPublicClient, getAddress, isAddress, isAddressEqual } from 'viem'
import { mainnet } from 'viem/chains'
import { normalizeName as wnsNormalizeName } from 'wns-utils'
import { ensAvatar, ensResolve, ensReverse, ensText } from './ens.js'
import { DEFAULT_GNS_CONTRACT, gnsResolve, gnsReverse, gnsText } from './gns.js'
import type {
  EthereumNames,
  EthereumNamesConfig,
  NameSystem,
  ResolvedName,
  ReverseNames,
} from './types.js'
import { detectSystem, safeNormalizeEns } from './utils.js'
import { DEFAULT_WNS_CONTRACT, wnsResolve, wnsReverse, wnsText } from './wns.js'

/**
 * Create a unified ENS + GNS + WNS name client.
 *
 * @example
 * ```ts
 * import { createEthereumNames } from '@1001-digital/ethereum-names'
 *
 * const names = createEthereumNames()
 *
 * await names.resolve('vitalik.eth')   // ENS  → 0x...
 * await names.resolve('alice.gwei')    // GNS  → 0x...
 * await names.resolve('alice.wei')     // WNS  → 0x...
 * await names.reverse('0xd8dA...')     // → 'vitalik.eth' | 'alice.gwei' | 'alice.wei' | null
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
  const wnsContract = config.wnsContract ?? DEFAULT_WNS_CONTRACT
  const reversePriority: NameSystem[] = config.reversePriority ?? ['ens', 'gns', 'wns']
  const verify = config.verify ?? true

  /** Canonical form of a name for a given system. */
  function canonical(name: string, system: NameSystem | null): string | null {
    if (system === 'gns') return gnsNormalizeName(name)
    if (system === 'wns') return wnsNormalizeName(name)
    if (system === 'ens') return safeNormalizeEns(name)
    return null
  }

  async function resolveName(name: string, system: NameSystem): Promise<Address | null> {
    try {
      if (system === 'ens') return await ensResolve(client, name)
      if (system === 'wns') return await wnsResolve(client, wnsContract, name)
      return await gnsResolve(client, gnsContract, name)
    } catch {
      return null
    }
  }

  async function rawReverse(system: NameSystem, address: Address): Promise<string | null> {
    try {
      if (system === 'ens') return await ensReverse(client, address)
      if (system === 'wns') return await wnsReverse(client, wnsContract, address)
      return await gnsReverse(client, gnsContract, address)
    } catch {
      return null
    }
  }

  /** Reverse resolve for a single system, forward-verifying the result when enabled. */
  async function reverseFor(system: NameSystem, address: Address): Promise<string | null> {
    const name = await rawReverse(system, address)
    if (!name) return null
    if (!verify) return name
    const forward = await resolveName(name, system)
    return forward && isAddressEqual(forward, address) ? name : null
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

    async reverseAll(address): Promise<ReverseNames> {
      if (!isAddress(address)) return { ens: null, gns: null, wns: null }
      const checksummed = getAddress(address)
      const [ens, gns, wns] = await Promise.all([
        reverseFor('ens', checksummed),
        reverseFor('gns', checksummed),
        reverseFor('wns', checksummed),
      ])
      return { ens, gns, wns }
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
        if (system === 'wns') return await wnsText(client, wnsContract, name, 'avatar')
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
        if (system === 'wns') return await wnsText(client, wnsContract, name, key)
      } catch {
        return null
      }
      return null
    },
  }
}
