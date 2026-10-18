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

  it('folds capital sharp S to ss, as small sharp s folds (Codex P2 on #433)', () => {
    assert.equal(foldCharacter('\u1e9e'), 'ss')
    assert.equal(foldForSearch('STRA\u1e9eE'), foldForSearch('stra\u00dfe'))
  })

  it('leaves nothing to fold in what it folded, for every code point', () => {
    const unsettled: string[] = []
    for (let point = 0; point <= 0x10ffff; point += 1) {
      if (point >= 0xd800 && point <= 0xdfff) continue
      const folded = foldCharacter(String.fromCodePoint(point))
      if (foldForSearch(folded) !== folded) unsettled.push(`U+${point.toString(16).toUpperCase()}`)
    }
    assert.deepEqual(unsettled, [])
  })
})
