import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fakeClient } from './fixtures.js'
import { DEFAULT_GNS_CONTRACT, DEFAULT_REGISTRIES, createEthereumNames } from './index.js'
import type { NameRegistry } from './index.js'

const ALICE = '0x00000000000000000000000000000000000000A1'
const BOB = '0x00000000000000000000000000000000000000b2'
const WILD_CONTRACT = '0x00000000000000000000000000000000000000F0'

/** A registry with permissionless namespaces — it claims `bob.gwei` too. */
const WILD = {
  id: 'wild',
  contract: WILD_CONTRACT,
  wildcard: true,
  excludeSuffixes: ['.eth'],
  label: 'Wildcard Names',
} as const satisfies NameRegistry

/** GNS alone, holding `alice.gwei`. ENS is unreachable here, as no resolver is stubbed. */
function gnsOnly(overrides: Parameters<typeof fakeClient>[0][string] = {}) {
  return fakeClient({
    [DEFAULT_GNS_CONTRACT]: {
      names: { 'alice.gwei': ALICE },
      zeroForUnknown: true,
      ...overrides,
    },
  })
}

test('a name resolves through its registry', async () => {
  const { client, log } = gnsOnly()
  const names = createEthereumNames({ client })

  assert.equal(await names.resolve('alice.gwei'), ALICE)
  assert.equal(await names.resolve('ALICE.GWEI'), ALICE)
  assert.equal(await names.resolve('nobody.gwei'), null)
  // one candidate means one system is asked — no cost added by collision
  // handling — and the second read of `alice.gwei` reuses its memoized id,
  // while the unknown name (id 0, mutable registry state) is asked again
  assert.deepEqual(
    log.calls.map((call) => call.function),
    ['computeId', 'resolve', 'resolve', 'computeId'],
  )
})

test('a repeat read of the same name skips the computeId round-trip', async () => {
  const { client, log } = fakeClient({
    [DEFAULT_GNS_CONTRACT]: {
      names: { 'alice.gwei': ALICE },
      text: { 'alice.gwei': { url: 'https://alice.example' } },
      zeroForUnknown: true,
    },
  })
  const names = createEthereumNames({ client })

  assert.equal(await names.resolve('alice.gwei'), ALICE)
  assert.equal(await names.resolve('alice.gwei'), ALICE)
  assert.equal(await names.getText('alice.gwei', 'url'), 'https://alice.example')
  // the id is computed once; the repeat resolve and the text read reuse it
  assert.deepEqual(
    log.calls.map((call) => call.function),
    ['computeId', 'resolve', 'resolve', 'text'],
  )
})

test('an unregistered name is never cached — its id 0 is registry state, not a hash', async () => {
  const { client, log } = gnsOnly()
  const names = createEthereumNames({ client })

  assert.equal(await names.resolve('nobody.gwei'), null)
  assert.equal(await names.resolve('nobody.gwei'), null)
  // GNS answers id 0 until the name is registered, so both reads must ask
  assert.deepEqual(
    log.calls.map((call) => call.function),
    ['computeId', 'computeId'],
  )
})

test('the id memo is per client instance, not shared across clients', async () => {
  const { client, log } = gnsOnly()
  assert.equal(await createEthereumNames({ client }).resolve('alice.gwei'), ALICE)
  assert.equal(await createEthereumNames({ client }).resolve('alice.gwei'), ALICE)
  // two clients, two memos: each pays for its own computeId
  assert.deepEqual(
    log.calls.map((call) => call.function),
    ['computeId', 'resolve', 'computeId', 'resolve'],
  )
})

test('a bare label resolves against the configured bareLabel system', async () => {
  const { client } = gnsOnly()
  assert.equal(await createEthereumNames({ client }).resolve('alice'), null)
  assert.equal(await createEthereumNames({ client, bareLabel: 'gns' }).resolve('alice'), ALICE)
})

test('lookup reports which system answered, and that it is trustworthy', async () => {
  const { client } = gnsOnly()
  const names = createEthereumNames({ client })

  const found = await names.lookup('alice.gwei')
  assert.deepEqual(found, {
    input: 'alice.gwei',
    name: 'alice.gwei',
    address: ALICE,
    system: 'gns',
    status: 'resolved',
    verified: true,
    ambiguous: false,
    matches: [
      { system: 'gns', name: 'alice.gwei', address: ALICE, status: 'resolved', verified: true },
    ],
  })

  const missing = await names.lookup('nobody.gwei')
  assert.deepEqual(missing, {
    input: 'nobody.gwei',
    name: 'nobody.gwei',
    address: null,
    system: 'gns',
    status: 'not-found',
    verified: false,
    ambiguous: false,
    matches: [
      { system: 'gns', name: 'nobody.gwei', address: null, status: 'not-found', verified: false },
    ],
  })
})

test('an unreachable registry is an error, not a missing name', async () => {
  const { client } = gnsOnly({ offline: true })
  const names = createEthereumNames({ client })

  const result = await names.lookup('alice.gwei')
  assert.equal(result.status, 'error')
  assert.equal(result.address, null)
  assert.equal(result.matches[0]?.status, 'error')
  assert.ok(result.matches[0]?.error instanceof Error)
  // resolve() still answers null — but the caller can now find out why
  assert.equal(await names.resolve('alice.gwei'), null)
})

test('a reverse record is returned only once it forward-verifies', async () => {
  const { client } = gnsOnly({ reverse: { [ALICE]: 'alice.gwei' } })
  const names = createEthereumNames({ client, priority: ['gns'] })

  assert.equal(await names.reverse(ALICE), 'alice.gwei')
  const result = await names.lookup(ALICE)
  assert.deepEqual(result, {
    input: ALICE,
    name: 'alice.gwei',
    address: ALICE,
    system: 'gns',
    status: 'resolved',
    verified: true,
    ambiguous: false,
    matches: [
      { system: 'gns', name: 'alice.gwei', address: ALICE, status: 'resolved', verified: true },
    ],
  })
})

test('a reverse record that fails verification is reported, not silently dropped', async () => {
  // ALICE claims `bob.gwei`, but `bob.gwei` belongs to BOB.
  const { client } = fakeClient({
    [DEFAULT_GNS_CONTRACT]: {
      names: { 'bob.gwei': BOB },
      reverse: { [ALICE]: 'bob.gwei' },
      zeroForUnknown: true,
    },
  })
  const names = createEthereumNames({ client, priority: ['gns'] })

  assert.equal(await names.reverse(ALICE), null)
  assert.deepEqual(await names.reverseAll(ALICE), { ens: null, gns: null, wns: null })

  const result = await names.lookup(ALICE)
  assert.equal(result.status, 'unverified')
  assert.equal(result.name, null, 'an unverified name must not be presented as the answer')
  assert.equal(result.verified, false)
  assert.deepEqual(result.matches, [
    { system: 'gns', name: 'bob.gwei', address: ALICE, status: 'unverified', verified: false },
  ])
})

test('with verify disabled, results say plainly that nobody checked', async () => {
  const { client } = fakeClient({
    [DEFAULT_GNS_CONTRACT]: {
      names: { 'bob.gwei': BOB },
      reverse: { [ALICE]: 'bob.gwei' },
      zeroForUnknown: true,
    },
  })
  const names = createEthereumNames({ client, priority: ['gns'], verify: false })

  assert.equal(await names.reverse(ALICE), 'bob.gwei')
  const result = await names.lookup(ALICE)
  assert.equal(result.status, 'resolved')
  assert.equal(result.verified, false)
})

test('reverse falls through a failing system to the next one', async () => {
  const { client } = gnsOnly({ reverse: { [ALICE]: 'alice.gwei' } })
  // ENS is first in priority and unreachable here; GNS still answers
  const names = createEthereumNames({ client })
  assert.equal(await names.reverse(ALICE), 'alice.gwei')

  const result = await names.lookup(ALICE)
  assert.equal(result.system, 'gns')
  assert.deepEqual(
    result.matches.map((match) => [match.system, match.status]),
    [
      ['ens', 'error'],
      ['gns', 'resolved'],
    ],
  )
})

/** Two systems, one name, two different owners — the scenario from issue #5. */
function collision() {
  return fakeClient({
    [DEFAULT_GNS_CONTRACT]: { names: { 'bob.gwei': ALICE }, zeroForUnknown: true },
    [WILD_CONTRACT]: { names: { 'bob.gwei': BOB } },
  })
}

test('a colliding name refuses to resolve by default', async () => {
  const { client } = collision()
  const names = createEthereumNames({ client, registries: [...DEFAULT_REGISTRIES, WILD] })

  assert.equal(await names.resolve('bob.gwei'), null, 'must not silently pick a winner')

  const result = await names.lookup('bob.gwei')
  assert.equal(result.status, 'ambiguous')
  assert.equal(result.ambiguous, true)
  assert.equal(result.address, null)
  assert.deepEqual(
    result.matches.map((match) => [match.system, match.address]),
    [
      ['gns', ALICE],
      ['wild', BOB],
    ],
  )
})

test('systems that agree on an address are not a collision', async () => {
  const { client } = fakeClient({
    [DEFAULT_GNS_CONTRACT]: { names: { 'bob.gwei': ALICE }, zeroForUnknown: true },
    [WILD_CONTRACT]: { names: { 'bob.gwei': ALICE } },
  })
  const names = createEthereumNames({ client, registries: [...DEFAULT_REGISTRIES, WILD] })

  const result = await names.lookup('bob.gwei')
  assert.equal(result.status, 'resolved')
  assert.equal(result.ambiguous, false)
  assert.equal(result.address, ALICE)
})

test('collisions: "priority" picks a winner but still flags the ambiguity', async () => {
  const { client } = collision()
  const names = createEthereumNames({
    client,
    registries: [...DEFAULT_REGISTRIES, WILD],
    collisions: 'priority',
    priority: ['wild', 'ens', 'gns', 'wns'],
  })

  const result = await names.lookup('bob.gwei')
  assert.equal(result.address, BOB)
  assert.equal(result.system, 'wild')
  assert.equal(result.status, 'resolved')
  assert.equal(
    result.ambiguous,
    true,
    'a warned-about answer is still an answer worth warning about',
  )
})

test('collisions can be resolved by an app-supplied rule', async () => {
  const { client } = collision()
  const names = createEthereumNames({
    client,
    registries: [...DEFAULT_REGISTRIES, WILD],
    // jefag's suggestion on PR #4: deterministic and explainable to a user
    collisions: (candidates) => [...candidates].sort((a, b) => a.system.localeCompare(b.system))[0],
  })
  assert.equal(await names.resolve('bob.gwei'), ALICE)
})

test('resolveIn skips routing entirely, so a user can pick a side', async () => {
  const { client } = collision()
  const names = createEthereumNames({ client, registries: [...DEFAULT_REGISTRIES, WILD] })

  assert.equal(await names.resolveIn('gns', 'bob.gwei'), ALICE)
  assert.equal(await names.resolveIn('wild', 'bob.gwei'), BOB)
  // and it reaches systems that routing would never send this name to
  assert.equal(await names.resolveIn('wns', 'bob.gwei'), null)
  await assert.rejects(() => names.resolveIn('nope' as never, 'bob.gwei'), /unknown system "nope"/i)
})

test('reverseAll keys every configured system', async () => {
  const { client } = fakeClient({
    [DEFAULT_GNS_CONTRACT]: {
      names: { 'alice.gwei': ALICE },
      reverse: { [ALICE]: 'alice.gwei' },
      zeroForUnknown: true,
    },
    [WILD_CONTRACT]: { names: { 'alice.wild': ALICE }, reverse: { [ALICE]: 'alice.wild' } },
  })
  const names = createEthereumNames({ client, registries: [...DEFAULT_REGISTRIES, WILD] })

  assert.deepEqual(await names.reverseAll(ALICE), {
    ens: null,
    gns: 'alice.gwei',
    wns: null,
    wild: 'alice.wild',
  })
  // dropping a registry drops its key — no phantom nulls for systems nobody asked about
  const swapped = createEthereumNames({ client, registries: [WILD] })
  assert.deepEqual(await swapped.reverseAll(ALICE), { ens: null, wild: 'alice.wild' })
})

test('text records read from the configured contract, override included', async () => {
  const contract = '0x00000000000000000000000000000000000000C3'
  const { client, log } = fakeClient({
    [contract]: {
      names: { 'alice.gwei': ALICE },
      text: { 'alice.gwei': { url: 'https://alice.example', avatar: 'ipfs://alice' } },
      zeroForUnknown: true,
    },
  })
  const names = createEthereumNames({ client, gnsContract: contract })

  assert.equal(await names.resolve('alice.gwei'), ALICE)
  assert.equal(await names.getText('alice.gwei', 'url'), 'https://alice.example')
  assert.equal(await names.getAvatar('alice.gwei'), 'ipfs://alice')
  assert.equal(await names.getText('alice.gwei', 'missing'), null)
  assert.ok(
    log.calls.every((call) => call.to === contract.toLowerCase()),
    'the override must actually be the contract that gets read',
  )
})

test('a second claimant that has no such name does not disturb resolution', async () => {
  // The common case once a wildcard registry is configured: it claims the shape
  // but holds nothing, so there is nothing to be ambiguous about.
  const { client } = fakeClient({
    [DEFAULT_GNS_CONTRACT]: { names: { 'bob.gwei': ALICE }, zeroForUnknown: true },
    [WILD_CONTRACT]: { names: {} },
  })
  const names = createEthereumNames({ client, registries: [...DEFAULT_REGISTRIES, WILD] })

  const result = await names.lookup('bob.gwei')
  assert.equal(result.address, ALICE)
  assert.equal(result.system, 'gns')
  assert.equal(result.status, 'resolved')
  assert.equal(result.ambiguous, false)
  // both were asked, and the result says so
  assert.deepEqual(
    result.matches.map((match) => [match.system, match.status]),
    [
      ['gns', 'resolved'],
      ['wild', 'not-found'],
    ],
  )
})

test('two registries claiming one suffix collide at resolution too', async () => {
  const rival = {
    id: 'rival',
    suffixes: ['.gwei'],
    contract: WILD_CONTRACT,
    label: 'Rival Names',
  } as const satisfies NameRegistry
  const { client } = fakeClient({
    [DEFAULT_GNS_CONTRACT]: { names: { 'bob.gwei': ALICE }, zeroForUnknown: true },
    [WILD_CONTRACT]: { names: { 'bob.gwei': BOB } },
  })
  const names = createEthereumNames({ client, registries: [...DEFAULT_REGISTRIES, rival] })

  assert.equal(await names.resolve('bob.gwei'), null)
  const result = await names.lookup('bob.gwei')
  assert.equal(result.status, 'ambiguous')
  assert.deepEqual(
    result.matches.map((match) => [match.system, match.address]),
    [
      ['gns', ALICE],
      ['rival', BOB],
    ],
  )
})
