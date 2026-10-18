import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { foldCharacter, foldForSearch } from './search-fold.ts'

// How a search compares words (find-accents.md, Codex P2s on #406): whatever their case or accents, as Unicode folds
// them, and a standalone mark as written.
describe('a search’s folding', () => {
  it('drops an accent on its letter, and keeps a mark that stands alone', () => {
    assert.equal(foldForSearch('Café Mérida'), 'cafe merida')
    assert.equal(foldForSearch('2^8 `x`'), '2^8 `x`')
  })

  it('folds case as Unicode does, wherever a letter stands', () => {
    assert.equal(foldForSearch('ΟΣ'), foldForSearch('οσ'))
    assert.equal(foldForSearch('ς'), 'σ')
    assert.equal(foldForSearch('ſtraße'), 'strasse')
    assert.equal(foldForSearch('İstanbul'), 'istanbul')
  })

  it('folds one character to more than one, or to none for a mark on its own', () => {
    assert.equal(foldCharacter('ß'), 'ss')
    assert.equal(foldCharacter('\u0301'), '')
  })
})
