import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEthereumNames, detectSystem } from './index.js'

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

test('detectSystem routes names to the right system', () => {
  assert.equal(detectSystem('vitalik.eth'), 'ens')
  assert.equal(detectSystem('foo.box'), 'ens')
  assert.equal(detectSystem('alice.gwei'), 'gns')
  assert.equal(detectSystem('ALICE.GWEI'), 'gns')
  // bare labels are treated as .gwei
  assert.equal(detectSystem('alice'), 'gns')
  assert.equal(detectSystem(''), null)
  assert.equal(detectSystem('   '), null)
})

test('system() mirrors detectSystem without a network call', () => {
  const names = createEthereumNames()
  assert.equal(names.system('vitalik.eth'), 'ens')
  assert.equal(names.system('alice.gwei'), 'gns')
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
