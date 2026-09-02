import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_REGISTRIES, createEthereumNames, detectSystems, profileUrl } from './index.js'
import type { NameRegistry } from './index.js'

const CONTRACT = '0x00000000000000000000000000000000000000F0'

const FOO = { id: 'foo', suffixes: ['.foo'], contract: CONTRACT } as const satisfies NameRegistry
const NESTED = {
  id: 'nested',
  suffixes: ['.bar.foo'],
  contract: '0x00000000000000000000000000000000000000BA',
} as const satisfies NameRegistry

/** A registry with permissionless namespaces, in the shape XNS describes in issue #5. */
const WILD = {
  id: 'wild',
  contract: '0x00000000000000000000000000000000000000A1',
  wildcard: true,
  excludeSuffixes: ['.eth'],
  bareLabels: true,
  label: 'Wildcard Names',
} as const satisfies NameRegistry

test('a suffix claim routes to its registry, and takes the suffix from ENS', () => {
  assert.deepEqual(detectSystems('alice.gwei'), ['gns'])
  assert.deepEqual(detectSystems('alice.wei'), ['wns'])
  assert.deepEqual(detectSystems('alice.foo', [FOO]), ['foo'])
})

test('unclaimed dotted names fall back to ENS', () => {
  assert.deepEqual(detectSystems('vitalik.eth'), ['ens'])
  assert.deepEqual(detectSystems('foo.box'), ['ens'])
  assert.deepEqual(detectSystems('a.b.c.box', [FOO]), ['ens'])
})

test('the longest matching suffix wins', () => {
  assert.deepEqual(detectSystems('alice.bar.foo', [FOO, NESTED]), ['nested'])
  assert.deepEqual(detectSystems('alice.bar.foo', [NESTED, FOO]), ['nested'])
  assert.deepEqual(detectSystems('alice.foo', [FOO, NESTED]), ['foo'])
})

test('bare labels are claimed by every registry that accepts them', () => {
  assert.deepEqual(detectSystems('alice'), ['gns', 'wns'])
  assert.deepEqual(detectSystems('alice', [FOO]), [])
  assert.deepEqual(detectSystems('alice', [...DEFAULT_REGISTRIES, WILD]), ['gns', 'wns', 'wild'])
})

test('empty input claims nothing', () => {
  assert.deepEqual(detectSystems(''), [])
  assert.deepEqual(detectSystems('   '), [])
  // a suffix with no label in front of it is not a name
  assert.deepEqual(detectSystems('.gwei'), ['ens'])
})

test('two registries claiming one suffix is a collision, not a race', () => {
  const rival = { id: 'rival', suffixes: ['.gwei'], contract: CONTRACT } as const
  assert.deepEqual(detectSystems('bob.gwei', [...DEFAULT_REGISTRIES, rival]), ['gns', 'rival'])
  assert.deepEqual(detectSystems('bob.gwei', [rival, ...DEFAULT_REGISTRIES]), ['rival', 'gns'])
})

test('a wildcard registry stacks on top of suffix claims and the ENS fallback', () => {
  const registries = [...DEFAULT_REGISTRIES, WILD]
  // exactly the scenario from issue #5: the same name exists in two systems
  assert.deepEqual(detectSystems('bob.gwei', registries), ['gns', 'wild'])
  // no registry claims .box by suffix, so ENS stays in the running
  assert.deepEqual(detectSystems('bob.box', registries), ['ens', 'wild'])
  // …and an excluded suffix leaves the wildcard out entirely
  assert.deepEqual(detectSystems('bob.eth', registries), ['ens'])
})

test('system() reports one winner, systemsFor() reports the collision', () => {
  const names = createEthereumNames({ registries: [...DEFAULT_REGISTRIES, WILD] })
  assert.deepEqual(names.systemsFor('bob.gwei'), ['gns', 'wild'])
  // the convenience view cannot express two, so priority order decides
  assert.equal(names.system('bob.gwei'), 'gns')
  assert.equal(createEthereumNames({ registries: [WILD] }).system('bob.gwei'), 'ens')
})

test('bare labels resolve only against bareLabel, however many systems claim them', () => {
  const names = createEthereumNames()
  // both registries claim `alice`…
  assert.deepEqual(names.systemsFor('alice'), ['gns', 'wns'])
  // …but resolution follows the configured bareLabel, which defaults to ENS
  assert.equal(names.system('alice'), 'ens')
  assert.equal(createEthereumNames({ bareLabel: 'wns' }).system('alice'), 'wns')
})

test('registries replace the defaults rather than extending them', () => {
  const names = createEthereumNames({ registries: [FOO] })
  assert.deepEqual(names.systemsFor('alice.foo'), ['foo'])
  // without GNS configured, `.gwei` is just another dotted name → ENS
  assert.deepEqual(names.systemsFor('alice.gwei'), ['ens'])
})

test('invalid registries are rejected at construction', () => {
  const cases: [Partial<NameRegistry>, RegExp][] = [
    [{ id: 'ens' }, /reserved for ENS/i],
    [{ id: '' }, /empty or contains whitespace/i],
    [{ id: 'a b' }, /empty or contains whitespace/i],
    [{ contract: 'not-an-address' as never }, /not a valid address/i],
    [{ suffixes: ['foo'] }, /must start with a dot/i],
    [{ suffixes: ['.eth'] }, /reserved for ENS/i],
    [{ suffixes: [] }, /claims no names/i],
    [{ excludeSuffixes: ['.eth'] }, /not a wildcard/i],
  ]
  for (const [patch, expected] of cases) {
    assert.throws(
      () => createEthereumNames({ registries: [{ ...FOO, ...patch }] }),
      expected,
      `expected ${JSON.stringify(patch)} to be rejected`,
    )
  }

  assert.throws(
    () => createEthereumNames({ registries: [FOO, { ...FOO, suffixes: ['.bar'] }] }),
    /duplicate registry id/i,
  )
  assert.throws(
    () => createEthereumNames({ bareLabel: 'nope' as never }),
    /unknown system "nope" for bareLabel/i,
  )
  assert.throws(
    () => createEthereumNames({ priority: ['ens', 'nope' as never] }),
    /unknown system "nope" in priority/i,
  )
  assert.throws(
    () => createEthereumNames({ collisions: 'whatever' as never }),
    /unknown collision strategy/i,
  )
})

test('.eth cannot be claimed by a registry', () => {
  // The hijack this prevents: every ENS name silently rerouted to a contract
  // of the app author's choosing.
  assert.throws(
    () =>
      createEthereumNames({ registries: [{ id: 'evil', suffixes: ['.eth'], contract: CONTRACT }] }),
    /reserved for ENS/i,
  )
})

test('descriptors expose what each system claims', () => {
  const names = createEthereumNames({ registries: [...DEFAULT_REGISTRIES, WILD] })
  assert.deepEqual(names.describe('gns'), {
    id: 'gns',
    kind: 'registry',
    label: 'Gwei Name Service',
    url: 'https://gwei.domains',
    profileUrl: 'https://gwei.domains/#{label}',
    suffixes: ['.gwei'],
    bareLabels: true,
    wildcard: false,
    excludeSuffixes: [],
    contract: '0x9D51D507BC7264d4fE8Ad1cf7Fe191933A0a81d6',
  })
  assert.equal(names.describe('ens')?.kind, 'ens')
  assert.equal(names.describe('wild')?.label, 'Wildcard Names')
  assert.equal(names.describe('nope'), undefined)
  // an id with no label falls back to the id itself rather than inventing one
  assert.equal(createEthereumNames({ registries: [FOO] }).describe('foo')?.label, 'FOO')
})

test("profileUrl builds each system's profile page from the name alone", () => {
  assert.equal(profileUrl('vitalik.eth'), 'https://app.ens.domains/vitalik.eth')
  assert.equal(profileUrl('alice.gwei'), 'https://gwei.domains/#alice')
  assert.equal(profileUrl('alice.wei'), 'https://wei.domains/#alice')
  // unclaimed dotted names fall back to ENS, like resolution does
  assert.equal(profileUrl('foo.box'), 'https://app.ens.domains/foo.box')
  // bare labels follow bareLabel routing — ENS by default, a registry on opt-in
  assert.equal(profileUrl('alice'), 'https://app.ens.domains/alice')
  assert.equal(profileUrl('alice', 'gns'), 'https://gwei.domains/#alice')
  assert.equal(profileUrl(''), null)
  // an invalid ENS name has no profile page
  assert.equal(profileUrl('in..valid.eth'), null)
})

test('profileUrl templates substitute {name} and {label}, URL-encoded', () => {
  const byName = { ...FOO, profileUrl: 'https://foo.example/name/{name}' } as const
  assert.equal(profileUrl('alice.foo', 'ens', [byName]), 'https://foo.example/name/alice.foo')

  // {label} strips the longest matching claimed suffix
  const nested = { ...NESTED, profileUrl: 'https://nested.example/#{label}' } as const
  assert.equal(profileUrl('alice.bar.foo', 'ens', [nested]), 'https://nested.example/#alice')

  // registry names are not ENSIP-normalized, so encoding has to carry the load
  assert.equal(
    profileUrl('a b.foo', 'ens', [{ ...FOO, profileUrl: 'https://foo.example/#{label}' }]),
    'https://foo.example/#a%20b',
  )

  // a function receives the canonical name and its answer is used verbatim
  const fn = {
    ...FOO,
    profileUrl: (name: string) => `https://foo.example/profiles?q=${name}`,
  } as const
  assert.equal(profileUrl('ALICE.FOO', 'ens', [fn]), 'https://foo.example/profiles?q=alice.foo')

  // no profileUrl, no link
  assert.equal(profileUrl('alice.foo', 'ens', [FOO]), null)
})

test('client profileUrl routes like resolution, or targets one system explicitly', () => {
  const names = createEthereumNames()
  assert.equal(names.profileUrl('alice.gwei'), 'https://gwei.domains/#alice')
  assert.equal(names.profileUrl('alice'), 'https://app.ens.domains/alice')
  assert.equal(
    createEthereumNames({ bareLabel: 'wns' }).profileUrl('alice'),
    'https://wei.domains/#alice',
  )
  // the explicit system skips routing — canonicalization is that system's,
  // so a bare label picks up the registry's primary suffix first
  assert.equal(names.profileUrl('alice', 'wns'), 'https://wei.domains/#alice')
  assert.equal(names.profileUrl('alice.gwei', 'ens'), 'https://app.ens.domains/alice.gwei')
  assert.throws(() => names.profileUrl('alice', 'nope' as never), /unknown system "nope"/i)
})

test('a profileUrl template without a placeholder is rejected at construction', () => {
  assert.throws(
    () => createEthereumNames({ registries: [{ ...FOO, profileUrl: 'https://foo.example' }] }),
    /needs a \{name\} or \{label\} placeholder/i,
  )
})

test('gnsContract and wnsContract still override the default addresses', () => {
  const gnsContract = '0x00000000000000000000000000000000000000C3'
  const wnsContract = '0x00000000000000000000000000000000000000D4'
  const names = createEthereumNames({ gnsContract, wnsContract })
  assert.equal(names.describe('gns')?.contract, gnsContract)
  assert.equal(names.describe('wns')?.contract, wnsContract)
})
