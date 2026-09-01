import type { Address, Chain, PublicClient } from 'viem'

/**
 * The name systems this library ships with. Configuring custom `registries`
 * widens the systems a *client* knows about — those ids are inferred from the
 * config, so `reverseAll()` keys and `system()` stay exactly typed.
 */
export type NameSystem = 'ens' | 'gns' | 'wns'

/** The ids of a registry list, as literal types. */
export type RegistryId<R> = R extends readonly { readonly id: infer I }[]
  ? I extends string
    ? I
    : never
  : never

/** Every system a client configured with `R` knows: ENS plus each registry id. */
export type SystemId<R> = 'ens' | RegistryId<R>

/**
 * A name registry speaking the GNS/WNS read interface — `computeId(string)`,
 * `resolve(uint256)`, `reverseResolve(address)`, `text(uint256, string)`.
 *
 * The claim fields (`suffixes`, `bareLabels`, `wildcard`, `excludeSuffixes`)
 * declare *which names this registry is willing to answer for*. Two systems may
 * legitimately claim the same name; that is a collision, and the library reports
 * it rather than silently picking a winner. See {@link CollisionStrategy}.
 */
export interface NameRegistry {
  /** Names this system everywhere: `system()`, `reverseAll()` keys, `priority`, `bareLabel`. Cannot be `'ens'`. */
  readonly id: string
  /** The registry contract address. */
  readonly contract: Address
  /**
   * Name suffixes this registry claims, leading dot included (e.g. `['.gwei']`).
   * The first entry is the canonical suffix appended to bare labels.
   * `.eth` is reserved for ENS and cannot be claimed.
   */
  readonly suffixes?: readonly string[]
  /** Whether a bare label (no dot, e.g. `alice`) can be a name here. GNS and WNS: yes. */
  readonly bareLabels?: boolean
  /**
   * Set for registries with permissionless namespaces (any TLD can be created),
   * which cannot be described by a fixed suffix list. A wildcard registry is a
   * candidate for *every* dotted name, so it will frequently collide with other
   * systems — that is the honest result, not a bug.
   */
  readonly wildcard?: boolean
  /** Suffixes carved out of `wildcard` (e.g. a registry that deliberately never claims `.eth`). */
  readonly excludeSuffixes?: readonly string[]
  /**
   * Human-readable name, for UI. **Display data only** — it is supplied by
   * whoever wrote the config and must never be rendered as a verification
   * signal. See {@link SystemDescriptor}.
   */
  readonly label?: string
  /** Homepage for the system, for UI. Display data only, same caveat as `label`. */
  readonly url?: string
}

/**
 * What a client knows about one configured system, for rendering "what resolved
 * and why" without hardcoding a map of ids in every app.
 *
 * > **Trust boundary:** `label` and `url` are decorative strings taken from the
 * > config. Anything that claims a result is trustworthy must come from the
 * > resolution evidence instead — {@link ResolvedName.status},
 * > {@link ResolvedName.verified}, {@link ResolvedName.ambiguous} — never from a
 * > descriptor. Rendering a descriptor as a verification badge would let a
 * > misconfigured registry present itself as ENS.
 */
export interface SystemDescriptor<S extends string = NameSystem> {
  /** The system id, as it appears in results. */
  readonly id: S
  /** `'ens'` resolves through viem's universal resolver; `'registry'` is a contract read. */
  readonly kind: 'ens' | 'registry'
  /** Display name. Untrusted — see the note above. */
  readonly label: string
  /** Homepage. Untrusted — see the note above. */
  readonly url?: string
  /** Suffixes this system claims. Empty for ENS, which is the fallback for any unclaimed dotted name. */
  readonly suffixes: readonly string[]
  /** Whether bare labels resolve here. */
  readonly bareLabels: boolean
  /** Whether this system claims every dotted name (permissionless namespaces). */
  readonly wildcard: boolean
  /** Suffixes carved out of `wildcard`. */
  readonly excludeSuffixes: readonly string[]
  /** The registry contract. Absent for ENS. */
  readonly contract?: Address
}

/**
 * Why a lookup ended the way it did.
 *
 * - `resolved`   — an answer was found and is trustworthy
 * - `not-found`  — every system answered, none had the name/address
 * - `unverified` — a reverse record was found but failed forward verification,
 *                  so it is **not** trustworthy and is not returned as `name`
 * - `ambiguous`  — several systems resolved the input to *different* addresses
 *                  and no rule picked a winner
 * - `error`      — nothing resolved and at least one system failed to answer
 *                  (RPC down, bad contract). Distinct from `not-found`.
 */
export type ResolutionStatus = 'resolved' | 'not-found' | 'unverified' | 'ambiguous' | 'error'

/** Per-system outcome. `ambiguous` is an aggregate, so it never appears here. */
export type MatchStatus = Exclude<ResolutionStatus, 'ambiguous'>

/** What one system answered, and whether it can be trusted. */
export interface NameMatch<S extends string = NameSystem> {
  /** The system that produced this answer. */
  readonly system: S
  /** The canonical name, when known. */
  readonly name: string | null
  /** The address, when known (checksummed). */
  readonly address: Address | null
  /** This system's outcome. */
  readonly status: MatchStatus
  /**
   * Whether this specific answer is confirmed.
   *
   * Forward lookups: `true` whenever an address was found — the registry is
   * authoritative for its own names, so there is nothing to second-guess.
   * Reverse lookups: `true` only when the name forward-resolved back to the same
   * address. It is `false` when verification failed *and* when `verify` is
   * disabled, so `false` always means "nothing confirmed this".
   */
  readonly verified: boolean
  /** The underlying failure, when `status` is `'error'`. */
  readonly error?: Error
}

/**
 * Rich result describing a resolved name or address, including the evidence a
 * wallet needs to explain — or refuse — what it is about to do.
 */
export interface ResolvedName<S extends string = NameSystem> {
  /** The original input, untouched. */
  readonly input: string
  /** The canonical name, when known and trustworthy (`null` when `status` is `'unverified'`). */
  readonly name: string | null
  /** The resolved address, when known (checksummed). */
  readonly address: Address | null
  /** Which system produced the result, or `null` if nothing resolved. */
  readonly system: S | null
  /** Why the lookup ended this way. See {@link ResolutionStatus}. */
  readonly status: ResolutionStatus
  /** Whether the answer was forward-verified. See {@link NameMatch.verified}. */
  readonly verified: boolean
  /**
   * `true` when more than one system resolved this *name* to a **different**
   * address — a cross-registry namespace collision. Stays `true` even when a
   * rule picked a winner, so a payment UI can warn on it. Always `false` for
   * reverse lookups, where holding several names is normal, not dangerous.
   */
  readonly ambiguous: boolean
  /**
   * Every answer collected, in priority order.
   *
   * Forward lookups list every candidate system. Reverse lookups list the
   * systems actually consulted before one produced a verified name — enough to
   * explain an `unverified` result without paying for every system on every
   * call. Use `reverseAll()` for the complete reverse picture.
   */
  readonly matches: readonly NameMatch<S>[]
}

/** Every primary name found for an address, keyed by system id. */
export type ReverseNames<S extends string = NameSystem> = { [K in S]: string | null }

/**
 * Picks a winner when several systems resolve the same name to different
 * addresses. Return `null` to leave the input ambiguous.
 */
export type CollisionResolver<S extends string = NameSystem> = (
  candidates: readonly NameMatch<S>[],
  input: string,
) => NameMatch<S> | null | undefined

/**
 * How to handle a name that resolves in more than one system.
 *
 * - `'safe'` (default) — refuse to guess: `resolve()` returns `null` and
 *   `lookup()` reports `status: 'ambiguous'` with every match, so the app can
 *   ask the user. Fails closed, which is what payment flows need.
 * - `'priority'` — take the first match in `priority` order. Convenient,
 *   deterministic, and silently privileges one registry over another.
 * - a {@link CollisionResolver} — your own rule.
 */
export type CollisionStrategy<S extends string = NameSystem> =
  | 'safe'
  | 'priority'
  | CollisionResolver<S>

export interface EthereumNamesConfig<R extends readonly NameRegistry[] = readonly NameRegistry[]> {
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
   * (GNS and WNS). This *replaces* the defaults, so spread them to add one:
   *
   * ```ts
   * registries: [...DEFAULT_REGISTRIES, { id: 'foo', suffixes: ['.foo'], contract: '0x…' }]
   * ```
   *
   * ENS is always present and cannot be replaced.
   */
  registries?: R
  /** Override the GNS contract address. Applies to the registry with id `gns`. */
  gnsContract?: Address
  /** Override the WNS contract address. Applies to the registry with id `wns`. */
  wnsContract?: Address
  /**
   * Which system wins when a bare label (no dot, e.g. `alice`) is claimed by
   * several registries. GNS (`.gwei`) and WNS (`.wei`) both accept bare labels,
   * so the input is genuinely ambiguous; this picks one instead of guessing.
   * Defaults to `'ens'`, which claims no bare labels — so by default a bare
   * label stays ambiguous and resolves to `null`. Set `'gns'` or `'wns'` to opt in.
   */
  bareLabel?: NoInfer<SystemId<R>>
  /**
   * Order systems are tried in: reverse lookups return the first match, and
   * `collisions: 'priority'` breaks forward ties with it. Defaults to `'ens'`
   * followed by each registry in configured order.
   */
  priority?: readonly NoInfer<SystemId<R>>[]
  /**
   * @deprecated Use `priority`, which covers reverse order *and* forward
   * collision tie-breaking. Still honored when `priority` is not set.
   */
  reversePriority?: readonly NoInfer<SystemId<R>>[]
  /**
   * What to do when one name resolves in several systems. Defaults to `'safe'`
   * — never silently pick. See {@link CollisionStrategy}.
   */
  collisions?: CollisionStrategy<NoInfer<SystemId<R>>>
  /**
   * Forward-verify reverse lookups: after reading an address's primary name,
   * resolve that name back and confirm it points to the same address before
   * trusting it. Guards against spoofed reverse records (notably for ENS, whose
   * reverse records are not self-validating). Defaults to `true`.
   */
  verify?: boolean
}

export interface EthereumNames<S extends string = NameSystem> {
  /** The underlying viem client. */
  readonly client: PublicClient
  /**
   * Resolve a name to an address. Accepts ENS names (`vitalik.eth`), registry
   * names (`alice.gwei`, `alice.wei`, or a bare label), or an address (returned
   * checksummed). Returns `null` when nothing resolves — including when the name
   * is ambiguous across systems and no rule picked a winner. Use `lookup()` to
   * tell those two apart.
   */
  resolve(nameOrAddress: string): Promise<Address | null>
  /**
   * Resolve a name in one named system, skipping shape detection entirely.
   * The unambiguous counterpart to `resolve()` — use it after `lookup()` reports
   * a collision and the user has chosen. Throws if `system` is not configured.
   */
  resolveIn(system: S, name: string): Promise<Address | null>
  /** Reverse resolve an address to its primary name, trying each system in priority order. */
  reverse(address: string): Promise<string | null>
  /**
   * Reverse resolve an address across *all* systems, returning every primary
   * name found, keyed by system id.
   */
  reverseAll(address: string): Promise<ReverseNames<S>>
  /**
   * Resolve or reverse-resolve `input`, returning a rich {@link ResolvedName}
   * with the evidence behind the answer: which system responded, whether it was
   * verified, whether anything else claimed the same name, and what each system
   * said.
   */
  lookup(input: string): Promise<ResolvedName<S>>
  /**
   * Read the `avatar` for a name (the ENS avatar record, or the registry's
   * `avatar` text record).
   */
  getAvatar(name: string): Promise<string | null>
  /** Read an arbitrary text record for a name. */
  getText(name: string, key: string): Promise<string | null>
  /**
   * The single system a name routes to, without any network call.
   *
   * This is the convenience view and cannot express a collision: when several
   * systems claim the name it returns the preferred one. Use `systemsFor()` to
   * see every claimant.
   */
  system(name: string): S | null
  /** Every system that claims `name`, without any network call. More than one means a collision. */
  systemsFor(name: string): S[]
  /** Describe every configured system, for UI. See the trust note on {@link SystemDescriptor}. */
  systems(): SystemDescriptor<S>[]
  /** Describe one configured system by id, or `undefined` if it is not configured. */
  describe(system: string): SystemDescriptor<S> | undefined
}
