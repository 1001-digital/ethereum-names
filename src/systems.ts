import { type Address, isAddress } from 'viem'
import { DEFAULT_REGISTRIES } from './name-service.js'
import type { CollisionStrategy, NameRegistry, SystemDescriptor } from './types.js'
import { lower } from './utils.js'

/** A configured registry, its contract required by the type. */
export type RegistrySystem = SystemDescriptor<string> & { kind: 'registry'; contract: Address }

/**
 * A configured system with its nature encoded in the type: only registries
 * carry a contract, so registry reads never need a runtime contract guard.
 */
export type BuiltSystem =
  | RegistrySystem
  | (SystemDescriptor<string> & { kind: 'ens'; contract?: undefined })

/**
 * ENS is not a registry and is never configurable: it resolves through viem's
 * universal resolver, which already covers every name in the ENS root (`.eth`,
 * `.box`, DNS-imported names, offchain CCIP-read names). It is the fallback for
 * any dotted name no registry claims.
 */
export const ENS_DESCRIPTOR: BuiltSystem = {
  id: 'ens',
  kind: 'ens',
  label: 'Ethereum Name Service',
  url: 'https://ens.domains',
  suffixes: [],
  bareLabels: false,
  wildcard: false,
  excludeSuffixes: [],
}

/**
 * `.eth` is the one suffix a registry may not claim. Claiming a suffix takes it
 * away from ENS (see `detectSystems`), and silently rerouting `.eth` — the most
 * recognized name in the ecosystem, and the one users are least likely to
 * double-check — is a phishing primitive, not a configuration choice.
 */
export const RESERVED_SUFFIXES: readonly string[] = ['.eth']

function fail(message: string): never {
  throw new Error(`[ethereum-names] ${message}`)
}

/** The one place an unknown system id is reported, wherever it is caught. */
export function unknownSystem(id: string, known: Iterable<string>, where = ''): never {
  fail(`Unknown system "${id}"${where} — configured systems are ${[...known].join(', ')}.`)
}

/**
 * Shape a raw config registry into a descriptor, without validating it. Shared
 * by `resolveConfig` and the standalone routing helpers, so the standalone
 * `detectSystem`/`detectSystems` and a built client always agree on defaults.
 */
export function toDescriptor(registry: NameRegistry): RegistrySystem {
  const id = lower(registry.id)
  return {
    id,
    kind: 'registry',
    label: registry.label ?? id.toUpperCase(),
    url: registry.url,
    suffixes: (registry.suffixes ?? []).map(lower),
    bareLabels: registry.bareLabels === true,
    wildcard: registry.wildcard === true,
    excludeSuffixes: (registry.excludeSuffixes ?? []).map(lower),
    contract: registry.contract,
  }
}

function checkSuffixes(id: string, suffixes: readonly string[], field: string): void {
  for (const suffix of suffixes) {
    if (!suffix.startsWith('.')) {
      fail(`Registry "${id}" ${field} must start with a dot (got "${suffix}").`)
    }
    if (suffix.length < 2 || /\s/.test(suffix)) {
      fail(`Registry "${id}" ${field} "${suffix}" is not a usable suffix.`)
    }
  }
}

/** {@link EthereumNamesConfig} with the inferred registry ids erased — what construction consumes. */
export interface ResolvableConfig {
  registries?: readonly NameRegistry[]
  gnsContract?: Address
  wnsContract?: Address
  bareLabel?: string
  priority?: readonly string[]
  reversePriority?: readonly string[]
  collisions?: CollisionStrategy<string>
  verify?: boolean
}

/** Everything `createEthereumNames` needs, resolved and validated in one place. */
export interface ResolvedConfig {
  /** ENS first, then each registry in configured order. */
  descriptors: BuiltSystem[]
  byId: Map<string, BuiltSystem>
  priority: string[]
  bareLabel: string
  verify: boolean
  collisions: CollisionStrategy<string>
}

/**
 * Resolve the config into the systems a client knows, applying every default
 * and back-compat shim (`gnsContract`/`wnsContract` overrides, the deprecated
 * `reversePriority` alias) and rejecting anything that can never resolve — at
 * construction, loudly, rather than as a silent `null` later.
 */
export function resolveConfig(config: ResolvableConfig): ResolvedConfig {
  const overrides: Record<string, Address | undefined> = {
    gns: config.gnsContract,
    wns: config.wnsContract,
  }

  const byId = new Map<string, BuiltSystem>([[ENS_DESCRIPTOR.id, ENS_DESCRIPTOR]])

  for (const raw of config.registries ?? DEFAULT_REGISTRIES) {
    const registry = toDescriptor(raw)
    const { id } = registry

    if (!id || /\s/.test(id)) fail(`Registry id "${raw.id}" is empty or contains whitespace.`)
    if (id === 'ens') fail('Registry id "ens" is reserved for ENS itself.')
    if (byId.has(id)) fail(`Duplicate registry id "${id}".`)

    const contract = overrides[id] ?? registry.contract
    if (!contract || !isAddress(contract)) {
      fail(`Registry "${id}" contract "${contract}" is not a valid address.`)
    }

    checkSuffixes(id, registry.suffixes, 'suffix')
    for (const suffix of registry.suffixes) {
      if (RESERVED_SUFFIXES.includes(suffix)) {
        fail(`Registry "${id}" may not claim "${suffix}" — it is reserved for ENS.`)
      }
    }

    checkSuffixes(id, registry.excludeSuffixes, 'excludeSuffixes')
    if (registry.excludeSuffixes.length > 0 && !registry.wildcard) {
      fail(`Registry "${id}" sets excludeSuffixes but is not a wildcard registry.`)
    }
    if (registry.suffixes.length === 0 && !registry.wildcard && !registry.bareLabels) {
      fail(`Registry "${id}" claims no names — give it suffixes, or set wildcard/bareLabels.`)
    }

    byId.set(id, { ...registry, contract })
  }

  const descriptors = [...byId.values()]
  const ids = descriptors.map((system) => system.id)

  const priority = [...(config.priority ?? config.reversePriority ?? ids)]
  for (const id of priority) {
    if (!ids.includes(id)) unknownSystem(id, ids, ' in priority')
  }

  const bareLabel = config.bareLabel ?? 'ens'
  if (!ids.includes(bareLabel)) unknownSystem(bareLabel, ids, ' for bareLabel')

  const collisions = config.collisions ?? 'safe'
  if (typeof collisions !== 'function' && collisions !== 'safe' && collisions !== 'priority') {
    fail(`Unknown collision strategy "${collisions}".`)
  }

  return { descriptors, byId, priority, bareLabel, verify: config.verify ?? true, collisions }
}
