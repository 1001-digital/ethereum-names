import {
  type Address,
  type PublicClient,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  getAddress,
  hexToBigInt,
  stringToHex,
  zeroAddress,
} from 'viem'
import { mainnet } from 'viem/chains'
import { nameServiceAbi } from './name-service.js'

/**
 * Test doubles for GNS/WNS-style registries.
 *
 * These stand up a real viem client over a fake transport that answers
 * `eth_call` against the registry ABI, so tests exercise the full encode →
 * dispatch → decode path rather than a mocked module. Not part of the published
 * bundle: nothing in `src/index.ts` imports it.
 */

export interface FakeRegistry {
  /** Canonical name → address. */
  names?: Record<string, Address>
  /** Address (any case) → the primary name this registry reports. */
  reverse?: Record<string, string>
  /** Canonical name → text records. */
  text?: Record<string, Record<string, string>>
  /** Mimic GNS, whose `computeId` returns 0 for names it has never seen. */
  zeroForUnknown?: boolean
  /** Make every call to this registry revert, to exercise the error path. */
  offline?: boolean
}

/** Every call this client made, for asserting on RPC cost. */
export interface CallLog {
  calls: { to: string; function: string }[]
}

/**
 * A viem client backed by the given fake registries, keyed by contract address.
 * Any call to an address that is not a configured registry throws — which is
 * what ENS lookups do here, since no universal resolver is stubbed.
 */
export function fakeClient(registries: Record<string, FakeRegistry>): {
  client: PublicClient
  log: CallLog
} {
  const byAddress = new Map<string, FakeRegistry>(
    Object.entries(registries).map(([address, registry]) => [address.toLowerCase(), registry]),
  )
  const log: CallLog = { calls: [] }

  /** `computeId` is pure on-chain; here the id is just the name's bytes as a bigint. */
  function idFor(registry: FakeRegistry, name: string): bigint {
    if (registry.zeroForUnknown && registry.names?.[name] === undefined) return 0n
    return hexToBigInt(stringToHex(name))
  }

  function nameFor(registry: FakeRegistry, id: bigint): string | undefined {
    const known = [...Object.keys(registry.names ?? {}), ...Object.keys(registry.text ?? {})]
    return known.find((name) => idFor(registry, name) === id)
  }

  const client = createPublicClient({
    chain: mainnet,
    // No retries: a failing call here is the test's point, not a flake.
    transport: custom(
      {
        async request({ method, params }) {
          if (method !== 'eth_call') throw new Error(`unexpected RPC method ${method}`)
          const [call] = params as [{ to: string; data: `0x${string}` }]
          const address = call.to.toLowerCase()
          const registry = byAddress.get(address)
          if (!registry) throw new Error(`no contract at ${call.to}`)
          if (registry.offline) throw new Error(`execution reverted at ${call.to}`)

          const { functionName, args } = decodeFunctionData({
            abi: nameServiceAbi,
            data: call.data,
          })
          log.calls.push({ to: address, function: functionName })

          if (functionName === 'computeId') {
            const [name] = args as [string]
            return encodeFunctionResult({
              abi: nameServiceAbi,
              functionName,
              result: idFor(registry, name),
            })
          }
          if (functionName === 'resolve') {
            const [id] = args as [bigint]
            const name = nameFor(registry, id)
            const found = name ? registry.names?.[name] : undefined
            return encodeFunctionResult({
              abi: nameServiceAbi,
              functionName,
              result: found ?? zeroAddress,
            })
          }
          if (functionName === 'reverseResolve') {
            const [addr] = args as [Address]
            const found = Object.entries(registry.reverse ?? {}).find(
              ([key]) => getAddress(key) === getAddress(addr),
            )
            return encodeFunctionResult({
              abi: nameServiceAbi,
              functionName,
              result: found?.[1] ?? '',
            })
          }
          const [id, key] = args as [bigint, string]
          const name = nameFor(registry, id)
          const value = name ? (registry.text?.[name]?.[key] ?? '') : ''
          return encodeFunctionResult({ abi: nameServiceAbi, functionName, result: value })
        },
      },
      { retryCount: 0 },
    ),
  })

  return { client, log }
}
