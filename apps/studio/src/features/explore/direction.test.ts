import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { choice, nextTile, provenance, stateLine, type Candidate, type Direction } from './direction.ts'

const asset = { id: 'asset-b', sha256: 'ab'.repeat(32), mime: 'image/png' as const, width: 256, height: 256 }
const ready: Candidate = {
  id: 'b',
  jobId: 'job-2',
  route: 'image-openai',
  model: null,
  state: 'ready',
  reason: null,
  asset,
}
const refused: Candidate = { ...ready, id: 'a', route: 'image-google', state: 'refused', asset: null }
const direction: Direction = {
  id: 'd',
  title: 'Hero',
  brief: { sourceId: 's', revision: 3 },
  references: [{ assetId: 'r', label: 'Grid', sha256: 'cd'.repeat(32) }],
  candidates: [refused, ready],
  chosenId: null,
  revision: 1,
}

describe('an image direction', () => {
  it('lets an editor or admin choose a ready, verified image, and says why not otherwise', () => {
    assert.deepEqual(choice('editor', ready, direction, true), { can: true })
    assert.deepEqual(choice('admin', ready, direction, true), { can: true })
    assert.deepEqual(choice('viewer', ready, direction, true), { can: false, why: 'Editors and admins choose.' })
    assert.deepEqual(choice(undefined, ready, direction, true), { can: false, why: 'Editors and admins choose.' })
    assert.deepEqual(choice('admin', refused, direction, true), {
      can: false,
      why: 'Only a ready image can be chosen.',
    })
    const chosen = { ...direction, chosenId: 'b' }
    assert.deepEqual(choice('admin', ready, chosen, true), { can: false, why: 'This is the chosen one.' })
    assert.deepEqual(choice('admin', ready, direction, false), {
      can: false,
      why: 'Only an image that matches its record can be chosen.',
    })
  })

  it('says what a candidate without a picture is, in words, and the provider’s own words first', () => {
    assert.equal(stateLine(ready), '')
    assert.equal(stateLine(refused), 'The provider refused this request.')
    assert.equal(stateLine({ ...refused, reason: 'Blocked by the safety policy.' }), 'Blocked by the safety policy.')
    assert.match(stateLine({ ...refused, state: 'unknown' }), /checked before anything is sent again/)
  })

  it('names what answered only when the provider said so, and the asset only when there are bytes', () => {
    assert.deepEqual(provenance(refused, direction), [
      ['Route', 'Google'],
      ['Model', 'Not reported'],
      ['Brief', 'revision 3'],
      ['References', 'Grid'],
    ])
    const rows = new Map(provenance({ ...ready, model: 'gpt-image-2.5-sunburst-2026-09-08' }, direction))
    assert.equal(rows.get('Model'), 'gpt-image-2.5-sunburst-2026-09-08')
    assert.equal(rows.get('Asset'), 'asset-b')
    assert.equal(rows.get('SHA-256'), 'ab'.repeat(32), 'the whole digest, to compare with a file’s')
  })

  it('moves the focus over the tiles with arrows, Home and End, and stays inside', () => {
    assert.equal(nextTile('ArrowRight', 0, 3), 1)
    assert.equal(nextTile('ArrowRight', 2, 3), 2)
    assert.equal(nextTile('ArrowUp', 0, 3), 0)
    assert.equal(nextTile('End', 0, 3), 2)
    assert.equal(nextTile('Home', 2, 3), 0)
    assert.equal(nextTile('a', 1, 3), null)
    assert.equal(nextTile('ArrowRight', 0, 0), null)
  })
})
