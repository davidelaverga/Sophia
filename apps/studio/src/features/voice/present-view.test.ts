import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArtifactVersion } from '@sophia/contracts'
import { follows, presenting, showingWords, shownOf, showOffered } from './present-view.ts'

const version = (id: string, over: Partial<ArtifactVersion> = {}) =>
  ({ id, artifactId: 'report', title: 'Fixture report', versionNumber: 2, ...over }) as ArtifactVersion

const focus = (artifactVersionId: string, guideId = 'marco') => ({ artifactVersionId, guideId, revision: 1 })

describe('what is shown', () => {
  it('is the version the focus names, found among the snapshot’s current versions', () => {
    const shown = shownOf(focus('v2'), [version('v1'), version('v2')], 'me')
    assert.equal(shown?.version?.id, 'v2')
    assert.equal(shown?.guideId, 'marco')
    assert.equal(shown?.mine, false)
  })

  it('names a version it can’t find, which can’t be followed; nothing when no focus', () => {
    const shown = shownOf(focus('old'), [version('v2')], 'me')
    assert.equal(shown?.version, null)
    assert.equal(shownOf(null, [version('v2')], 'me'), null)
  })

  it('is mine when I guide it', () => {
    assert.equal(shownOf(focus('v2', 'me'), [version('v2')], 'me')?.mine, true)
  })
})

describe('what the card says', () => {
  it('names who shows what, and which version', () => {
    assert.equal(showingWords('Marco', version('v2')), 'Marco is showing Fixture report · v2')
    assert.equal(showingWords('Marco', null), 'Marco is showing an earlier version of a report')
    assert.equal(showingWords('you', version('v2'), true), 'You are showing Fixture report · v2')
  })
})

describe('what I follow', () => {
  const shown = { version: version('v2'), guideId: 'marco', revision: 3, mine: false }

  it('is what I chose: the focus at that revision; any change of it asks again', () => {
    assert.equal(follows({ revision: 3, versionId: 'v2' }, shown), true)
    assert.equal(follows({ revision: 3, versionId: 'v2' }, { ...shown, revision: 4 }), false)
    assert.equal(follows({ revision: 3, versionId: 'v2' }, { ...shown, version: null }), false)
    assert.equal(follows(null, shown), false)
    assert.equal(follows({ revision: 3, versionId: 'v2' }, null), false)
  })
})

describe('when the stage presents it', () => {
  const shown = { version: version('v2'), guideId: 'marco', revision: 1, mine: false }

  it('when followed, or shown by me; never while a screen is shared, nor for a version it can’t find', () => {
    assert.equal(presenting(shown, { following: true, screen: false }), true)
    assert.equal(presenting(shown, { following: false, screen: false }), false)
    assert.equal(presenting({ ...shown, mine: true }, { following: false, screen: false }), true)
    assert.equal(presenting(shown, { following: true, screen: true }), false)
    assert.equal(presenting({ ...shown, version: null }, { following: true, screen: false }), false)
    assert.equal(presenting(null, { following: true, screen: false }), false)
  })
})

describe('whether Show everyone is offered', () => {
  it('only under the vision flag, to a member in the call', () => {
    assert.equal(showOffered({ vision: true, inCall: true, guest: false }), true)
    assert.equal(showOffered({ vision: false, inCall: true, guest: false }), false)
    assert.equal(showOffered({ vision: true, inCall: false, guest: false }), false)
    assert.equal(showOffered({ vision: true, inCall: true, guest: true }), false)
  })
})
