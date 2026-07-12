import { normalize } from 'viem/ens'
import { DEFAULT_REGISTRIES } from './name-service.js'
import type { NameRegistry, NameSystem } from './types.js'

/** Just the parts of a {@link NameRegistry} that matter for shape detection. */
type SuffixRule = Pick<NameRegistry, 'id' | 'suffix'>

/**
 * Detect which name system an input belongs to, purely from its shape — no
 * network calls.
 *
 * - a name ending in a registry's suffix → that registry's id (`.gwei` → `gns`,
 *   `.wei` → `wns`, and whatever else you pass as `registries`)
 * - any other dotted name (`*.eth`, `*.box`, …) → `ens`
 * - a bare label (no dot) → `bareLabel` (default `'ens'`), since it is
 *   ambiguous across the registries' bare-label namespaces
 * - empty input → `null`
 *
 * Suffixes are matched longest-first, so `.gwei` is never mistaken for `.wei`
 * regardless of the order `registries` is given in.
 */
export function detectSystem(
  input: string,
  bareLabel: NameSystem = 'ens',
  registries: readonly SuffixRule[] = DEFAULT_REGISTRIES,
): NameSystem | null {
  const value = input.trim().toLowerCase()
  if (!value) return null
  const match = [...registries]
    .sort((a, b) => b.suffix.length - a.suffix.length)
    .find((registry) => value.endsWith(registry.suffix.toLowerCase()))
  if (match) return match.id
  if (value.includes('.')) return 'ens'
  // A bare label (no dot) is ambiguous across systems; route it per config.
  return bareLabel
}

/** Normalize an ENS name (ENSIP-15), returning `null` if it is invalid. */
export function safeNormalizeEns(name: string): string | null {
  try {
    return normalize(name)
  } catch {
    return null
  }
}
