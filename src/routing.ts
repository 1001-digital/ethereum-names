import { DEFAULT_REGISTRIES } from './name-service.js'
import { type BuiltSystem, ENS_DESCRIPTOR, toDescriptor } from './systems.js'
import type { NameRegistry, SystemId } from './types.js'
import { lower } from './utils.js'

/** Descriptors for the out-of-the-box systems, built once — the standalone helpers default to them. */
const DEFAULT_DESCRIPTORS: readonly BuiltSystem[] = [
  ENS_DESCRIPTOR,
  ...DEFAULT_REGISTRIES.map(toDescriptor),
]

function descriptorsFor(registries: readonly NameRegistry[]): readonly BuiltSystem[] {
  if (registries === DEFAULT_REGISTRIES) return DEFAULT_DESCRIPTORS
  return [ENS_DESCRIPTOR, ...registries.map(toDescriptor)]
}

/**
 * Every system claiming a pre-normalized `value`, in configured order.
 *
 * The claim rules:
 *
 * 1. **Bare label** (no dot) — every system that accepts bare labels claims it.
 *    GNS and WNS both do, which is why `alice` is ambiguous by default.
 * 2. **Suffix claim** — a system claims a dotted name whose suffix it lists. The
 *    longest matching suffix wins, so `.bar.foo` beats `.foo`; systems tied on
 *    the same suffix all stand, because that tie *is* the collision.
 * 3. **Wildcard** — a registry with permissionless namespaces claims every
 *    dotted name outside its `excludeSuffixes`, and stacks on top of any suffix
 *    claim. This is how a name like `bob.gwei` ends up claimed by both GNS and a
 *    wildcard registry, which is exactly the situation callers need to see.
 * 4. **ENS fallback** — ENS claims any dotted name that no registry claimed by
 *    suffix. A suffix claim therefore takes that suffix away from ENS, which is
 *    why `.eth` may not be claimed at all.
 */
function claimantsIn(value: string, systems: readonly BuiltSystem[]): BuiltSystem[] {
  if (!value) return []
  if (!value.includes('.')) return systems.filter((system) => system.bareLabels)

  const claimants = new Set<string>()

  let longest = 0
  const bySuffix: { id: string; length: number }[] = []
  for (const system of systems) {
    for (const suffix of system.suffixes) {
      // Require a label in front of the suffix: `.gwei` alone is not a name.
      if (!value.endsWith(suffix) || value.length <= suffix.length) continue
      bySuffix.push({ id: system.id, length: suffix.length })
      if (suffix.length > longest) longest = suffix.length
    }
  }
  for (const claim of bySuffix) if (claim.length === longest) claimants.add(claim.id)

  for (const system of systems) {
    if (!system.wildcard) continue
    if (system.excludeSuffixes.some((suffix) => value.endsWith(suffix))) continue
    claimants.add(system.id)
  }

  if (bySuffix.length === 0) {
    for (const system of systems) if (system.kind === 'ens') claimants.add(system.id)
  }

  return systems.filter((system) => claimants.has(system.id))
}

/**
 * `list` reordered so `priority` entries come first, in priority order; the
 * rest keep their configured order. `[]` therefore means "configured order".
 */
function orderByPriority(list: readonly BuiltSystem[], priority: readonly string[]): BuiltSystem[] {
  const rank = (system: BuiltSystem) => {
    const index = priority.indexOf(system.id)
    return index === -1 ? priority.length : index
  }
  return [...list].sort((a, b) => rank(a) - rank(b))
}

/**
 * Which systems may answer when *resolving* `input`, in priority order.
 *
 * Bare labels are the exception to "every claimant answers": GNS and WNS both
 * claim them and can point at different owners, so only the configured
 * `bareLabel` system is consulted. It defaults to ENS, which claims no bare
 * labels — so by default a bare label resolves to `null` rather than silently
 * picking a registry. `detectSystemsIn` still reports the real claimants.
 */
export function resolutionCandidatesIn(
  input: string,
  systems: readonly BuiltSystem[],
  bareLabel: string,
  priority: readonly string[],
): BuiltSystem[] {
  const value = lower(input)
  if (!value) return []
  if (!value.includes('.')) {
    const system = systems.find((candidate) => candidate.id === bareLabel)
    return system ? [system] : []
  }
  return orderByPriority(claimantsIn(value, systems), priority)
}

/**
 * The single system a name routes to — the convenience view, which cannot
 * express a collision. Bare labels always report the configured `bareLabel`,
 * even when that system claims no bare labels (ENS, by default, which is why a
 * bare label resolves to `null` unless you opt in). Otherwise the first
 * claimant in priority order wins.
 */
export function preferredSystemIn(
  input: string,
  systems: readonly BuiltSystem[],
  bareLabel: string,
  priority: readonly string[],
): string | null {
  const value = lower(input)
  if (!value) return null
  if (!value.includes('.')) return bareLabel
  return orderByPriority(claimantsIn(value, systems), priority)[0]?.id ?? null
}

/** {@link detectSystems} over already-built descriptors. */
export function detectSystemsIn(input: string, systems: readonly BuiltSystem[]): string[] {
  return claimantsIn(lower(input), systems).map((system) => system.id)
}

/**
 * Every system that claims `input`, purely from its shape — no network calls.
 * More than one means a cross-registry namespace collision. See the claim
 * rules on the internal matcher above.
 */
export function detectSystems<const R extends readonly NameRegistry[] = typeof DEFAULT_REGISTRIES>(
  input: string,
  registries: R = DEFAULT_REGISTRIES as unknown as R,
): SystemId<R>[] {
  return detectSystemsIn(input, descriptorsFor(registries)) as SystemId<R>[]
}

/**
 * Detect which name system an input belongs to, purely from its shape — no
 * network calls.
 *
 * - `*.gwei` → `gns`, `*.wei` → `wns`, plus any suffix from `registries`
 * - any other dotted name (`*.eth`, `*.box`, …) → `ens`
 * - a bare label (no dot) → `bareLabel` (default `'ens'`), since it is
 *   ambiguous across the registries' bare-label namespaces
 * - empty input → `null`
 *
 * This returns one system and so cannot represent a name claimed by several.
 * Use {@link detectSystems} when that matters.
 */
export function detectSystem<const R extends readonly NameRegistry[] = typeof DEFAULT_REGISTRIES>(
  input: string,
  bareLabel: NoInfer<SystemId<R>> = 'ens' as NoInfer<SystemId<R>>,
  registries: R = DEFAULT_REGISTRIES as unknown as R,
): SystemId<R> | null {
  // An empty priority keeps the configured order: ENS first, then registries.
  return preferredSystemIn(input, descriptorsFor(registries), bareLabel, []) as SystemId<R> | null
}
