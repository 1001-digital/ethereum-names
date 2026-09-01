import { normalize } from 'viem/ens'

/** The canonical lowercase form shared by system ids, suffixes, and name inputs. */
export function lower(value: string): string {
  return value.trim().toLowerCase()
}

/** Normalize an ENS name (ENSIP-15), returning `null` if it is invalid. */
export function safeNormalizeEns(name: string): string | null {
  try {
    return normalize(name)
  } catch {
    return null
  }
}
