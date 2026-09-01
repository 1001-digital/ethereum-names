import { http, type Address, createPublicClient, getAddress, isAddress, isAddressEqual } from 'viem'
import type { PublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { ensAvatar, ensResolve, ensReverse, ensText } from './ens.js'
import { DEFAULT_REGISTRIES, canonicalName, nsResolve, nsReverse, nsText } from './name-service.js'
import { detectSystemsIn, preferredSystemIn, resolutionCandidatesIn } from './routing.js'
import { type BuiltSystem, type ResolvableConfig, resolveConfig, unknownSystem } from './systems.js'
import type {
  EthereumNames,
  EthereumNamesConfig,
  NameMatch,
  NameRegistry,
  ResolvedName,
  ReverseNames,
  SystemDescriptor,
  SystemId,
} from './types.js'
import { safeNormalizeEns } from './utils.js'

type Match = NameMatch<string>

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** A match defaulted to "no answer"; overrides carry only what this system actually said. */
function toMatch(system: string, overrides: Partial<Match> = {}): Match {
  return { system, name: null, address: null, status: 'not-found', verified: false, ...overrides }
}

/** A result defaulted to "nothing resolved"; overrides carry only the branch's delta. */
function toResult(
  input: string,
  overrides: Partial<ResolvedName<string>> = {},
): ResolvedName<string> {
  return {
    input,
    name: null,
    address: null,
    system: null,
    status: 'not-found',
    verified: false,
    ambiguous: false,
    matches: [],
    ...overrides,
  }
}

/** Promote the winning match of a lookup to the top-level result. */
function fromMatch(
  input: string,
  match: Match,
  matches: readonly Match[],
  ambiguous = false,
): ResolvedName<string> {
  return toResult(input, {
    name: match.name,
    address: match.address,
    system: match.system,
    status: 'resolved',
    verified: match.verified,
    ambiguous,
    matches,
  })
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
 *   registries: [...DEFAULT_REGISTRIES, { id: 'foo', suffixes: ['.foo'], contract: '0x…' }],
 * })
 *
 * const result = await names.lookup('alice.foo')
 * result.system   // 'foo'  — ids are inferred, so this is exactly typed
 * result.status   // 'resolved' | 'not-found' | 'ambiguous' | 'error'
 * ```
 */
export function createEthereumNames<
  const R extends readonly NameRegistry[] = typeof DEFAULT_REGISTRIES,
>(config: EthereumNamesConfig<R> = {}): EthereumNames<SystemId<R>> {
  type S = SystemId<R>

  const client: PublicClient =
    config.client ??
    createPublicClient({
      chain: config.chain ?? mainnet,
      transport: http(config.rpcUrl),
    })

  // The id inference is erased here and restored at the public boundary below.
  const { descriptors, byId, priority, bareLabel, verify, collisions } = resolveConfig({
    ...config,
    registries: config.registries ?? DEFAULT_REGISTRIES,
  } as ResolvableConfig)

  /** The systems reverse lookups walk, in priority order. */
  const prioritySystems = priority.flatMap((id) => {
    const system = byId.get(id)
    return system ? [system] : []
  })

  /**
   * The canonical form of `name` for one system, or `null` if it is not a valid
   * name there. The single normalization point — every read below passes the
   * canonical name onward.
   */
  function canonicalFor(system: BuiltSystem, name: string): string | null {
    if (system.kind === 'ens') return safeNormalizeEns(name)
    return canonicalName(name, system.suffixes)
  }

  /** Resolve an already-canonical name in exactly one system, with no error swallowing. */
  function forwardIn(system: BuiltSystem, canonical: string): Promise<Address | null> {
    if (system.kind === 'ens') return ensResolve(client, canonical)
    return nsResolve(client, system.contract, canonical)
  }

  async function forwardMatch(system: BuiltSystem, name: string): Promise<Match> {
    const canonical = canonicalFor(system, name)
    if (!canonical) return toMatch(system.id)
    try {
      const address = await forwardIn(system, canonical)
      return toMatch(system.id, {
        name: canonical,
        address,
        // A registry is authoritative for its own names, so a forward answer
        // needs no second opinion — unlike a reverse record. `verified` still
        // tracks an actual answer: nothing found means nothing confirmed.
        status: address ? 'resolved' : 'not-found',
        verified: address !== null,
      })
    } catch (error) {
      return toMatch(system.id, { name: canonical, status: 'error', error: asError(error) })
    }
  }

  function breakTie(candidates: readonly Match[], input: string): Match | null {
    if (typeof collisions === 'function') return collisions(candidates, input) ?? null
    // 'priority': candidates arrive in priority order, so the tie-break is the head.
    return collisions === 'priority' ? (candidates[0] ?? null) : null
  }

  async function forwardLookup(input: string): Promise<ResolvedName<string>> {
    const candidates = resolutionCandidatesIn(input, descriptors, bareLabel, priority)
    if (candidates.length === 0) return toResult(input)

    // Candidates are in priority order, so `matches` is too — "first resolved"
    // is the priority-preferred answer wherever a single one is needed.
    const matches = await Promise.all(candidates.map((system) => forwardMatch(system, input)))
    const resolved = matches.filter((match) => match.address !== null)
    const addresses = new Set(resolved.map((match) => match.address?.toLowerCase()))
    const ambiguous = addresses.size > 1

    // One answer, or several that agree, is not a collision. Several that
    // disagree is exactly the misrouting risk `collisions` exists to handle.
    const winner = ambiguous ? breakTie(resolved, input) : (resolved[0] ?? null)
    if (winner) return fromMatch(input, winner, matches, ambiguous)
    if (ambiguous) return toResult(input, { status: 'ambiguous', ambiguous: true, matches })

    // Nothing resolved: report what we asked, and whether we actually got an
    // answer. "The RPC failed" and "the name is unregistered" are different
    // facts and a wallet must be able to tell them apart.
    const fallback = matches.find((match) => match.status === 'error') ?? matches[0]
    return toResult(input, {
      name: fallback?.name ?? null,
      system: fallback?.system ?? null,
      status: fallback?.status === 'error' ? 'error' : 'not-found',
      matches,
    })
  }

  /** Read one system's primary name for an address, forward-verifying it when enabled. */
  async function reverseMatch(system: BuiltSystem, address: Address): Promise<Match> {
    try {
      const name =
        system.kind === 'ens'
          ? await ensReverse(client, address)
          : await nsReverse(client, system.contract, address)
      if (!name) return toMatch(system.id, { address })
      // `verified: false` without `verify` is the honest answer: nobody checked.
      if (!verify) return toMatch(system.id, { name, address, status: 'resolved' })
      const canonical = canonicalFor(system, name)
      const forward = canonical ? await forwardIn(system, canonical).catch(() => null) : null
      if (forward && isAddressEqual(forward, address)) {
        return toMatch(system.id, { name, address, status: 'resolved', verified: true })
      }
      return toMatch(system.id, { name, address, status: 'unverified' })
    } catch (error) {
      return toMatch(system.id, { address, status: 'error', error: asError(error) })
    }
  }

  /**
   * Reverse lookups stop at the first system with a trustworthy name, so
   * `matches` lists what was actually consulted rather than every system. Use
   * `reverseAll()` for the complete picture.
   */
  async function reverseLookup(input: string, address: Address): Promise<ResolvedName<string>> {
    const matches: Match[] = []
    for (const system of prioritySystems) {
      const match = await reverseMatch(system, address)
      matches.push(match)
      if (match.status === 'resolved') return fromMatch(input, match, matches)
    }

    // A reverse record that fails its forward check is not "no name" — it is a
    // name claiming an address it does not own. Say so.
    const unverified = matches.find((match) => match.status === 'unverified')
    if (unverified) {
      return toResult(input, { address, system: unverified.system, status: 'unverified', matches })
    }

    const errored = matches.some((match) => match.status === 'error')
    return toResult(input, { address, status: errored ? 'error' : 'not-found', matches })
  }

  /** Record reads route by the single preferred system — records have no collision semantics. */
  async function textRecord(
    name: string,
    key: string,
    viaEns: (client: PublicClient, name: string, key: string) => Promise<string | null>,
  ): Promise<string | null> {
    const id = preferredSystemIn(name, descriptors, bareLabel, priority)
    const system = id ? byId.get(id) : undefined
    if (!system) return null
    const canonical = canonicalFor(system, name)
    if (!canonical) return null
    try {
      if (system.kind === 'ens') return await viaEns(client, canonical, key)
      return await nsText(client, system.contract, canonical, key)
    } catch {
      return null
    }
  }

  return {
    client,

    system(name) {
      return preferredSystemIn(name, descriptors, bareLabel, priority) as S | null
    },

    systemsFor(name) {
      return detectSystemsIn(name, descriptors) as S[]
    },

    systems() {
      return descriptors.map((system) => ({ ...system }) as SystemDescriptor<S>)
    },

    describe(system) {
      const found = byId.get(system)
      return found ? ({ ...found } as SystemDescriptor<S>) : undefined
    },

    async resolve(nameOrAddress) {
      if (!nameOrAddress) return null
      if (isAddress(nameOrAddress)) return getAddress(nameOrAddress)
      return (await forwardLookup(nameOrAddress)).address
    },

    async resolveIn(system, name) {
      const descriptor = byId.get(system)
      if (!descriptor) unknownSystem(system, byId.keys())
      if (!name) return null
      return (await forwardMatch(descriptor, name)).address
    },

    async reverse(address) {
      if (!isAddress(address)) return null
      return (await reverseLookup(address, getAddress(address))).name
    },

    async reverseAll(address) {
      const names: Record<string, string | null> = Object.fromEntries(
        descriptors.map((system) => [system.id, null]),
      )
      if (isAddress(address)) {
        const checksummed = getAddress(address)
        const matches = await Promise.all(
          descriptors.map((system) => reverseMatch(system, checksummed)),
        )
        for (const match of matches) {
          names[match.system] = match.status === 'resolved' ? match.name : null
        }
      }
      return names as ReverseNames<S>
    },

    async lookup(input) {
      const result = isAddress(input)
        ? await reverseLookup(input, getAddress(input))
        : await forwardLookup(input)
      return result as ResolvedName<S>
    },

    getAvatar(name) {
      return textRecord(name, 'avatar', (ensClient, ensName) => ensAvatar(ensClient, ensName))
    },

    getText(name, key) {
      return textRecord(name, key, ensText)
    },
  }
}
