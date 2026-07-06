import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEthereumNames, detectSystem } from './index.js'

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

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
