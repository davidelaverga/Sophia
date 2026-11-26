import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { memberName, ownName, UNNAMED } from './person-name.ts'

describe('the signed-in person’s own name (one-truth.md)', () => {
  it('prefers the name they saved, then their provider’s, then a dev identity’s own', () => {
    assert.equal(ownName('Marta Ruiz', { name: 'Outsider' }), 'Marta Ruiz')
    assert.equal(ownName(null, { name: 'ana@x.com', displayName: 'Ana López' }), 'Ana López')
    assert.equal(ownName(undefined, { name: 'Outsider', displayName: null }), 'Outsider')
  })

  it('never names them by an address, and says none when there is none', () => {
    assert.equal(ownName(null, { name: 'ana@x.com' }), null)
    assert.equal(ownName('ana@x.com', { name: 'ana@x.com', displayName: 'ana@x.com' }), null)
  })

  it('skips a blank choice instead of naming them by it', () => {
    assert.equal(ownName('   ', { name: 'Luis' }), 'Luis')
    assert.equal(ownName('  Marta  ', { name: 'Luis' }), 'Marta')
  })
})

describe('a member as a list names them', () => {
  it('keeps the API’s name, and says one word for none', () => {
    assert.equal(memberName('Davide'), 'Davide')
    assert.equal(memberName(null), UNNAMED)
    assert.equal(memberName('  '), UNNAMED)
  })
})
