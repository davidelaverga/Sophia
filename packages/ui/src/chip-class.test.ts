import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHIP, chipClass, RADII } from './chip-class.ts'

describe('chipClass', () => {
  it('is `chip` with its kind (the state chip keeps its name, `tag`), its tone, then its own classes', () => {
    assert.equal(chipClass(), 'chip tag')
    assert.equal(chipClass('state', 'teal'), 'chip tag teal')
    assert.equal(chipClass('state', 'amber', ' task-chip '), 'chip tag amber task-chip')
    assert.equal(chipClass('data', undefined, 'model-chip'), 'chip chip-data model-chip')
  })

  it('a chip stands on the first radius and the app’s four radii are the only ones', () => {
    assert.deepEqual(RADII, [4, 6, 8, 12])
    assert.equal(CHIP.state.height, 20)
    assert.equal(CHIP.data.height, 18)
    assert.equal(CHIP.key.height, 18)
  })
})
