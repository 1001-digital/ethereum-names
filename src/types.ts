import type { Address, Chain, PublicClient } from 'viem'

/** The name systems this library understands. */
export type NameSystem = 'ens' | 'gns'

/** Every primary name found for an address, keyed by system. */
export interface ReverseNames {
  /** Primary ENS name, or `null` if none is set (or it failed verification). */
  ens: string | null
  /** Primary GNS (`.gwei`) name, or `null` if none is set (or it failed verification). */
  gns: string | null
}

/** Rich result describing a resolved name or address. */
export interface ResolvedName {
  /** The original input, untouched. */
  input: string
  /** The canonical name, when known (e.g. `vitalik.eth`, `alice.gwei`). */
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
  /** Override the GNS contract address. Defaults to the canonical deployment. */
  gnsContract?: Address
  /** Order in which reverse lookups try each system. Defaults to `['ens', 'gns']`. */
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
   * (`alice.gwei` or the bare label `alice`), or an address (returned checksummed).
   * Returns `null` when nothing resolves.
   */
  resolve(nameOrAddress: string): Promise<Address | null>
  /** Reverse resolve an address to its primary name, trying each system in priority order. */
  reverse(address: string): Promise<string | null>
  /**
   * Reverse resolve an address across *both* systems, returning every primary
   * name found. Use this when an address may have both an ENS and a GNS name.
   */
  reverseAll(address: string): Promise<ReverseNames>
  /** Resolve or reverse-resolve `input`, returning a rich {@link ResolvedName}. */
  lookup(input: string): Promise<ResolvedName>
  /** Read the `avatar` for a name (ENS avatar record, or the GNS `avatar` text record). */
  getAvatar(name: string): Promise<string | null>
  /** Read an arbitrary text record for a name. */
  getText(name: string, key: string): Promise<string | null>
  /** Detect which system a name belongs to, without any network call. */
  system(name: string): NameSystem | null
}
