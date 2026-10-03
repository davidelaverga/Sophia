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
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const E = '55555555-5555-4555-8555-555555555555'

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

type Shape = string | { link: string; label: Shape[] } | { strong: Shape[] } | { em: Shape[] }

/** Inline content as text runs, `[n]` citations, emphasis and links with their contents' shapes. */
const runShape = (inline: readonly Inline[]): Shape[] =>
  inline.map((i): Shape => {
    if (i.kind === 'link') return { link: i.href, label: runShape(i.children) }
    if (i.kind === 'strong') return { strong: runShape(i.children) }
    if (i.kind === 'em') return { em: runShape(i.children) }
    return i.kind === 'cite' ? `[${i.n}]` : plain([i])
  })

/** How long a parse takes, in milliseconds. */
const timed = (md: string): number => {
  const t = performance.now()
  parseMarkdown(md)
  return performance.now() - t
}

/** `k` KiB of spaces. */
const spaces = (k: number): string => ' '.repeat(k * 1024)

/** A draft at its limit (262144 bytes): a table head k cells wide, then rows of one `|`, each filled in to k cells. */
const wide = (k: number): string => {
  const head = `${'a|'.repeat(k)}\n${'-|'.repeat(k)}\n`
  return head + '|\n'.repeat(Math.floor((262_144 - head.length) / 2))
}

/** A one-paragraph report's shape. */
const shape = (md: string): Shape[] => {
  const p = only(md)
  return p.kind === 'paragraph' ? runShape(p.children) : []
}

const only = (md: string): Block => {
  const { blocks } = parseMarkdown(md)
  assert.equal(blocks.length, 1, JSON.stringify(blocks))
  const [b] = blocks
  assert.ok(b)
  return b
}

/** `n` generated eight-character lines: list markers, digits, spaces, line separators. */
function generatedLines(n: number): string[] {
  const alphabet = [' ', ' ', '\t', '-', '+', '1', '.', ')', 'a', '\u2028', '\u00a0']
  const out: string[] = []
  let seed = 7
  for (let k = 0; k < n * 8; k += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    if (k % 8 === 0) out.push('')
    out[out.length - 1] += alphabet[seed % alphabet.length] ?? ''
  }
  return out.filter((line) => !/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line) && !/^\s*$/.test(line))
}

/** A one-line report's first item text, or null when it is not a list. */
function itemText(line: string): string | null {
  const b = parseMarkdown(line).blocks[0]
  return b?.kind === 'list' ? plain(b.items[0]?.children ?? []) : null
}

/** A line's item text as the pattern the parser used read it. */
function oldItem(line: string): string | null {
  const m = /^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$/.exec(line)
  return m ? (m[4] ?? '') : null
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

  it('closes a label on its own bracket: a citation before a link keeps the words between', () => {
    assert.deepEqual(shape(`Per [${A}], see [the docs](https://x.example/).`), [
      'Per ',
      '[1]',
      ', see ',
      { link: 'https://x.example/', label: ['the docs'] },
      '.',
    ])
    const { blocks, citations } = parseMarkdown(`First [${C}], then [1](<${A}>).`)
    assert.ok(blocks[0]?.kind === 'paragraph')
    assert.deepEqual(runShape(blocks[0].children), ['First ', '[1]', ', then ', '[2]', '.'])
    assert.deepEqual(citations, [C, A], 'numbered as read, not as parsed')
    assert.deepEqual(shape('See [a [b] c](https://x.example/).'), [
      'See ',
      { link: 'https://x.example/', label: ['a [b] c'] },
      '.',
    ])
    assert.deepEqual(shape('See [a \\] b](https://x.example/).'), [
      'See ',
      { link: 'https://x.example/', label: ['a ] b'] },
      '.',
    ])
    assert.deepEqual(shape('See [`a]`](https://x.example/).'), [
      'See ',
      { link: 'https://x.example/', label: ['a]'] },
      '.',
    ])
  })

  it('reads a label once, so brackets in brackets take linear time (a web page a draft cites is parsed in the API)', () => {
    let nested = 'a'
    for (let k = 0; k < 24; k += 1) nested = `[${nested}](https://x.example/${k})`
    assert.ok(timed(nested) < 250, 'a link 24 labels deep')
    let around = `${'['.repeat(3000)}${']'.repeat(3000)}`
    for (let k = 0; k < 8; k += 1) around = `[x ${around} [b](https://b.example/)](https://x.example/${k})`
    assert.ok(timed(around) < 250, 'balanced brackets inside 8 labels that each hold a link')
    assert.ok(timed('['.repeat(128 * 1024)) < 1000, '128 KiB of [')
    assert.deepEqual(shape('[[a](https://x.example/0)](https://x.example/1)'), [
      '[',
      { link: 'https://x.example/0', label: ['a'] },
      '](https://x.example/1)',
    ])
  })

  it('finds every link target’s end in one pass, so unclosed targets take linear time (a draft may hold 256 KiB)', () => {
    assert.ok(timed('[]((('.repeat((128 * 1024) / 5)) < 1000, '128 KiB of [](((')
    assert.ok(timed('[a](b '.repeat((96 * 1024) / 6)) < 1000, '96 KiB of [a](b and a space')
    assert.ok(timed(`${'[]('.repeat((64 * 1024) / 3)}\n${'[x]('.repeat(1024)}`) < 1000, 'two lines of [](')
  })

  it('reads a paragraph of many short lines in linear time, its hard breaks kept (a draft may hold 256 KiB)', () => {
    assert.ok(timed('x(\n'.repeat((256 * 1024) / 3)) < 1000, '256 KiB of x( lines in one paragraph')
    assert.ok(timed('abcd\n'.repeat((256 * 1024) / 5)) < 1000, '256 KiB of short lines in one paragraph')
    assert.ok(timed('[]((\n'.repeat((256 * 1024) / 5)) < 1000, '256 KiB of [](( lines in one paragraph')
    const p = only('a  \nb \nc\\\nd \\ \ne\t\nf')
    assert.equal(p.kind, 'paragraph')
    assert.deepEqual(p.kind === 'paragraph' ? p.children.map((i) => (i.kind === 'break' ? '<br>' : plain([i]))) : [], [
      'a',
      '<br>',
      'b  c\nd',
      '<br>',
      'e\t f',
    ])
  })

  it('finds each emphasis closer once, so openers that never close take linear time (a draft may hold 256 KiB)', () => {
    // Each `_` after an `_` opens, and every later `__` is skipped as a double: none of them closes.
    assert.ok(timed('a__'.repeat((64 * 1024) / 3)) < 1000, '64 KiB of a__')
    assert.ok(timed('a__'.repeat((256 * 1024) / 3)) < 1000, '256 KiB of a__')
    assert.ok(timed('see foo__bar here '.repeat((256 * 1024) / 18)) < 1000, '256 KiB of foo__bar in prose')
    assert.ok(timed('*a **b `c` '.repeat((256 * 1024) / 11)) < 1000, '256 KiB of stars and code spans')
    assert.deepEqual(shape('a__b__c *d* __e__'), ['a__b__c ', { em: ['d'] }, ' ', { strong: ['e'] }])
    assert.deepEqual(shape('_x foo__bar y_'), [{ em: ['x foo__bar y'] }])
    assert.deepEqual(shape('*a **b** c*'), [{ em: ['a ', { strong: ['b'] }, ' c'] }])
    assert.deepEqual(shape('see foo__bar and _this_ here'), ['see foo_', { em: ['bar and '] }, 'this_ here'])
    assert.deepEqual(shape('`a__b` *c `*` d*'), ['a__b', ' ', { em: ['c ', '*', ' d'] }])
  })

  it('reads an autolink up to the next <, so a run of them before one > takes linear time', () => {
    assert.ok(timed(`${'<'.repeat(64 * 1024)}>`) < 1000, '64 KiB of < and one >')
    assert.ok(timed(`${'<'.repeat(256 * 1024)}>`) < 1000, '256 KiB of < and one >')
    assert.ok(timed(`${'<http://'.repeat((256 * 1024) / 8)}>`) < 1000, '256 KiB of <http:// and one >')
    assert.deepEqual(shape('<<https://b.example/>'), [
      '<',
      { link: 'https://b.example/', label: ['https://b.example/'] },
    ])
    assert.deepEqual(shape('<https://x.example/a<b>'), ['<https://x.example/a<b>'])
  })

  it('reads a heading and a table’s delimiter row in linear time, however many spaces they hold', () => {
    assert.ok(timed(`# a${spaces(2)}b`) < 250, 'a heading with 2 KiB of spaces')
    assert.ok(timed(`# a${spaces(256)}b`) < 1000, 'a heading with 256 KiB of spaces')
    assert.ok(timed(`a\n## b${spaces(256)}c #`) < 1000, 'a heading under a paragraph')
    const compared = (k: number) => {
      const t = performance.now()
      compareSections(`# a${spaces(k)}b`, `# a${spaces(k)}c`)
      return performance.now() - t
    }
    assert.ok(compared(2) < 250, 'the sections of two versions with such a heading, 2 KiB of spaces')
    assert.ok(compared(256) < 1000, 'the sections of two versions with such a heading, 256 KiB of spaces')
    assert.ok(timed(`a|b\n${spaces(64)}|x`) < 1000, 'a row under a pipe, 64 KiB of spaces then text')
    assert.ok(timed(`a|b\n|-${spaces(256)}x|`) < 1000, 'a row under a pipe, 256 KiB of spaces in it')
    const headings = parseMarkdown('# Title ##\n## a #b\n#   \n# a\u2028b\n####### x\n## x \u2028').blocks
    assert.deepEqual(
      headings.map((b) => (b.kind === 'heading' ? `${b.level}:${plain(b.children)}` : b.kind)),
      ['1:Title', '2:a #b', 'paragraph', '2:x'],
    )
    assert.deepEqual(
      sectionsOf('# Title ##\n\t# Tabbed #\nbody').map((x) => x.heading),
      ['Title', 'Tabbed'],
    )
    assert.equal(only('a|b\n| :- | -: |\n|c|d|').kind, 'table')
    assert.equal(only('a|b\n|- x|').kind, 'paragraph')
  })

  it('reads a wide table over many short rows in linear time: the cells it fills in are bounded', () => {
    for (const k of [20, 200, 2000]) assert.ok(timed(wide(k)) < 1500, `a ${k}-cell head over rows of one pipe`)
    const [table, rest] = parseMarkdown(wide(200)).blocks
    assert.ok(table?.kind === 'table' && rest?.kind === 'paragraph')
    assert.equal(table.rows.length, Math.floor((1 << 16) / 199), 'rows until 65536 cells are filled in, then text')
    const short = only('a|b|c\n-|-|-\n|x|\n|\n')
    assert.ok(short.kind === 'table')
    assert.deepEqual(
      short.rows.map((r) => r.map(plain)),
      [
        ['x', '', ''],
        ['', '', ''],
      ],
    )
  })

  it('reads a list item and a citation’s marker label in linear time, however many spaces they hold', () => {
    for (const [k, limit] of [
      [2, 250],
      [256, 1000],
    ] as const) {
      assert.ok(timed(`- ${spaces(k)}a\u2028b`) < limit, `an item with ${k} KiB of spaces and a U+2028`)
      assert.ok(timed(`1. ${spaces(k)}a\u2029b`) < limit, `an ordered item with ${k} KiB of spaces and a U+2029`)
      assert.ok(timed(`p\n- ${spaces(k)}a\u2028b`) < limit, `such an item under a paragraph, ${k} KiB`)
      assert.ok(timed(`[${spaces(k)}x](${A})`) < limit, `a citing link's label of ${k} KiB of spaces`)
    }
    assert.deepEqual(parseMarkdown(`[ 1 ](${A}) [ ^2 ](${B}) [  ](${A})`).citations, [A, B])
    assert.equal(plain((only(`[ 1 ](${A}) [ [2] ](${B})`) as { children: Inline[] }).children), '[1] [2]')
    // The same lines are items as the pattern the parser used read them, on generated lines.
    for (const line of generatedLines(4000)) assert.equal(itemText(line), oldItem(line), JSON.stringify(line))
  })

  it('numbers a link to a ref written with a space after its prefix, as the bracketed form numbers it', () => {
    const { blocks, citations } = parseMarkdown(
      `Claim [1](source: ${A}). More [2](input: ${B}#1), [x](<search:\t${A}#2> "t"). Bracketed [source: ${B}].`,
    )
    assert.deepEqual(citations, [A, B])
    assert.ok(blocks[0]?.kind === 'paragraph')
    assert.equal(plain(blocks[0].children), 'Claim [1]. More [2], x[1]. Bracketed [2].')
    assert.ok(!JSON.stringify(blocks).includes('"link"'))
    // A space after the `<` is not a ref; nor is an uncited source.
    assert.deepEqual(parseMarkdown(`See [1](< ${A}).`).citations, [])
    assert.deepEqual(parseMarkdown(`See [1](source: ${A}).`, { citable: [] }).citations, [])
  })

  it('reads link spaces as ASCII only, so a no-break space or U+FEFF does not cite', () => {
    for (const md of [
      `[1](source:\u00a0${A})`,
      `[1](source:\ufeff${A})`,
      `[1](<${A}>\u00a0"t")`,
      `[1](\u00a0${A})`,
      `[1](${A}\u3000)`,
    ]) {
      assert.deepEqual(parseMarkdown(`Claim ${md}.`).citations, [], JSON.stringify(md))
    }
    assert.deepEqual(parseMarkdown(`Claim [1](\t${A} ), [2](<source:\t${B}>\t"t").`).citations, [A, B])
  })

  it('cites nothing in a span that opens like an autolink and holds a <', () => {
    assert.deepEqual(parseMarkdown(`See <https://x.example/a<${A}> here.`).citations, [])
    assert.deepEqual(parseMarkdown(`Open <HTTPS://app.example/s/<${A}>> or <mailto:a<${B}>.`).citations, [])
    assert.deepEqual(shape(`See <https://x.example/a<${A}> here.`), ['See ', `<https://x.example/a<${A}>`, ' here.'])
    assert.deepEqual(shape('<https://a <https://b.example/>'), ['<https://a <https://b.example/>'])
    assert.deepEqual(shape(`<x <https://b.example/> ${A}`), [
      '<x ',
      { link: 'https://b.example/', label: ['https://b.example/'] },
      ' ',
      '[1]',
    ])
    assert.ok(timed('<http://'.repeat((256 * 1024) / 8)) < 1000, '256 KiB of <http:// and no >')
    assert.ok(timed(`${'<https://a<'.repeat((256 * 1024) / 11)}>`) < 1000, '256 KiB of <https://a< and one >')
  })

  it('ends a link target on its own parenthesis, those inside it balanced, and never past its line', () => {
    assert.deepEqual(shape('See [the docs](https://x.example/a "Title") then.'), [
      'See ',
      { link: 'https://x.example/a', label: ['the docs'] },
      ' then.',
    ])
    assert.deepEqual(
      shape('See [Lisp](https://en.example/wiki/Lisp_(language)) and [f](https://x.example/f(a(b))c).'),
      [
        'See ',
        { link: 'https://en.example/wiki/Lisp_(language)', label: ['Lisp'] },
        ' and ',
        { link: 'https://x.example/f(a(b))c', label: ['f'] },
        '.',
      ],
    )
    assert.deepEqual(shape('[a](b)) [c](https://c.example/)) d'), [
      'a',
      ') ',
      { link: 'https://c.example/', label: ['c'] },
      ') d',
    ])
    assert.deepEqual(shape('See [a](https://x.example/ more'), ['See [a](https://x.example/ more'])
    assert.deepEqual(shape('See [a](https://x.example/(b) more'), ['See [a](https://x.example/(b) more'])
    assert.deepEqual(shape('See [a](https://x.example/\nb) c'), ['See [a](https://x.example/ b) c'])
    assert.deepEqual(shape('[](((([b](https://b.example/) c'), [
      '[]((((',
      { link: 'https://b.example/', label: ['b'] },
      ' c',
    ])
  })

  it('never puts an anchor inside another: a link in a label is the link, a citation in a label follows it', () => {
    assert.deepEqual(shape('[a [b](https://u1.example/) c](https://u2.example/)'), [
      '[a ',
      { link: 'https://u1.example/', label: ['b'] },
      ' c](https://u2.example/)',
    ])
    assert.deepEqual(shape(`[Report [${A}]](https://x.example/) then [${B}].`), [
      { link: 'https://x.example/', label: ['Report '] },
      '[1]',
      ' then ',
      '[2]',
      '.',
    ])
    assert.deepEqual(shape('See [**the [docs](https://a.example/)**](https://b.example/)'), [
      'See ',
      '[',
      { strong: ['the ', { link: 'https://a.example/', label: ['docs'] }] },
      '](https://b.example/)',
    ])
    assert.deepEqual(shape(`[*Report [${A}]*](https://c.example/)`), [
      { link: 'https://c.example/', label: [{ em: ['Report '] }] },
      '[1]',
    ])
  })

  it('names a link by its site when its label holds only citations, never an empty anchor', () => {
    assert.deepEqual(shape(`Read the study [${A}](https://example.org/study).`), [
      'Read the study ',
      { link: 'https://example.org/study', label: ['example.org'] },
      '[1]',
      '.',
    ])
    assert.deepEqual(shape(`[${A}; ${B}](https://x.example/)`), [
      { link: 'https://x.example/', label: ['x.example'] },
      '[1]',
      '[2]',
    ])
    assert.deepEqual(shape(`[source: ${A}](mailto:desk@x.example)`), [
      { link: 'mailto:desk@x.example', label: ['desk@x.example'] },
      '[1]',
    ])
    assert.deepEqual(shape(`[\`v2\` [${A}]](https://x.example/)`), [
      { link: 'https://x.example/', label: ['v2', ' '] },
      '[1]',
    ])
  })

  it('numbers citations in reading order through lists, quotes and tables', () => {
    const md = [`- one [${C}]`, '', `> two [x [${B}]](https://x.example/)`, '', '| a |', '|---|', `| [${A}] [${C}] |`]
    const { blocks, citations } = parseMarkdown(md.join('\n'))
    assert.deepEqual(citations, [C, B, A])
    const table = blocks[2]
    assert.ok(table?.kind === 'table')
    assert.equal(plain(table.rows[0]?.[0] ?? []), '[3] [1]')
  })

  it('numbers citations in reading order in headings, emphasis and table heads, whatever order the parse meets them', () => {
    const md = [
      `## Findings [${C}] in [x [${B}]](https://x.example/)`,
      '',
      `**Costs [${D}]** and [*fell [${A}]*](https://y.example/) [${C}].`,
      '',
      `| [y [${E}]](https://z.example/) [${A}] |`,
      '|---|',
      `| [${D}] |`,
    ]
    const { blocks, citations } = parseMarkdown(md.join('\n'))
    assert.deepEqual(citations, [C, B, D, A, E])
    const [heading, paragraph, table] = blocks
    assert.ok(heading?.kind === 'heading' && paragraph?.kind === 'paragraph' && table?.kind === 'table')
    assert.equal(plain(heading.children), 'Findings [1] in x [2]')
    assert.equal(plain(paragraph.children), 'Costs [3] and fell [4] [1].')
    assert.equal(plain(table.head[0] ?? []), 'y [5] [4]')
    assert.equal(plain(table.rows[0]?.[0] ?? []), '[3]')
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
