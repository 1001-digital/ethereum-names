import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_REGISTRIES, createEthereumNames, detectSystem } from './index.js'
import type { NameRegistry } from './index.js'

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

/** A stand-in registry with the GNS/WNS read interface. Never called over the network here. */
const FOO: NameRegistry = {
  id: 'foo',
  suffix: '.foo',
  contract: '0x00000000000000000000000000000000000000F0',
}

test('detectSystem routes names to the right system', () => {
  assert.equal(detectSystem('vitalik.eth'), 'ens')
  assert.equal(detectSystem('foo.box'), 'ens')
  assert.equal(detectSystem('alice.gwei'), 'gns')
  assert.equal(detectSystem('ALICE.GWEI'), 'gns')
  assert.equal(detectSystem('alice.wei'), 'wns')
  assert.equal(detectSystem('ALICE.WEI'), 'wns')
  // .gwei must not be mistaken for .wei
  assert.equal(detectSystem('gm.gwei'), 'gns')
  // bare labels default to ENS, and route to the configured system otherwise
  assert.equal(detectSystem('alice'), 'ens')
  assert.equal(detectSystem('alice', 'gns'), 'gns')
  assert.equal(detectSystem('alice', 'wns'), 'wns')
  // suffixed names ignore the bareLabel override
  assert.equal(detectSystem('alice.wei', 'gns'), 'wns')
  assert.equal(detectSystem(''), null)
  assert.equal(detectSystem('   '), null)
})

test('system() mirrors detectSystem, honoring bareLabel config', () => {
  const names = createEthereumNames()
  assert.equal(names.system('vitalik.eth'), 'ens')
  assert.equal(names.system('alice.gwei'), 'gns')
  assert.equal(names.system('alice.wei'), 'wns')
  // bare label defaults to ENS
  assert.equal(names.system('alice'), 'ens')
  // …and follows the bareLabel option
  assert.equal(createEthereumNames({ bareLabel: 'gns' }).system('alice'), 'gns')
  assert.equal(createEthereumNames({ bareLabel: 'wns' }).system('alice'), 'wns')
})

test('resolve passes addresses through, checksummed', async () => {
  const names = createEthereumNames()
  assert.equal(await names.resolve(VITALIK.toLowerCase()), VITALIK)
  assert.equal(await names.resolve(''), null)
})

test('reverse rejects non-addresses', async () => {
  const names = createEthereumNames()
  assert.equal(await names.reverse('not-an-address'), null)
})

test('reverseAll rejects non-addresses with an empty result', async () => {
  const names = createEthereumNames()
  assert.deepEqual(await names.reverseAll('not-an-address'), {
    ens: null,
    gns: null,
    wns: null,
  })
})

test('lookup of an address echoes the checksummed address', async () => {
  // reversePriority [] skips any network lookups, isolating the address handling
  const names = createEthereumNames({ reversePriority: [] })
  const result = await names.lookup(VITALIK.toLowerCase())
  assert.deepEqual(result, {
    input: VITALIK.toLowerCase(),
    name: null,
    address: VITALIK,
    system: null,
  })
})

test('lookup of an unknown shape returns an empty result', async () => {
  const names = createEthereumNames()
  const result = await names.lookup('')
  assert.deepEqual(result, { input: '', name: null, address: null, system: null })
})

test('detectSystem routes custom registry suffixes', () => {
  const registries = [...DEFAULT_REGISTRIES, FOO]
  assert.equal(detectSystem('alice.foo', 'ens', registries), 'foo')
  assert.equal(detectSystem('ALICE.FOO', 'ens', registries), 'foo')
  // built-ins still route, and unknown TLDs still fall through to ENS
  assert.equal(detectSystem('alice.gwei', 'ens', registries), 'gns')
  assert.equal(detectSystem('alice.box', 'ens', registries), 'ens')
  // bare labels can route to a custom registry
  assert.equal(detectSystem('alice', 'foo', registries), 'foo')
})

test('detectSystem matches the longest suffix, whatever the registry order', () => {
  // `.wei` first would shadow `.gwei` on a naive first-match
  const registries = [
    { id: 'wns', suffix: '.wei', contract: FOO.contract },
    { id: 'gns', suffix: '.gwei', contract: FOO.contract },
  ]
  assert.equal(detectSystem('alice.gwei', 'ens', registries), 'gns')
  assert.equal(detectSystem('alice.wei', 'ens', registries), 'wns')
})

test('registries config adds a TLD to the resolving path', () => {
  const names = createEthereumNames({ registries: [...DEFAULT_REGISTRIES, FOO] })
  assert.equal(names.system('alice.foo'), 'foo')
  assert.equal(names.system('alice.gwei'), 'gns')
  assert.equal(names.system('alice.wei'), 'wns')
  assert.equal(names.system('vitalik.eth'), 'ens')
})

test('registries config replaces the defaults rather than extending them', () => {
  const names = createEthereumNames({ registries: [FOO] })
  assert.equal(names.system('alice.foo'), 'foo')
  // without GNS configured, `.gwei` is just another dotted name → ENS
  assert.equal(names.system('alice.gwei'), 'ens')
})

test('reverseAll keys every configured system, keeping ens/gns/wns present', async () => {
  const names = createEthereumNames({ registries: [...DEFAULT_REGISTRIES, FOO] })
  assert.deepEqual(await names.reverseAll('not-an-address'), {
    ens: null,
    gns: null,
    wns: null,
    foo: null,
  })

  // even when a registry is dropped, ens/gns/wns stay on the result type
  const swapped = createEthereumNames({ registries: [FOO] })
  assert.deepEqual(await swapped.reverseAll('not-an-address'), {
    ens: null,
    gns: null,
    wns: null,
    foo: null,
  })
})

test('bareLabel can point at a custom registry', () => {
  const names = createEthereumNames({
    registries: [...DEFAULT_REGISTRIES, FOO],
    bareLabel: 'foo',
  })
  assert.equal(names.system('alice'), 'foo')
  // a suffixed name still ignores the bareLabel override
  assert.equal(names.system('alice.wei'), 'wns')
})

test('gnsContract/wnsContract still override the default registry addresses', () => {
  const gnsContract = '0x00000000000000000000000000000000000000A1' as const
  // No network call to assert against, so assert the wiring does not throw and
  // detection is unchanged — the address override is applied by id.
  const names = createEthereumNames({ gnsContract })
  assert.equal(names.system('alice.gwei'), 'gns')
})

test('invalid registries are rejected at construction', () => {
  assert.throws(
    () => createEthereumNames({ registries: [{ ...FOO, id: 'ens' }] }),
    /reserved/i,
    'the id "ens" is reserved',
  )
  assert.throws(
    () => createEthereumNames({ registries: [FOO, { ...FOO, suffix: '.bar' }] }),
    /duplicate/i,
    'ids must be unique',
  )
  assert.throws(
    () => createEthereumNames({ registries: [{ ...FOO, suffix: 'foo' }] }),
    /dot/i,
    'suffixes must start with a dot',
  )
})
