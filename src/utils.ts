import { normalize } from 'viem/ens'
import type { NameSystem } from './types.js'

/**
 * Detect which name system an input belongs to, purely from its shape — no
 * network calls.
 *
 * - `*.wei` → `wns`
 * - `*.gwei` → `gns`
 * - any other dotted name (`*.eth`, `*.box`, …) → `ens`
 * - a bare label (no dot) → `bareLabel` (default `'ens'`), since it is
 *   ambiguous between the GNS/WNS bare-label namespaces
 * - empty input → `null`
 */
export function detectSystem(input: string, bareLabel: NameSystem = 'ens'): NameSystem | null {
  const value = input.trim().toLowerCase()
  if (!value) return null
  if (value.endsWith('.wei')) return 'wns'
  if (value.endsWith('.gwei')) return 'gns'
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
