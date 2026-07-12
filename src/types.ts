import type { Address, Chain, PublicClient } from 'viem'

/**
 * The name systems this library understands: `'ens'`, plus the id of every
 * configured registry — `'gns'` and `'wns'` out of the box, or whatever ids you
 * pass as `registries`. The `(string & {})` arm keeps autocomplete for the
 * built-ins while still admitting custom ids.
 */
export type NameSystem = 'ens' | 'gns' | 'wns' | (string & {})

/**
 * A name registry speaking the GNS/WNS read interface — `computeId(string)`,
 * `resolve(uint256)`, `reverseResolve(address)`, `text(uint256, string)`.
 * Pass these as `registries` to teach the client a TLD it doesn't know.
 */
export interface NameRegistry {
  /** Names this system in `system()`, `bareLabel`, `reversePriority`, and `reverseAll`. Cannot be `'ens'`. */
  id: string
  /** The name suffix, leading dot included (e.g. `.gwei`). Matched longest-first, so `.gwei` beats `.wei`. */
  suffix: string
  /** The registry contract address. */
  contract: Address
}

/**
 * Every primary name found for an address, keyed by system. `ens`, `gns`, and
 * `wns` are always present (`null` when unset); each custom registry adds a key
 * under its own id.
 */
export interface ReverseNames {
  /** Primary ENS name, or `null` if none is set (or it failed verification). */
  ens: string | null
  /** Primary GNS (`.gwei`) name, or `null` if none is set (or it failed verification). */
  gns: string | null
  /** Primary WNS (`.wei`) name, or `null` if none is set (or it failed verification). */
  wns: string | null
  /** Primary name from a custom registry, keyed by its id. */
  [system: string]: string | null
}

/** Rich result describing a resolved name or address. */
export interface ResolvedName {
  /** The original input, untouched. */
  input: string
  /** The canonical name, when known (e.g. `vitalik.eth`, `alice.gwei`, `alice.wei`). */
  name: string | null
  /** The resolved address, when known (checksummed). */
  address: Address | null
  /** Which system produced the result, or `null` if nothing resolved. */
  system: NameSystem | null
}

export interface EthereumNamesConfig {
  /**
   * A viem `PublicClient` to read from. The client's chain must have ENS
   * contracts configured (e.g. `mainnet`) for ENS resolution to work.
   * If omitted, a mainnet client is created from `rpcUrl`/`chain`.
   */
  client?: PublicClient
  /** RPC endpoint used when no `client` is supplied. Defaults to viem's public mainnet RPC. */
  rpcUrl?: string
  /** Chain used when no `client` is supplied. Defaults to `mainnet`. */
  chain?: Chain
  /**
   * The non-ENS registries to resolve against. Defaults to `DEFAULT_REGISTRIES`
   * (GNS and WNS). This *replaces* the defaults, so spread them to add a
   * registry rather than swap them out:
   *
   * ```ts
   * registries: [...DEFAULT_REGISTRIES, { id: 'foo', suffix: '.foo', contract: '0x…' }]
   * ```
   */
  registries?: NameRegistry[]
  /** Override the GNS contract address. Applies to the registry with id `gns`. */
  gnsContract?: Address
  /** Override the WNS contract address. Applies to the registry with id `wns`. */
  wnsContract?: Address
  /**
   * Which system a bare label (no dot, e.g. `alice`) is resolved against.
   * Bare labels are ambiguous — GNS (`.gwei`) and WNS (`.wei`) both accept
   * them — so this picks one deterministically instead of guessing an owner.
   * Defaults to `'ens'`; note ENS has no bare-label namespace, so bare labels
   * resolve to `null` unless you set this to another system.
   */
  bareLabel?: NameSystem
  /**
   * Order in which reverse lookups try each system. Defaults to `'ens'` followed
   * by each configured registry, in order — `['ens', 'gns', 'wns']` by default.
   */
  reversePriority?: NameSystem[]
  /**
   * Forward-verify reverse lookups: after reading an address's primary name,
   * resolve that name back and confirm it points to the same address before
   * trusting it. Guards against spoofed reverse records (notably for ENS, whose
   * reverse records are not self-validating). Defaults to `true`.
   */
  verify?: boolean
}

export interface EthereumNames {
  /** The underlying viem client. */
  readonly client: PublicClient
  /**
   * Resolve a name to an address. Accepts ENS names (`vitalik.eth`), GNS names
   * (`alice.gwei` or the bare label `alice`), WNS names (`alice.wei`), names from
   * any custom registry, or an address (returned checksummed). Returns `null`
   * when nothing resolves.
   */
  resolve(nameOrAddress: string): Promise<Address | null>
  /** Reverse resolve an address to its primary name, trying each system in priority order. */
  reverse(address: string): Promise<string | null>
  /**
   * Reverse resolve an address across *all* systems, returning every primary
   * name found. Use this when an address may have a name in more than one system.
   */
  reverseAll(address: string): Promise<ReverseNames>
  /** Resolve or reverse-resolve `input`, returning a rich {@link ResolvedName}. */
  lookup(input: string): Promise<ResolvedName>
  /**
   * Read the `avatar` for a name (the ENS avatar record, or the registry's
   * `avatar` text record).
   */
  getAvatar(name: string): Promise<string | null>
  /** Read an arbitrary text record for a name. */
  getText(name: string, key: string): Promise<string | null>
  /** Detect which system a name belongs to, without any network call. */
  system(name: string): NameSystem | null
}
