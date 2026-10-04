import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reportLanguage } from '@sophia/report/language'
import { renderReportPage, type PageSource } from '@sophia/report/page'
import { bindCites, citeLabel, flushSides, lastGrapheme, weaknessOf, type Piece } from './cite-view.ts'
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

  it('joins a citation that ends bold or emphasis with the next one, as one group on the word', () => {
    assert.equal(
      shown(bindCites(runOf(`**Harbor is EU-only [${A}]** [${B}] and more.`))),
      '**Harbor is **{**EU-only**|1,2} and more.',
    )
    assert.equal(shown(bindCites(runOf(`*fast [${A}] [${B}]* [${C}]`))), '{*fast*|1,2,3}')
    assert.equal(shown(bindCites(runOf(`**[${A}]** [${B}]`))), '{|1,2}')
    // One with more of the mark after it stays inside, where it binds to its own word as the mark is set.
    assert.equal(shown(bindCites(runOf(`**one [${A}] two** [${B}]`))), '**one ^1 **{**two**|2}')
  })

  it('takes one letter of Chinese or Japanese, where a line may break between any two letters', () => {
    assert.equal(
      shown(bindCites(runOf(`也是合同问题。仅限欧盟境内处理[${A}]。`))),
      `也是合同问题。仅限欧盟境内处{理|1}。`,
    )
    assert.equal(shown(bindCites(runOf(`データはEU内（フランクフルト）[${A}]`))), `データはEU内（フランクフル{ト）|1}`)
    assert.equal(shown(bindCites(runOf(`Harbor云Cloud [${A}]`))), `Harbor{云Cloud|1}`)
  })

  it('takes at most 24 characters of a long word, so an address before a citation still wraps', () => {
    const address = 'https://pricing.harbor.example/calculator?region=eu-central-1&currency=USD'
    const pieces = bindCites(runOf(`see ${address} [${A}]`))
    assert.equal(shown(pieces), `see ${address.slice(0, -24)}{${address.slice(-24)}|1}`)
  })

  it('binds a link or code whole, never split, so the citation never starts a line after it (M75)', () => {
    assert.equal(shown(bindCites(runOf(`[the agreement](https://example.org/dpa) [${A}]`))), '{[the agreement]|1}')
    assert.equal(
      shown(bindCites(runOf(`its [pricing page](https://p.example/)[${A}] says`))),
      'its {[pricing page]|1} says',
    )
    assert.equal(shown(bindCites(runOf(`run \`pgaudit\` [${A}]`))), 'run {pgaudit|1}')
    assert.equal(shown(bindCites(runOf(`**[Harbor](https://h.example/)** [${A}] [${B}]`))), '{**[Harbor]**|1,2}')
    // However long, or in Chinese: the viewer wraps a bound word inside (cite-word), so width is not counted here.
    const long = 'WWWWWWWWWWW WWWWWWWWWWWW and more words past twenty-four'
    assert.equal(shown(bindCites(runOf(`[${long}](https://example.org/) [${A}]`))), `{[${long}]|1}`)
    assert.equal(shown(bindCites(runOf(`[数据驻留](https://example.org/) [${A}]`))), '{[数据驻留]|1}')
  })

  it('binds nothing before a citation that starts a run', () => {
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

describe('a group’s touch targets stop at their numerals only beside a link or no word (M75-RF-0001)', () => {
  /** Each group's flush sides, in order: "s" when its first target stops, "e" when its last does, "-" for neither. */
  const sides = (markdown: string) => {
    const pieces = bindCites(runOf(markdown))
    return pieces.flatMap((p, i) => {
      if (p.kind !== 'bound') return []
      const { start, end } = flushSides(pieces, i)
      return [`${start ? 's' : ''}${end ? 'e' : ''}` || '-']
    })
  }

  it('reaches into a word, plain or bold, on both sides', () => {
    assert.deepEqual(sides(`Harbor [${A}] and **Calder** [${B}] [${C}] too.`), ['-', '-'])
    assert.deepEqual(sides(`run \`pgaudit\` [${A}] now`), ['-'])
  })

  it('stops before its first number when its word is a link, or when no word is bound', () => {
    assert.deepEqual(sides(`its [pricing page](https://p.example/) [${A}] says`), ['s'])
    assert.deepEqual(sides(`**[Harbor](https://h.example/)** [${A}]`), ['s'])
    assert.deepEqual(sides(`[${'x'.repeat(25)}](https://example.org/) [${A}]`), ['s'])
    assert.deepEqual(sides(`[${A}] opens it`), ['s'])
  })

  it('stops the sides of two groups that face each other across fewer than three characters (M75-RF-0004)', () => {
    assert.deepEqual(sides(`Pair i[${A}]i[${B}].`), ['e', 's'])
    assert.deepEqual(sides(`x[${A}] y[${B}].`), ['e', 's'])
    assert.deepEqual(sides(`**a**[${A}]**b**[${B}]`), ['e', 's'])
    // Three characters are room enough at the narrowest glyph; a combining mark is no room at all.
    assert.deepEqual(sides(`x[${A}] iii[${B}].`), ['-', '-'])
    assert.deepEqual(sides(`x[${A}]e\u0301[${B}].`), ['e', 's'])
    assert.deepEqual(sides(`claim[${A}], other[${B}].`), ['-', '-'])
    // A line break between them leaves them on different lines.
    assert.deepEqual(sides(`x[${A}]  \ni[${B}]`), ['-', '-'])
  })

  it('stops after its last number when a link follows with at most a space between, and not past words', () => {
    assert.deepEqual(sides(`claim [${A}] [has a link](https://example.org/b) after`), ['e'])
    assert.deepEqual(sides(`claim [${A}][a link](https://example.org/b)`), ['e'])
    assert.deepEqual(sides(`Calder [${A}] [its notes](https://c.example/) [${B}]`), ['e', 's'])
    assert.deepEqual(sides(`claim [${A}] **[bold link](https://example.org/b)** after`), ['e'])
    assert.deepEqual(sides(`claim [${A}] and the [docs](https://example.org/d)`), ['-'])
  })
})

describe('a bound word keeps only its last character with the citation; the rest may wrap (M75-RF-0005)', () => {
  it('cuts before the last character a reader sees, whole', () => {
    assert.deepEqual(lastGrapheme('WWWWWWWWWWW WWWWWWWWWWWW'), ['WWWWWWWWWWW WWWWWWWWWWW', 'W'])
    assert.deepEqual(lastGrapheme('境内处理'), ['境内处', '理'])
    assert.deepEqual(lastGrapheme('🙂🙂👩‍💻'), ['🙂🙂', '👩‍💻'], 'an emoji with its joiners')
    assert.deepEqual(lastGrapheme('cafe\u0301'), ['caf', 'e\u0301'], 'a letter with its mark')
    assert.deepEqual(lastGrapheme('i'), ['', 'i'])
    assert.deepEqual(lastGrapheme(''), ['', ''])
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

/** A source whose standing is known (its kind and coverage), as both the page and the viewer read one. */
type Standing = PageSource & Required<Pick<PageSource, 'kind' | 'coverage'>>

/** One source of each standing: read in full, in part, a search listing, a file not read, the project's own. */
const STANDINGS: Standing[] = [
  { id: 'a0000000-0000-4000-8000-0000000000f1', title: 'Full', url: null, kind: 'web_read', coverage: 'complete' },
  { id: 'a0000000-0000-4000-8000-0000000000f2', title: 'Part', url: null, kind: 'web_read', coverage: 'partial' },
  {
    id: 'a0000000-0000-4000-8000-0000000000f3',
    title: 'Listing',
    url: null,
    kind: 'search_results',
    coverage: 'complete',
  },
  { id: 'a0000000-0000-4000-8000-0000000000f4', title: 'File', url: null, kind: 'web_read', coverage: 'unsupported' },
  { id: 'a0000000-0000-4000-8000-0000000000f5', title: 'Ours', url: null, kind: 'input', coverage: null },
]

/** A report in each language the page speaks, long enough for reportLanguage to tell. */
const SAID = {
  en:
    'The service is the one that renders, and this is from the team with the hosts, which are for the project of ' +
    'the year.',
  it:
    'Il servizio della rete che offre anche il rendering, per questo sono gli strumenti delle opzioni nel progetto, ' +
    'alla fine degli studi.',
  es:
    'El servicio que ofrece los informes para las empresas, como este proyecto, también está por encima de las ' +
    'opciones que son más caras.',
} as const

describe('the viewer names each citation as the HTML page does (M75: the reader and the page cannot drift apart)', () => {
  for (const [language, words] of Object.entries(SAID)) {
    it(`in ${language}, for a source of every standing`, () => {
      const markdown = `# R\n\n## S\n\n${words} ${STANDINGS.map((s) => `x [${s.id}]`).join(' ')}\n`
      assert.equal(reportLanguage(markdown), language)
      const html = renderReportPage({
        markdown,
        title: 'R',
        sources: STANDINGS,
        citable: STANDINGS.map((s) => s.id),
        sha256: '0'.repeat(64),
        versionNumber: 1,
      })
      const page = [...html.matchAll(/<a href="#cite-(\d+)"[^>]* aria-label="([^"]+)">/g)].map((m) => m[2])
      const viewer = STANDINGS.map((s, i) => citeLabel(i + 1, weaknessOf(s), language))
      assert.deepEqual(page, viewer)
    })
  }
})
