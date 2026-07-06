import { http, type Address, createPublicClient, getAddress, isAddress, isAddressEqual } from 'viem'
import { mainnet } from 'viem/chains'
import { ensAvatar, ensResolve, ensReverse, ensText } from './ens.js'
import {
  DEFAULT_GNS_CONTRACT,
  DEFAULT_WNS_CONTRACT,
  normalizeName,
  nsResolve,
  nsReverse,
  nsText,
} from './name-service.js'
import type {
  EthereumNames,
  EthereumNamesConfig,
  NameSystem,
  ResolvedName,
  ReverseNames,
} from './types.js'
import { detectSystem, safeNormalizeEns } from './utils.js'

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

  const reversePriority: NameSystem[] = config.reversePriority ?? ['ens', 'gns', 'wns']
  const verify = config.verify ?? true
  const bareLabel: NameSystem = config.bareLabel ?? 'ens'

  /** GNS and WNS share a registry interface — only the contract and suffix differ. */
  const registries = {
    gns: { contract: config.gnsContract ?? DEFAULT_GNS_CONTRACT, suffix: '.gwei' },
    wns: { contract: config.wnsContract ?? DEFAULT_WNS_CONTRACT, suffix: '.wei' },
  } as const

  /** Canonical form of a name for a given system. */
  function canonical(name: string, system: NameSystem | null): string | null {
    if (system === 'ens') return safeNormalizeEns(name)
    if (system === 'gns' || system === 'wns') return normalizeName(name, registries[system].suffix)
    return null
  }

  async function resolveName(name: string, system: NameSystem): Promise<Address | null> {
    try {
      if (system === 'ens') return await ensResolve(client, name)
      const { contract, suffix } = registries[system]
      return await nsResolve(client, contract, name, suffix)
    } catch {
      return null
    }
  }

  async function rawReverse(system: NameSystem, address: Address): Promise<string | null> {
    try {
      if (system === 'ens') return await ensReverse(client, address)
      return await nsReverse(client, registries[system].contract, address)
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
      return detectSystem(name, bareLabel)
    },

    async resolve(nameOrAddress) {
      if (!nameOrAddress) return null
      if (isAddress(nameOrAddress)) return getAddress(nameOrAddress)
      const system = detectSystem(nameOrAddress, bareLabel)
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

      const system = detectSystem(input, bareLabel)
      if (!system) return { input, name: null, address: null, system: null }
      const address = await resolveName(input, system)
      return { input, name: canonical(input, system), address, system }
    },

    async getAvatar(name) {
      const system = detectSystem(name, bareLabel)
      try {
        if (system === 'ens') return await ensAvatar(client, name)
        if (system === 'gns' || system === 'wns') {
          const { contract, suffix } = registries[system]
          return await nsText(client, contract, name, 'avatar', suffix)
        }
      } catch {
        return null
      }
      return null
    },

    async getText(name, key) {
      const system = detectSystem(name, bareLabel)
      try {
        if (system === 'ens') return await ensText(client, name, key)
        if (system === 'gns' || system === 'wns') {
          const { contract, suffix } = registries[system]
          return await nsText(client, contract, name, key, suffix)
        }
      } catch {
        return null
      }
      return null
    },
  }
}
