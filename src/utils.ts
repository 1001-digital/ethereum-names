import { normalize } from 'viem/ens'
import type { NameSystem } from './types.js'

/**
 * Detect which name system an input belongs to, purely from its shape — no
 * network calls.
 *
 * - `*.wei` → `wns`
 * - `*.gwei` and bare labels (no dot) → `gns`
 * - any other dotted name (`*.eth`, `*.box`, …) → `ens`
 * - empty input → `null`
 */
export function detectSystem(input: string): NameSystem | null {
  const value = input.trim().toLowerCase()
  if (!value) return null
  if (value.endsWith('.wei')) return 'wns'
  if (value.endsWith('.gwei')) return 'gns'
  if (value.includes('.')) return 'ens'
  // A bare label is treated as a `.gwei` name, matching the GNS convention.
  return 'gns'
}

/** Normalize an ENS name (ENSIP-15), returning `null` if it is invalid. */
export function safeNormalizeEns(name: string): string | null {
  try {
    return normalize(name)
  } catch {
    return null
  }
}
