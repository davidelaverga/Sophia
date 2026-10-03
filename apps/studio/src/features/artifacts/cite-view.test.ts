import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bindCites, citeLabel, weaknessOf, type Piece } from './cite-view.ts'
import { parseMarkdown, type Inline } from './markdown.ts'

const A = 'a0000000-0000-4000-8000-000000000001'
const B = 'a0000000-0000-4000-8000-000000000002'
const C = 'a0000000-0000-4000-8000-000000000003'

/** The first paragraph's run of `markdown`, as MarkdownView gets it. */
function runOf(markdown: string): Inline[] {
  const block = parseMarkdown(markdown).blocks[0]
  if (block?.kind !== 'paragraph') throw new Error('not a paragraph')
  return block.children
}

/** A run as text, with each bound group as `{word|1,2}`, so a test reads as the line does. */
function shown(pieces: readonly Piece[]): string {
  return pieces.map(said).join('')
}

function said(p: Piece | Inline): string {
  if (p.kind === 'bound') return `{${p.word.map(said).join('')}|${p.cites.map((c) => String(c.n)).join(',')}}`
  if (p.kind === 'text' || p.kind === 'code') return p.text
  if (p.kind === 'strong') return `**${p.children.map(said).join('')}**`
  if (p.kind === 'em') return `*${p.children.map(said).join('')}*`
  if (p.kind === 'link') return `[${p.children.map(said).join('')}]`
  return p.kind === 'cite' ? `^${String(p.n)}` : '\n'
}

describe('a citation keeps to the word before it', () => {
  it('drops the space before it and takes the word with it', () => {
    assert.equal(
      shown(bindCites(runOf(`a quoted 310 USD for our footprint [${A}].`))),
      'a quoted 310 USD for our {footprint|1}.',
    )
  })

  it('groups citations with only spaces between them, however they were written', () => {
    assert.equal(shown(bindCites(runOf(`zone [${A}] [${B}].`))), '{zone|1,2}.')
    assert.equal(shown(bindCites(runOf(`zone (${A}; ${B}).`))), '{zone|1,2}.')
    assert.equal(shown(bindCites(runOf(`zone [${A}] [${B}] [${C}]`))), '{zone|1,2,3}')
  })

  it('starts a new group after anything but a space: each group takes what comes before it', () => {
    assert.equal(shown(bindCites(runOf(`one [${A}], two [${B}]`))), '{one|1}, {two|2}')
    assert.equal(shown(bindCites(runOf(`one [${A}],[${B}]`))), '{one|1}{,|2}')
  })

  it('binds a citation written as a link, as the pilot’s model wrote them', () => {
    assert.equal(shown(bindCites(runOf(`in writing [1](<${A}>).`))), 'in {writing|1}.')
  })

  it('keeps bold or emphasis on the word it takes, and the rest of it where it was', () => {
    assert.equal(shown(bindCites(runOf(`**Harbor Cloud** [${A}] wins`))), '**Harbor **{**Cloud**|1} wins')
    assert.equal(shown(bindCites(runOf(`*fast* [${A}]`))), '{*fast*|1}')
  })

  it('takes at most 24 characters of a long word, so an address before a citation still wraps', () => {
    const address = 'https://pricing.harbor.example/calculator?region=eu-central-1&currency=USD'
    const pieces = bindCites(runOf(`see ${address} [${A}]`))
    assert.equal(shown(pieces), `see ${address.slice(0, -24)}{${address.slice(-24)}|1}`)
  })

  it('binds nothing it would have to split: a link, code, or a run that starts with the citation', () => {
    assert.equal(shown(bindCites(runOf(`[the agreement](https://example.org/dpa) [${A}]`))), '[the agreement]{|1}')
    assert.equal(shown(bindCites(runOf(`run \`pgaudit\` [${A}]`))), 'run pgaudit{|1}')
    assert.equal(shown(bindCites(runOf(`[${A}] opens it`))), '{|1} opens it')
  })

  it('leaves a run without citations as it was', () => {
    const run = runOf('No citation here, **at all**.')
    assert.deepEqual(bindCites(run), run)
  })

  it('never changes the parsed run it was given', () => {
    const run = runOf(`**Harbor Cloud** [${A}] and zone [${B}]`)
    const before = structuredClone(run)
    bindCites(run)
    assert.deepEqual(run, before)
  })
})

describe('a citation of a source read only in part is marked and named so', () => {
  it('names the weakness from the source’s provenance, as the Sources tab says it', () => {
    assert.equal(weaknessOf({ kind: 'web_read', coverage: 'complete' }), null)
    assert.equal(weaknessOf({ kind: 'web_read', coverage: 'partial' }), 'part')
    assert.equal(weaknessOf({ kind: 'web_read', coverage: 'unsupported' }), 'unread')
    assert.equal(weaknessOf({ kind: 'web_read', coverage: null }), 'unread')
    assert.equal(weaknessOf({ kind: 'search_results', coverage: 'complete' }), 'snippet')
    assert.equal(weaknessOf({ kind: 'input', coverage: null }), null)
  })

  it('marks nothing while the version’s sources are not read yet', () => {
    assert.equal(weaknessOf(undefined), null)
  })

  it('names a citation in the report’s language, as its HTML page does, and in English otherwise', () => {
    assert.equal(citeLabel(1, null, 'en'), 'Source 1')
    assert.equal(citeLabel(3, 'part', 'en'), 'Source 3, read in part')
    assert.equal(citeLabel(4, 'snippet', 'und'), 'Source 4, snippet only')
    assert.equal(citeLabel(5, 'unread', 'fr'), 'Source 5, not read')
    assert.equal(citeLabel(3, 'part', 'it'), 'Fonte 3, letta in parte')
    assert.equal(citeLabel(4, 'snippet', 'it'), 'Fonte 4, solo anteprima')
    assert.equal(citeLabel(5, 'unread', 'it'), 'Fonte 5, non letta')
    assert.equal(citeLabel(2, null, 'es'), 'Fuente 2')
    assert.equal(citeLabel(3, 'part', 'es'), 'Fuente 3, leída en parte')
    assert.equal(citeLabel(4, 'snippet', 'es'), 'Fuente 4, solo fragmento')
    assert.equal(citeLabel(5, 'unread', 'es'), 'Fuente 5, no leída')
  })
})
