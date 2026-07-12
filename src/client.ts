import { http, type Address, createPublicClient, getAddress, isAddress, isAddressEqual } from 'viem'
import { mainnet } from 'viem/chains'
import { ensAvatar, ensResolve, ensReverse, ensText } from './ens.js'
import { DEFAULT_REGISTRIES, normalizeName, nsResolve, nsReverse, nsText } from './name-service.js'
import type {
  EthereumNames,
  EthereumNamesConfig,
  NameRegistry,
  NameSystem,
  ResolvedName,
  ReverseNames,
} from './types.js'
import { detectSystem, safeNormalizeEns } from './utils.js'

/**
 * Apply the `gnsContract`/`wnsContract` shorthands, normalize ids and suffixes,
 * and reject registries that can never resolve.
 */
function buildRegistries(config: EthereumNamesConfig): NameRegistry[] {
  const overrides: Record<string, Address | undefined> = {
    gns: config.gnsContract,
    wns: config.wnsContract,
  }

  const registries = (config.registries ?? DEFAULT_REGISTRIES).map((registry) => ({
    id: registry.id.toLowerCase(),
    suffix: registry.suffix.toLowerCase(),
    contract: overrides[registry.id.toLowerCase()] ?? registry.contract,
  }))

  const seen = new Set<string>()
  for (const { id, suffix } of registries) {
    if (id === 'ens') throw new Error('Registry id "ens" is reserved for ENS itself.')
    if (seen.has(id)) throw new Error(`Duplicate registry id "${id}".`)
    if (!suffix.startsWith('.')) {
      throw new Error(`Registry "${id}" suffix must start with a dot (got "${suffix}").`)
    }
    seen.add(id)
  }

  return registries
}

/**
 * Create a unified name client across ENS and any number of GNS/WNS-style
 * registries (GNS and WNS by default).
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
 *
 * @example
 * ```ts
 * // Teach it a TLD it doesn't ship with (any registry with the same read
 * // interface: computeId / resolve / reverseResolve / text)
 * import { createEthereumNames, DEFAULT_REGISTRIES } from '@1001-digital/ethereum-names'
 *
 * const names = createEthereumNames({
 *   registries: [...DEFAULT_REGISTRIES, { id: 'foo', suffix: '.foo', contract: '0x…' }],
 * })
 *
 * await names.resolve('alice.foo')     // → 0x...
 * await names.reverseAll('0xd8dA...')  // → { ens, gns, wns, foo }
 * ```
 */
export function createEthereumNames(config: EthereumNamesConfig = {}): EthereumNames {
  const client =
    config.client ??
    createPublicClient({
      chain: config.chain ?? mainnet,
      transport: http(config.rpcUrl),
    })

  const registryList = buildRegistries(config)
  const registries: Record<string, NameRegistry> = Object.fromEntries(
    registryList.map((registry) => [registry.id, registry]),
  )
  /** Every system this client knows: ENS, then each registry in configured order. */
  const systems: NameSystem[] = ['ens', ...registryList.map((registry) => registry.id)]

  const reversePriority: NameSystem[] = config.reversePriority ?? systems
  const verify = config.verify ?? true
  const bareLabel: NameSystem = config.bareLabel ?? 'ens'

  function systemOf(name: string): NameSystem | null {
    return detectSystem(name, bareLabel, registryList)
  }

  /** Canonical form of a name for a given system. */
  function canonical(name: string, system: NameSystem | null): string | null {
    if (system === 'ens') return safeNormalizeEns(name)
    const registry = system ? registries[system] : undefined
    return registry ? normalizeName(name, registry.suffix) : null
  }

  async function resolveName(name: string, system: NameSystem): Promise<Address | null> {
    try {
      if (system === 'ens') return await ensResolve(client, name)
      const registry = registries[system]
      if (!registry) return null
      return await nsResolve(client, registry.contract, name, registry.suffix)
    } catch {
      return null
    }
  }

  async function rawReverse(system: NameSystem, address: Address): Promise<string | null> {
    try {
      if (system === 'ens') return await ensReverse(client, address)
      const registry = registries[system]
      if (!registry) return null
      return await nsReverse(client, registry.contract, address)
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

  /**
   * `ens`, `gns`, and `wns` are always present on {@link ReverseNames}, even when
   * a custom `registries` list drops one — so seed them alongside the configured
   * systems rather than only the latter.
   */
  function emptyReverseNames(): ReverseNames {
    const empty: ReverseNames = { ens: null, gns: null, wns: null }
    for (const system of systems) empty[system] = null
    return empty
  }

  return {
    client,

    system(name) {
      return systemOf(name)
    },

    async resolve(nameOrAddress) {
      if (!nameOrAddress) return null
      if (isAddress(nameOrAddress)) return getAddress(nameOrAddress)
      const system = systemOf(nameOrAddress)
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
      const names = emptyReverseNames()
      if (!isAddress(address)) return names
      const checksummed = getAddress(address)
      const found = await Promise.all(systems.map((system) => reverseFor(system, checksummed)))
      systems.forEach((system, index) => {
        names[system] = found[index] ?? null
      })
      return names
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

      const system = systemOf(input)
      if (!system) return { input, name: null, address: null, system: null }
      const address = await resolveName(input, system)
      return { input, name: canonical(input, system), address, system }
    },

    async getAvatar(name) {
      const system = systemOf(name)
      try {
        if (system === 'ens') return await ensAvatar(client, name)
        const registry = system ? registries[system] : undefined
        if (registry)
          return await nsText(client, registry.contract, name, 'avatar', registry.suffix)
      } catch {
        return null
      }
      return null
    },

    async getText(name, key) {
      const system = systemOf(name)
      try {
        if (system === 'ens') return await ensText(client, name, key)
        const registry = system ? registries[system] : undefined
        if (registry) return await nsText(client, registry.contract, name, key, registry.suffix)
      } catch {
        return null
      }
      return null
    },
  }
}
