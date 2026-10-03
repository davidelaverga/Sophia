import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anchorOf,
  compareSections,
  parseMarkdown,
  safeHref,
  sectionsOf,
  wordCount,
  type Block,
  type Inline,
} from './markdown.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

/** The plain text of inline content, citations as [n]. */
function plain(inline: readonly Inline[]): string {
  return inline
    .map((i) => {
      if (i.kind === 'text' || i.kind === 'code') return i.text
      if (i.kind === 'cite') return `[${i.n}]`
      if (i.kind === 'break') return '\n'
      return plain(i.children)
    })
    .join('')
}

const only = (md: string): Block => {
  const { blocks } = parseMarkdown(md)
  assert.equal(blocks.length, 1, JSON.stringify(blocks))
  const [b] = blocks
  assert.ok(b)
  return b
}

describe('the report Markdown parser', () => {
  it('reads headings, paragraphs, lists, quotes, rules, code and tables, in order', () => {
    const { blocks } = parseMarkdown(
      [
        '# Sandboxed hosts',
        'Two hosts render PDFs.',
        '',
        '- one',
        '1. first',
        '',
        '> quoted **bold**',
        '',
        '---',
        '```sh',
        '# not a heading',
        '```',
        '| Host | Sandbox |',
        '| :--- | ---: |',
        '| A | `microVM` |',
      ].join('\n'),
    )
    assert.deepEqual(
      blocks.map((b) => b.kind),
      ['heading', 'paragraph', 'list', 'list', 'quote', 'rule', 'code', 'table'],
    )
  })

  it('reads a heading with its level and anchor, and a paragraph across lines', () => {
    assert.deepEqual(only('## Sandboxed hosts!'), {
      kind: 'heading',
      level: 2,
      anchor: 'sandboxed-hosts',
      children: [{ kind: 'text', text: 'Sandboxed hosts!' }],
    })
    const p = only('Two hosts render PDFs.\nLine two of the same paragraph.')
    assert.equal(p.kind === 'paragraph' && plain(p.children), 'Two hosts render PDFs. Line two of the same paragraph.')
  })

  it('reads list items with their nesting and continuation lines; a number after bullets starts a new list', () => {
    const ul = only('- one\n  continued\n  - nested')
    assert.ok(ul.kind === 'list')
    assert.deepEqual(
      ul.items.map((i) => [i.depth, plain(i.children)]),
      [
        [0, 'one continued'],
        [1, 'nested'],
      ],
    )
    const ol = only('3. third\n4. fourth')
    assert.deepEqual(ol.kind === 'list' && [ol.ordered, ol.start, ol.items.length], [true, 3, 2])
  })

  it('keeps fenced code as written, and a table with its alignment', () => {
    assert.deepEqual(only('```sh\n# not a heading\n```'), { kind: 'code', text: '# not a heading', lang: 'sh' })
    const table = only('| Host | Sandbox |\n| :--- | ---: |\n| A | `microVM` |')
    assert.ok(table.kind === 'table')
    assert.deepEqual(table.align, ['left', 'right'])
    assert.deepEqual(table.head.map(plain), ['Host', 'Sandbox'])
    assert.deepEqual(
      table.rows.map((r) => r.map(plain)),
      [['A', 'microVM']],
    )
    const quote = only('> quoted **bold**')
    assert.equal(quote.kind === 'quote' && quote.blocks[0]?.kind, 'paragraph')
  })

  it('never yields HTML: tags stay text, images are named and never loaded, unsafe links are text', () => {
    const p = only(
      '<script>alert(1)</script> ![chart](https://evil.example/x.png) [click](javascript:alert(1)) <img src=x>',
    )
    assert.ok(p.kind === 'paragraph')
    assert.ok(p.children.every((i) => i.kind === 'text'))
    assert.equal(plain(p.children), '<script>alert(1)</script> [image: chart] click <img src=x>')
  })

  it('keeps http, https and mailto links, with emphasis and code inside text', () => {
    const p = only('See **[the docs](https://hosts.example.org/a)**, *not* `<b>` and <https://b.example/>.')
    assert.ok(p.kind === 'paragraph')
    const strong = p.children.find((i) => i.kind === 'strong')
    assert.ok(strong?.kind === 'strong')
    const link = strong.children[0]
    assert.ok(link?.kind === 'link' && link.href === 'https://hosts.example.org/a')
    assert.ok(p.children.some((i) => i.kind === 'em'))
    assert.ok(p.children.some((i) => i.kind === 'code' && i.text === '<b>'))
    assert.ok(p.children.some((i) => i.kind === 'link' && i.href === 'https://b.example/'))
    assert.equal(safeHref('mailto:team@example.org'), 'mailto:team@example.org')
    assert.equal(safeHref('data:text/html,<b>'), null)
    assert.equal(safeHref('/relative'), null)
  })

  it('numbers the sources a report cites by first appearance, in any of the forms a report names them', () => {
    const { blocks, citations } = parseMarkdown(
      `Hosts sandbox renders [${A}]. Costs vary (${B}; source: ${A}). See search:${B}#2 and ${A.toUpperCase()}.`,
    )
    assert.deepEqual(citations, [A, B])
    const [p] = blocks
    assert.ok(p?.kind === 'paragraph')
    assert.equal(plain(p.children), 'Hosts sandbox renders [1]. Costs vary [2][1]. See [2] and [1].')
  })

  it('numbers a link to a source id as a citation, in the forms models write it, a named label kept before it', () => {
    const { blocks, citations } = parseMarkdown(
      `Claim [1](${A}). Again [2](<${B}>) and [[1]](${A} "t"). A named one [OECD 2024](search:${B}#2). [](${A})`,
    )
    assert.deepEqual(citations, [A, B])
    const [p] = blocks
    assert.ok(p?.kind === 'paragraph')
    assert.equal(plain(p.children), 'Claim [1]. Again [2] and [1]. A named one OECD 2024[2]. [1]')
    assert.ok(!JSON.stringify(blocks).includes('"link"'))
  })

  it('cites a link only to a source the caller names; any other id stays its label, never a link', () => {
    const { blocks, citations } = parseMarkdown(`See [1](${A}) and [2](${B}), and [${B}].`, {
      citable: [A.toUpperCase()],
    })
    // The bracketed form keeps its behaviour: the option gates the link form only.
    assert.deepEqual(citations, [A, B])
    const [p] = blocks
    assert.ok(p?.kind === 'paragraph')
    assert.equal(plain(p.children), 'See [1] and 2, and [2].')
    assert.ok(!JSON.stringify(blocks).includes('"link"'))
    assert.deepEqual(parseMarkdown(`[2](${B})`, { citable: [] }).citations, [])
  })

  it('never takes a real link or an unsafe one for a citation', () => {
    const { blocks, citations } = parseMarkdown(`[y](https://e.org/${A}) [x](javascript:${A}) [z](#${A})`)
    assert.deepEqual(citations, [])
    const [p] = blocks
    assert.ok(p?.kind === 'paragraph')
    const links = p.children.filter((i) => i.kind === 'link')
    assert.deepEqual(
      links.map((l) => l.kind === 'link' && l.href),
      [`https://e.org/${A}`],
    )
  })

  it('leaves snake_case alone and survives unclosed markers', () => {
    const p = only('a snake_case_name and *unclosed and ** too')
    assert.equal(p.kind === 'paragraph' && plain(p.children), 'a snake_case_name and *unclosed and ** too')
    const nested = only('*a **b** c*')
    assert.ok(nested.kind === 'paragraph' && nested.children[0]?.kind === 'em')
  })

  it('counts words', () => {
    assert.equal(wordCount('Two hosts — one sandboxed, the other’s not.'), 7)
    assert.equal(wordCount(''), 0)
  })
})

/** Options with the same subheadings under each. */
const OPTIONS =
  '# Options\n\n## Option A\nFast.\n\n### Pros\nCheap.\n\n### Cons\nLoud.\n\n## Option B\nSlow.\n\n### Pros\nQuiet.\n\n### Cons\nCostly.\n'
/** OPTIONS with an Option C, with its own pros, between A and B. */
const OPTIONS_C = OPTIONS.replace('## Option B', '## Option C\nNew.\n\n### Pros\nFree.\n\n## Option B')
/** The same path three times under one title. */
const LOG = '# Log\n## Update\nMon.\n## Update\nTue.\n## Update\nWed.\n'
const NONE = { added: [], revised: [], removed: [], unchanged: [], conclusionChanged: false }

describe('section comparison (what Knowledge shows between two versions)', () => {
  const V1 = '# Hosts\nA and B.\n\n## Costs\nUnknown.\n\n## Conclusion\nUse A.\n\n```\n# not a heading\n```\n'
  const V2 = '# Hosts\nA and B.\n\n## Costs\nA is $1 a page.\n\n## Pricing tiers\nThree tiers.\n'

  it('splits like the service: a preamble without a heading, fenced code is not a heading', () => {
    assert.deepEqual(
      sectionsOf(`Intro.\n${V1}`).map((s) => [s.heading, s.anchor]),
      [
        [null, ''],
        ['Hosts', 'hosts'],
        ['Costs', 'costs'],
        ['Conclusion', 'conclusion'],
      ],
    )
    assert.equal(anchorOf('Pricing tiers: 2026!'), 'pricing-tiers-2026')
  })

  it('agrees with the service’s facts for the same two versions (0027 section_facts)', () => {
    assert.deepEqual(compareSections(V1, V2), {
      added: ['Pricing tiers'],
      revised: ['Costs'],
      removed: ['Conclusion'],
      unchanged: ['Hosts'],
      conclusionChanged: true,
    })
    assert.deepEqual(compareSections(V2, V2).conclusionChanged, false)
  })

  it('pairs each section at most once, as the service does (0036 section_facts)', () => {
    const v2 = OPTIONS_C.replace('Cheap.', 'Cheap and simple.')
    const none = { added: [], revised: [], removed: [] }
    assert.deepEqual(compareSections(OPTIONS, OPTIONS), {
      ...none,
      unchanged: ['Options', 'Option A', 'Pros', 'Cons', 'Option B', 'Pros', 'Cons'],
      conclusionChanged: false,
    })
    assert.deepEqual(compareSections(OPTIONS, v2), {
      added: ['Option C', 'Pros'],
      revised: ['Pros'],
      removed: [],
      unchanged: ['Options', 'Option A', 'Cons', 'Option B', 'Pros', 'Cons'],
      conclusionChanged: false,
    })
    assert.deepEqual(
      compareSections(
        '# Hosting\n\n## Pros\na\n\n## Cons\nb\n',
        '# Hosting, with costs\n\n## Pros\na\n\n## Cons\nb2\n',
      ),
      {
        added: ['Hosting, with costs'],
        revised: ['Cons'],
        removed: ['Hosting'],
        unchanged: ['Pros'],
        conclusionChanged: false,
      },
      'a renamed title keeps its sections',
    )
    assert.deepEqual(
      compareSections(
        '## Option A\nx\n\n### Pros\na\n\n## Option B\ny\n\n### Pros\nb\n',
        '## Option A\nx\n\n### Pros\na\n',
      ),
      { ...none, removed: ['Option B', 'Pros'], unchanged: ['Option A', 'Pros'], conclusionChanged: false },
      'a removed option takes its own Pros',
    )
  })

  it('pairs a repeated path by occurrence, never each with each (0036)', () => {
    assert.deepEqual(compareSections(LOG, LOG.replace('Tue.', 'Tue, late.')), {
      ...NONE,
      revised: ['Update'],
      unchanged: ['Log', 'Update', 'Update'],
    })
    assert.deepEqual(compareSections(LOG, `${LOG}## Update\nThu.\n`), {
      ...NONE,
      added: ['Update'],
      unchanged: ['Log', 'Update', 'Update', 'Update'],
    })
  })

  it('keeps what sits under a renamed title or parent, each repeated section with its own (0036)', () => {
    const options = ['Option A', 'Pros', 'Cons', 'Option B', 'Pros', 'Cons']
    assert.deepEqual(compareSections(OPTIONS, OPTIONS.replace('# Options', '# Choices')), {
      ...NONE,
      added: ['Choices'],
      removed: ['Options'],
      unchanged: options,
    })
    assert.deepEqual(
      compareSections(OPTIONS, OPTIONS_C.replace('# Options', '# Options, with C')),
      { ...NONE, added: ['Options, with C', 'Option C', 'Pros'], removed: ['Options'], unchanged: options },
      'a new option under a renamed title revises nothing',
    )
    assert.deepEqual(compareSections(LOG, LOG.replace('# Log', '# Journal')), {
      ...NONE,
      added: ['Journal'],
      removed: ['Log'],
      unchanged: ['Update', 'Update', 'Update'],
    })
    const week = '# T\n## Week\n### Update\nMon.\n### Update\nTue.\n### Update\nWed.\n'
    assert.deepEqual(compareSections(week, week.replace('## Week', '## Week 1')), {
      ...NONE,
      added: ['Week 1'],
      removed: ['Week'],
      unchanged: ['T', 'Update', 'Update', 'Update'],
    })
  })
})
