import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkSource,
  compile,
  contentPackage,
  DESIGN_CSP,
  FULL_SCOPE,
  HTML_BYTES,
  packageSha256,
  reviseSource,
  type ContentPackage,
  type SourceFile,
} from './index.ts'
import { lineAt } from './dom.ts'
import { plainPage } from './testing.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const REPORT = `# Renderers that run in a sandbox

Three hosts were compared on cost and isolation [${A}].

## Findings

- Host one costs 12.50 USD a month [${B}].
- Host two needs a dedicated VM.
  - Nested: its namespaces are user-owned.

| Host | Cost | Isolation |
| --- | --- | --- |
| One | 12.50 | seccomp [${A}] |
| Two | 30 | VM |

> A quoted caveat from the vendor, see [their notes](https://example.com/notes).

\`\`\`
unshare --user --net
\`\`\`
`

const LIMITS = ['Only two hosts were read in full.', '   ']
const content = contentPackage(REPORT, LIMITS)
const good = plainPage(content, { perSection: 3 })

const html = (files: SourceFile[]): string => files.find((f) => f.path === 'index.html')?.text ?? ''
const withHtml = (files: SourceFile[], text: string): SourceFile[] =>
  files.map((f) => (f.path === 'index.html' ? { ...f, text } : f))
const withCss = (files: SourceFile[], text: string): SourceFile[] =>
  files.map((f) => (f.path === 'styles.css' ? { ...f, text } : f))
/** A stylesheet of `n` media queries, at widths 100px apart from `from`. */
const mediaSheet = (from: number, n: number): string =>
  Array.from({ length: n }, (_, i) => `@media (min-width: ${String(from + i * 100)}px){p{color:#111}}`).join('\n')
/** The codes of a source's errors against a content package. */
const errorCodes = (files: SourceFile[], pkg: ContentPackage): string[] =>
  checkSource(files, pkg)
    .findings.filter((f) => f.severity === 'error')
    .map((f) => f.code)
const codes = (files: SourceFile[]): string[] =>
  checkSource(files, content)
    .findings.filter((f) => f.severity === 'error')
    .map((f) => f.code)

describe('the frozen content package', () => {
  it('reads every paragraph, item, table, quote, code block and stored limitation as a block, in reading order', () => {
    assert.deepEqual(
      content.blocks.map((b) => b.kind),
      ['paragraph', 'item', 'item', 'item', 'table', 'quote', 'code', 'limitation'],
    )
    assert.deepEqual(
      content.blocks.map((b) => b.id),
      ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
    )
    assert.equal(
      content.blocks[0]?.text,
      'Three hosts were compared on cost and isolation.',
      'the citation leaves no stray space',
    )
    assert.deepEqual(content.blocks[0]?.citations, [A])
    assert.deepEqual(content.blocks[4]?.cells, [
      'Host',
      'Cost',
      'Isolation',
      'One',
      '12.50',
      'seccomp',
      'Two',
      '30',
      'VM',
    ])
    assert.deepEqual(content.blocks[5]?.links, ['https://example.com/notes'])
    assert.deepEqual(content.citations, [A, B])
  })

  it('is the same for the same Markdown and limitations', () => {
    assert.deepEqual(contentPackage(REPORT, LIMITS), content)
  })
})

// #117, CX-0039: an ordered list's numbers are the research's (pack 05 §3), kept as its items' own text: the page shows
// them as written there, and never generates one.
describe("an ordered list's numbers, frozen as its items' text (#117, CX-0039)", () => {
  const MD = `Intro.

3. Alpha
4. Beta
   - a nested note
5. Gamma

- a bullet

1. One
3. Three
`
  const ordered = contentPackage(MD, [])
  const page = plainPage(ordered)
  const B2 = '<ul><li data-block="b2">3. Alpha</li></ul>'
  const B3 = '<ul><li data-block="b3">4. Beta</li></ul>'
  const errors = (files: SourceFile[]): string[] => errorCodes(files, ordered)
  const swap = (files: SourceFile[], from: string, to: string): SourceFile[] => {
    const text = html(files).replace(from, to)
    assert.notEqual(text, html(files), `fixture contains ${from}`)
    return withHtml(files, text)
  }
  it('freezes each top-level item with the number the report shows: its list start, then its place', () => {
    assert.deepEqual(
      ordered.blocks.map((b) => b.text),
      ['Intro.', '3. Alpha', '4. Beta', 'a nested note', '5. Gamma', 'a bullet', '1. One', '2. Three'],
    )
    assert.deepEqual(contentPackage(MD, []), ordered, 'the same for the same Markdown')
  })
  it("accepts a page that shows each number as its item's text, in a list with no marker, in any order", () => {
    assert.deepEqual(errors(page), [])
    const designed = swap(
      withCss(page, 'ul.steps{list-style:none;padding:0} .n{font-weight:700}'),
      '<ul><li data-block="b2">3. Alpha</li></ul>',
      '<ul class="steps"><li data-block="b2"><span class="n">3.</span> Alpha</li></ul>',
    )
    assert.deepEqual(errors(designed), [])
    const reordered = swap(page, `${B2}\n${B3}`, `${B3}\n${B2}`)
    assert.deepEqual(errors(reordered), [], 'moved, each item keeps its own number: "4. Beta" then "3. Alpha"')
  })
  it("refuses a page that drops, changes, generates or renumbers an item's number", () => {
    const item = '<li data-block="b2">3. Alpha</li>'
    assert.deepEqual(errors(swap(page, item, '<li data-block="b2">Alpha</li>')), ['block_altered'], 'dropped')
    assert.deepEqual(errors(swap(page, item, '<li data-block="b2">4. Alpha</li>')), ['block_altered'], 'changed')
    assert.deepEqual(errors(swap(page, item, '<li data-block="b2">3) Alpha</li>')), ['block_altered'], 'rewritten')
    const generated = withCss(
      swap(page, item, '<li data-block="b2">Alpha</li>'),
      '[data-block="b2"]::before{content:"3. "}',
    )
    assert.deepEqual(errors(generated), ['css_unsafe'], 'generated: refused before its text is read')
    const renumbered = swap(
      page,
      `${B2}\n${B3}`,
      '<ul><li data-block="b3">3. Beta</li></ul>\n<ul><li data-block="b2">4. Alpha</li></ul>',
    )
    assert.deepEqual(errors(renumbered), ['block_altered', 'block_altered'], 'moved and renumbered to read 3, 4')
    const listed = swap(page, `<ul>${item}</ul>`, '<ol start="3"><li data-block="b2">Alpha</li></ol>')
    assert.deepEqual(errors(listed), ['unsafe_element'], 'an <ol> numbers it: refused before its text is read')
  })
  it('keeps a package stored without numbers as it was: no number a page can add, in a block or beside it', () => {
    const stored = {
      ...ordered,
      blocks: ordered.blocks.map((b) => ({ ...b, text: b.text.replace(/^\d+\. /u, '') })),
    }
    const old = plainPage(stored)
    assert.deepEqual(errorCodes(old, stored), [], 'its items show as bullets, as before')
    const item = '<li data-block="b2">Alpha</li>'
    assert.deepEqual(errorCodes(swap(old, item, '<li data-block="b2">3. Alpha</li>'), stored), ['block_altered'])
    const beside = swap(old, item, '<li><b>3.</b> <span data-block="b2">Alpha</span></li>')
    assert.deepEqual(errorCodes(beside, stored), ['text_outside_blocks'])
  })
})

describe('a source that keeps its content and the static profile', () => {
  it('is complete and safe, with its sections and a stable identity', () => {
    const check = checkSource(good, content)
    assert.deepEqual(
      check.findings.filter((f) => f.severity === 'error'),
      [],
    )
    assert.equal(check.unsafe, false)
    assert.equal(check.complete, true)
    assert.deepEqual(
      check.sections.map((s) => s.id),
      ['s1', 's2', 's3', 'sources'],
    )
    assert.match(check.sha256, /^[0-9a-f]{64}$/)
    assert.equal(packageSha256(good), check.sha256)
    assert.notEqual(packageSha256(withCss(good, 'body{}')), check.sha256)
  })

  it('keeps a nested list item as its own block inside its parent item', () => {
    const one = plainPage(content)
    const page = html(one).replace(
      `<ul><li data-block="b3">Host two needs a dedicated VM.</li></ul>\n<ul><li data-block="b4">Nested: its namespaces are user-owned.</li></ul>`,
      `<ul><li data-block="b3">Host two needs a dedicated VM.<ul><li data-block="b4">Nested: its namespaces are user-owned.</li></ul></li></ul>`,
    )
    assert.notEqual(page, html(one), 'the fixture nests the item')
    assert.deepEqual(codes(withHtml(one, page)), [])
  })
})

describe('the static profile refuses what can run, load or submit', () => {
  const unsafe: [string, string, string][] = [
    ['a script', '<script>alert(1)</script>', 'unsafe_element'],
    ['an event handler', '<p onclick="x()">t</p>', 'unsafe_attribute'],
    ['a javascript: link', '<a href="javascript:alert(1)">t</a>', 'unsafe_attribute'],
    ['a data: link', '<a href="data:text/html,x">t</a>', 'unsafe_attribute'],
    ['an iframe', '<iframe src="https://example.com"></iframe>', 'unsafe_element'],
    ['an image', '<img src="https://example.com/x.png" alt="">', 'unsafe_element'],
    ['inline SVG', '<svg><circle r="4"/></svg>', 'unsafe_element'],
    ['MathML', '<math><mi>x</mi></math>', 'unsafe_element'],
    ['a form', '<form action="https://example.com"><input></form>', 'unsafe_element'],
    ['an object', '<object data="x"></object>', 'unsafe_element'],
    ['a button', '<button>Go</button>', 'unsafe_element'],
    ['a target attribute', '<a href="https://example.com" target="_blank">t</a>', 'unsafe_attribute'],
    ['a style attribute with url()', '<p style="background:url(https://example.com/t.png)">t</p>', 'css_unsafe'],
    ['a positive tabindex', '<p tabindex="3">t</p>', 'unsafe_attribute'],
    ['a link to a missing anchor', '<a href="#nowhere">t</a>', 'anchor_missing'],
  ]
  for (const [what, markup, code] of unsafe) {
    it(`refuses ${what}`, () => {
      const page = html(good).replace('<main>', `<main>${markup}`)
      const check = checkSource(withHtml(good, page), content)
      assert.equal(check.unsafe, true, what)
      assert.ok(
        check.findings.some((f) => f.code === code),
        `${what}: ${JSON.stringify(check.findings.map((f) => f.code))}`,
      )
    })
  }

  const head: [string, string, string][] = [
    ['a stylesheet link', '<link rel="stylesheet" href="https://example.com/x.css">', 'unsafe_element'],
    ['a refresh', '<meta http-equiv="refresh" content="0;url=https://example.com">', 'unsafe_attribute'],
    ['a base', '<base href="https://example.com/">', 'unsafe_element'],
    ['a style with @import', '<style>@import "https://example.com/x.css";</style>', 'css_unsafe'],
  ]
  for (const [what, markup, code] of head) {
    it(`refuses ${what} in <head>`, () => {
      const page = html(good).replace('<head>', `<head>${markup}`)
      assert.ok(codes(withHtml(good, page)).includes(code), what)
    })
  }

  const css: [string, string, string][] = [
    ['url()', 'body{background:url(https://example.com/t.png)}', 'css_unsafe'],
    ['an upper-case URL()', 'body{background:URL("x")}', 'css_unsafe'],
    ['an escaped url (unreadable to the parser)', 'body{background:\\75 rl(x)}', 'css_unsafe'],
    ['an escaped function name', 'body{background:u\\rl(x)}', 'css_unsafe'],
    ['@import', '@import "x.css";', 'css_unsafe'],
    ['an escaped @import', '@\\69mport "x.css";', 'css_unsafe'],
    ['@font-face', '@font-face{font-family:x;src:local(y)}', 'css_unsafe'],
    ['image-set()', 'body{background:image-set("x" 1x)}', 'css_unsafe'],
    ['expression()', 'body{width:expression(alert(1))}', 'css_unsafe'],
    ['-moz-binding', 'body{-moz-binding:none}', 'css_unsafe'],
    ['a custom property holding a url', ':root{--bg:url(x)} body{background:var(--bg)}', 'css_unsafe'],
    ['a </style> breakout in a string', 'body::before{content:"</style><script>alert(1)</script>"}', 'css_breakout'],
    ['a declaration the parser cannot read', 'body{color:red;;;width:(}', 'css_invalid'],
  ]
  for (const [what, sheet, code] of css) {
    it(`refuses ${what} in styles.css`, () => {
      assert.ok(codes(withCss(good, sheet)).includes(code), `${what}: ${JSON.stringify(codes(withCss(good, sheet)))}`)
    })
  }

  it('refuses motion: what the captures show at load is what a reader keeps seeing (#117)', () => {
    for (const sheet of [
      '@keyframes reveal{from{opacity:.1}to{opacity:1}}',
      'h2{animation:reveal 0s 60s forwards}',
      'h2{animation-delay:60s}',
      'h2{-webkit-animation:reveal 1s}',
      'h2{transition:opacity 60s}',
      'h2:hover{transition-property:opacity}',
    ])
      assert.ok(codes(withCss(good, sheet)).includes('css_unsafe'), sheet)
    const inline = html(good).replace('<h1>', '<h1 style="transition:opacity 9s">')
    assert.ok(codes(withHtml(good, inline)).includes('css_unsafe'))
    assert.deepEqual(codes(withCss(good, 'h2{opacity:.9}')), [])
  })
  it('allows the CSS a static article needs: media queries, gradients, custom properties, calc', () => {
    const sheet =
      ':root{--ink:#1a1a1a} body{color:var(--ink);background:linear-gradient(#fff,#fafafa);width:calc(100% - 2rem)} @media (max-width: 600px){body{font-size:17px}} h1::before{content:"";display:block;border-top:2px solid}'
    assert.deepEqual(codes(withCss(good, sheet)), [])
  })
})

describe('the content check catches every way the research could be lost or changed (B-06)', () => {
  const mutate = (from: string, to: string): string[] => {
    const page = html(good).replace(from, to)
    assert.notEqual(page, html(good), `fixture contains ${from}`)
    return codes(withHtml(good, page))
  }
  it('a dropped block', () => assert.ok(mutate('<p data-block="b1">', '<p>').includes('block_missing')))
  it('a changed number', () => assert.ok(mutate('12.50 USD', '12.05 USD').includes('block_altered')))
  it('a changed table cell', () => assert.ok(mutate('<td>30</td>', '<td>35</td>').includes('block_altered')))
  it('a dropped citation', () =>
    assert.ok(mutate(`<a data-cite="${B}" href="#src-${B}">[2]</a>`, '').includes('citation_altered')))
  it('an added citation', () =>
    assert.ok(
      mutate('<p data-block="b1">', `<p data-block="b1"><a data-cite="${B}" href="#src-${B}">x</a>`).includes(
        'citation_altered',
      ),
    ))
  it('a repeated block', () =>
    assert.ok(
      mutate('</main>', '<p data-block="b1">Three hosts were compared on cost and isolation.</p></main>').includes(
        'block_repeated',
      ),
    ))
  it('an invented block id', () =>
    assert.ok(mutate('</main>', '<p data-block="b99">x</p></main>').includes('block_unknown')))
  it('a dropped source', () => assert.ok(mutate(`data-source="${A}"`, '').includes('source_missing')))
  it('a changed link', () =>
    assert.ok(mutate('https://example.com/notes', 'https://example.org/notes').includes('link_altered')))
  it('a dropped stored limitation', () => assert.ok(mutate('<p data-block="b8">', '<p>').includes('block_missing')))
  it('a claim padded with text the research does not say', () =>
    assert.ok(mutate('cost and isolation.', 'cost and isolation. It is the best.').includes('block_altered')))
  it('accepts wording changes in headings, of any length', () => {
    const heading =
      'Dove può girare un renderer confinato: costi, isolamento e limiti dei tre host confrontati nel dettaglio'
    const page = html(good)
      .replace('<h1>Report</h1>', `<h1>${heading}</h1>`)
      .replace('<title>Report</title>', `<title>${heading}</title>`)
    assert.deepEqual(codes(withHtml(good, page)), [])
  })
  it('does not accept hiding as a content check: markup cannot prove visibility, so the render measures it', () => {
    // hidden="" keeps the text in the file; the capture kernel's visibility measurement is what refuses it.
    assert.deepEqual(mutate('<p data-block="b1">', '<p data-block="b1" hidden>'), [])
  })
})

/** A source's entry as the plain page lists it. */
const entry = (id: string) => `<li id="src-${id}" data-source="${id}">Source ${id}</li>`

describe('a citation marker cannot carry a claim or lead elsewhere (SDD-01-CX-0019 F2)', () => {
  const marker = `<a data-cite="${A}" href="#src-${A}">[1]</a>`
  const swap = (to: string): string[] => {
    const page = html(good).replace(marker, to)
    assert.notEqual(page, html(good), 'the fixture carries the marker')
    return codes(withHtml(good, page))
  }
  it('refuses the counterexample: a fabricated claim linking elsewhere inside the marker', () =>
    assert.deepEqual(swap(`<span data-cite="${A}"><a href="https://unrelated.example">fabricated claim</a></span>`), [
      'citation_marker',
    ]))
  it('refuses a marker whose text is more than a mark', () => {
    assert.deepEqual(swap(`<sup data-cite="${A}">verified by NIST</sup>`), ['citation_marker'])
    assert.deepEqual(swap(`<a data-cite="${A}" href="#src-${A}">[12] cheap</a>`), ['citation_marker'])
  })
  it("refuses a link to anywhere but this source's own entry on the page", () => {
    assert.deepEqual(swap(`<a data-cite="${A}" href="https://example.com/">[1]</a>`), ['citation_marker'])
    assert.deepEqual(swap(`<a data-cite="${A}" href="#src-${B}">[1]</a>`), ['citation_marker'])
    // A fragment naming nothing on the page is already refused by the profile.
    assert.deepEqual(swap(`<a data-cite="${A}" href="#nowhere">[1]</a>`), ['anchor_missing'])
    assert.deepEqual(swap(`<a data-cite="${A}">[1]</a>`), ['citation_marker'])
  })
  it('refuses another element, a second link or a nested marker inside it', () => {
    assert.deepEqual(swap(`<sup data-cite="${A}"><em>1</em></sup>`), ['citation_marker'])
    assert.deepEqual(swap(`<sup data-cite="${A}"><a href="#src-${A}">1</a><a href="#src-${A}">2</a></sup>`), [
      'citation_marker',
    ])
    assert.ok(swap(`<sup data-cite="${A}"><span data-cite="${A}">1</span></sup>`).includes('citation_marker'))
    assert.ok(swap(`<div data-cite="${A}">1</div>`).includes('citation_marker'))
  })
  it('refuses a claim in its accessible name', () =>
    assert.deepEqual(swap(`<a data-cite="${A}" href="#src-${A}" aria-label="Independently verified">[1]</a>`), [
      'citation_marker',
    ]))
  // Every attribute whose text a reader meets without seeing it (SDD-01-CX-0031, CX-0032), on the marker and its link.
  const claim = 'Host three is free'
  const textAttributes = [
    'title',
    'aria-label',
    'aria-description',
    'aria-roledescription',
    'aria-valuetext',
    'aria-placeholder',
    'aria-keyshortcuts',
    'aria-braillelabel',
    'aria-brailleroledescription',
    'aria-colindextext',
    'aria-rowindextext',
  ]
  it('refuses a claim in any text-bearing attribute of the marker', () => {
    for (const name of textAttributes) {
      const to = `<a data-cite="${A}" href="#src-${A}" ${name}="${claim}">[1]</a>`
      assert.deepEqual(swap(to), ['citation_marker'], to)
    }
  })
  it("refuses a claim in any text-bearing attribute of the marker's link", () => {
    for (const name of textAttributes) {
      const to = `<sup data-cite="${A}"><a href="#src-${A}" ${name}="${claim}">[1]</a></sup>`
      assert.deepEqual(swap(to), ['citation_marker'], to)
    }
  })
  it('accepts the ways a page marks a citation', () => {
    for (const ok of [
      `<sup data-cite="${A}">[1]</sup>`,
      `<sup data-cite="${A}"><a href="#src-${A}">(1)</a></sup>`,
      `<sup data-cite="${A}">[<a href="#src-${A}">1</a>]</sup>`,
      `<a data-cite="${A}" href="#src-${A}" title="Source 1">(1)</a>`,
      `<span data-cite="${A}" aria-label="Fonte 1"></span>`,
      `<sup data-cite="${A}">†</sup>`,
      `<a data-cite="${A}" href="#src-${A}">[*]</a>`,
    ])
      assert.deepEqual(swap(ok), [], ok)
  })
  // #117: markers side by side spell nothing, and a mark does not run into the number beside it.
  it('refuses a mark with a letter, or a bare number, alone or in a row of markers', () => {
    for (const bad of [
      `<span data-cite="${A}">H</span><span data-cite="${A}">o</span><span data-cite="${A}">s</span><span data-cite="${A}">t</span>`,
      `<a data-cite="${A}" href="#src-${A}">[s]</a>`,
      `<a data-cite="${A}" href="#src-${A}">(a)</a>`,
      `<sup data-cite="${A}">1</sup>`,
      `<a data-cite="${A}" href="#src-${A}">12</a>`,
    ])
      assert.ok(swap(bad).includes('citation_marker'), bad)
  })
  // #117: a screen reader announces the attribute; a bare number, or a mark the page does not show, is a value no
  // screenshot shows, and markers side by side would read as one number.
  it("refuses a bare number, or a mark other than the marker's own, in a text-bearing attribute", () => {
    for (const bad of [
      `<a data-cite="${A}" href="#src-${A}" aria-label="0">†</a>`,
      `<sup data-cite="${A}" title="7">[1]</sup>`,
      `<sup data-cite="${A}"><a href="#src-${A}" aria-label="12">[1]</a></sup>`,
      `<a data-cite="${A}" href="#src-${A}" aria-label="[7]">[1]</a>`,
      `<a data-cite="${A}" href="#src-${A}" aria-description="(1)">[1]</a>`,
      `<span data-cite="${A}" aria-label="[3]"></span>`,
      `<span data-cite="${A}" aria-label="100" title="100"></span>`,
      `<a data-cite="${A}" href="#src-${A}" aria-braillelabel="Price 3">[1]</a>`,
      `<a data-cite="${A}" href="#src-${A}" title="Source">[1]</a>`,
    ])
      assert.deepEqual(swap(bad), ['citation_marker'], bad)
  })
  it('accepts a citation mark or name in any text-bearing attribute of the marker or its link', () => {
    for (const ok of [
      `<a data-cite="${A}" href="#src-${A}" aria-description="Source 1" aria-braillelabel="[1]">[1]</a>`,
      `<sup data-cite="${A}" aria-roledescription="" aria-label="Fuente 1"><a href="#src-${A}" title="Source [1]">[1]</a></sup>`,
      `<sup data-cite="${A}"><a href="#src-${A}" aria-description="Fonte 1" aria-braillelabel="(1)">(1)</a></sup>`,
      `<sup data-cite="${A}" title=" [ 1 ] " aria-label="">[1]</sup>`,
      `<a data-cite="${A}" href="#src-${A}" aria-label="†">†</a>`,
      `<sup data-cite="${A}" aria-label="[1]">[<a href="#src-${A}" title="[1]">1</a>]</sup>`,
    ])
      assert.deepEqual(swap(ok), [], ok)
  })
  // #117: a number on a marker is its source's place in the report's frozen citation order (A first, B second), so a
  // marker cannot attribute a claim to another source, or to none.
  it("refuses a number, shown or announced, other than its source's place in the report's citation order", () => {
    for (const bad of [
      `<a data-cite="${A}" href="#src-${A}">[2]</a>`,
      `<sup data-cite="${A}"><a href="#src-${A}">(12)</a></sup>`,
      `<sup data-cite="${A}">[<a href="#src-${A}">2</a>]</sup>`,
      `<a data-cite="${A}" href="#src-${A}" aria-label="Source 3">[1]</a>`,
      `<a data-cite="${A}" href="#src-${A}" title="Fonte 4">[1]</a>`,
      `<span data-cite="${A}" aria-label="Source 2"></span>`,
      `<sup data-cite="${A}" aria-label="[1]"><a href="#src-${A}" title="Source [2]">[1]</a></sup>`,
      `<a data-cite="${A}" href="#src-${A}">[01]</a>`,
    ])
      assert.deepEqual(swap(bad), ['citation_marker'], bad)
    const page = html(good)
    const second = `<a data-cite="${B}" href="#src-${B}">[2]</a>`
    assert.ok(page.includes(second))
    assert.deepEqual(codes(withHtml(good, page.replace(second, second.replace('[2]', '[1]')))), ['citation_marker'])
    // A source cited twice is numbered alike each time.
    const last = page.lastIndexOf(marker)
    assert.notEqual(last, page.indexOf(marker), 'the fixture cites A twice')
    const repeat = `${page.slice(0, last)}${marker.replace('[1]', '[2]')}${page.slice(last + marker.length)}`
    assert.deepEqual(codes(withHtml(good, repeat)), ['citation_marker'])
  })
  it('accepts a marker numbered by the report wherever the page lists its sources, and one that numbers nothing', () => {
    const page = html(good)
    const reordered = page.replace(`${entry(A)}\n${entry(B)}`, `${entry(B)}\n${entry(A)}`)
    assert.notEqual(reordered, page, 'the fixture lists A, then B')
    assert.deepEqual(codes(withHtml(good, reordered)), [], 'B listed first, the markers still follow the report')
    const second = `<a data-cite="${B}" href="#src-${B}">[2]</a>`
    const byList = reordered
      .replaceAll(marker, marker.replace('[1]', '[2]'))
      .replace(second, second.replace('[2]', '[1]'))
    assert.deepEqual([...new Set(codes(withHtml(good, byList)))], ['citation_marker'], 'numbered by the list instead')
    for (const ok of [
      `<sup data-cite="${A}">†</sup>`,
      `<span data-cite="${A}" aria-label=""></span>`,
      `<a data-cite="${A}" href="#src-${A}" aria-label="[*]">[*]</a>`,
    ])
      assert.deepEqual(swap(ok), [], ok)
  })
})

describe('outside its blocks a page adds only the words that frame them (SDD-01-CX-0019 F2, CX-0022)', () => {
  const add = (from: string, to: string): string[] => {
    const page = html(good).replace(from, to)
    assert.notEqual(page, html(good), `fixture contains ${from}`)
    return codes(withHtml(good, page))
  }
  it('refuses a claim in a paragraph, a list item, a cell or the page footer', () => {
    assert.deepEqual(add('</main>', '<p>Host three is free and fully isolated.</p></main>'), ['text_outside_blocks'])
    assert.deepEqual(add('</main>', '<ul><li>Host three wins.</li></ul></main>'), ['text_outside_blocks'])
    assert.deepEqual(add('</main>', '<table><tr><td>Host three: free</td></tr></table></main>'), [
      'text_outside_blocks',
    ])
    assert.deepEqual(add('</main>', '</main><footer>Independently verified.</footer>'), ['text_outside_blocks'])
    assert.deepEqual(add('<main>', '<main>Best host: three.'), ['text_outside_blocks'])
  })
  it('judges each text where it sits: a label around a paragraph does not let the paragraph pass', () => {
    assert.deepEqual(add('</main>', '<figure><figcaption><p>Host three is free.</p></figcaption></figure></main>'), [
      'text_outside_blocks',
    ])
    assert.deepEqual(add('<main>', '<main><nav><p>Host three is free.</p><a href="#s1">Findings</a></nav>'), [
      'text_outside_blocks',
    ])
    assert.deepEqual(add('<main>', '<main><nav><ul><li>Host three is free</li></ul></nav>'), ['text_outside_blocks'])
    assert.deepEqual(add('<main>', '<main><nav><a href="https://example.com">Host three is free</a></nav>'), [
      'text_outside_blocks',
    ])
  })
  it('refuses letter-shaped symbols and marks that change a number, alone or in a row (#117)', () => {
    for (const marks of [
      '<div><span>ⒽⓄ</span><span>ⓈⓉ</span> <span>ⒻⓇ</span><span>ⒺⒺ</span></div>',
      '<p>🄷</p>',
      '<p>ℍ</p>',
      '<p>✓</p>',
      '<p>%</p>',
      '<p>+</p>',
      '<p>$</p>',
    ])
      assert.deepEqual(add('</main>', `${marks}</main>`), ['text_outside_blocks'], marks)
  })
  it('accepts the marks that say nothing, side by side', () => {
    for (const marks of [
      '<p>·</p>',
      '<p>• — →</p>',
      '<div><span>|</span><span>/</span><span>…</span></div>',
      '<p>§ ¶</p>',
    ])
      assert.deepEqual(add('</main>', `${marks}</main>`), [], marks)
  })
  it('accepts headings, captions, a summary, table headers, in-page navigation, separators and source entries', () => {
    const cases: [string, string][] = [
      ['<main>', '<main><nav aria-label="Contents"><ul><li><a href="#s1"><span>1.</span> Findings</a></li></ul></nav>'],
      ['<main>', '<main><nav><a href="#s1">Findings</a> · <a href="#sources">Sources</a></nav>'],
      ['</main>', '<figure><figcaption>Costs per month, <em>in USD</em></figcaption></figure></main>'],
      ['</main>', '<details><summary>How the hosts were read</summary></details></main>'],
      ['</main>', '<table><thead><tr><th scope="col">Host</th></tr></thead></table></main>'],
      ['<h1>Report</h1>', '<header><h1>Report</h1><h2>Three hosts, <small>compared</small></h2></header>'],
      [
        `data-source="${A}">Source ${A}`,
        `data-source="${A}">Vendor notes, <a href="https://example.com/notes">example.com</a> (2026)`,
      ],
    ]
    for (const [from, to] of cases) assert.deepEqual(add(from, to), [], to)
  })
})

describe('a tooltip or an accessible name carries no text the page does not show (SDD-01-CX-0019 F2, #117 review)', () => {
  const swap = (from: string, to: string): string[] => {
    const page = html(good).replace(from, to)
    assert.notEqual(page, html(good), `fixture contains ${from}`)
    return codes(withHtml(good, page))
  }
  it('refuses a claim in a title or a text-bearing aria attribute, inside or outside the blocks', () => {
    const refused: Array<[string, string]> = [
      ['</main>', '<span title="Host three is free">•</span></main>'],
      ['<main>', '<main aria-label="Host three is the cheapest">'],
      ['<p data-block="b1">', '<p data-block="b1" title="Verified by NIST">'],
      ['<h1>', '<h1 aria-description="The only safe host">'],
      ['<main>', '<main><nav aria-roledescription="independently audited"><a href="#s1">Findings</a></nav>'],
      ['</main>', '<table><tr><th scope="col" abbr="Host three is free">Host</th></tr></table></main>'],
      // #117: words of its own header can say the opposite of it, and a screen reader may read the abbreviation.
      ['</main>', '<table><tr><th scope="col" abbr="free">Not free</th></tr></table></main>'],
      ['</main>', '<table><tr><th scope="col" abbr="Cost">Cost per month, in USD</th></tr></table></main>'],
      ['</main>', '<table><tr><th scope="col" abbr="three free">Host three is not free</th></tr></table></main>'],
      ['<p data-block="b1">', '<p data-block="b1" aria-keyshortcuts="Host three is free">'],
      ['</main>', '<table><tr aria-rowindextext="Host three is free"><th>Host</th></tr></table></main>'],
    ]
    for (const [from, to] of refused) assert.deepEqual(swap(from, to), ['attribute_text'], to)
  })
  it('accepts a name that repeats a visible label, a plain name, or one that points at visible text', () => {
    const accepted: Array<[string, string]> = [
      ['<main>', '<main aria-label="Report">'],
      [
        '<section id="sources" data-section="sources">',
        '<section id="sources" data-section="sources" aria-label="Sources">',
      ],
      ['<main>', '<main><nav aria-label="Contents"><a href="#s1" title="Findings">Findings</a></nav>'],
      ['<main>', '<main><nav aria-label="Indice 2"><a href="#s1">Findings</a></nav>'],
      ['<main>\n<h1>', '<main aria-labelledby="t">\n<h1 id="t">'],
      ['</main>', '<table><tr><th scope="col" abbr="Cost per month">Cost per month</th></tr></table></main>'],
    ]
    for (const [from, to] of accepted) assert.deepEqual(swap(from, to), [], to)
  })
  // #117: a word outside the list of words for parts of the page, in any script, can carry a claim.
  it('refuses a plain name that is not a word for a part of the page, and any plain title or description', () => {
    const sentence = '三号主机是免费的'
    const refused: Array<[string, string]> = [
      ['<title>Report</title>', `<title>${sentence}</title>`],
      ['<title>Report</title>', '<title>Cheapest</title>'],
      ['<title>Report</title>', '<title>Report</title><meta name="description" content="Contents">'],
      ['</main>', `<span title="${sentence}">•</span></main>`],
      ['</main>', '<span title="Cheapest">•</span></main>'],
      ['<main>', '<main><nav aria-label="Recommended"><a href="#s1">Findings</a></nav>'],
      ['<main>', `<main><nav aria-label="Table 3${sentence}"><a href="#s1">Findings</a></nav>`],
      ['</main>', '<table><tr><th scope="col" abbr="Free">Cost per month</th></tr></table></main>'],
    ]
    for (const [from, to] of refused) assert.deepEqual(swap(from, to), ['attribute_text'], to)
    for (const name of [`免费 3`, 'Cheapest 1']) {
      const to = `<a data-cite="${A}" href="#src-${A}" aria-label="${name}">[1]</a>`
      assert.ok(
        codes(withHtml(good, html(good).replace(/<a data-cite="[^"]+" href="[^"]+">\[1\]<\/a>/u, to))).includes(
          'citation_marker',
        ),
        name,
      )
    }
  })
  it('refuses an ARIA value, count, position or level, an unknown ARIA attribute, and a state given free text (#117)', () => {
    const numeric = [
      'aria-valuenow="0"',
      'aria-valuemin="0"',
      'aria-valuemax="100"',
      'aria-rowcount="3"',
      'aria-colcount="3"',
      'aria-rowindex="2"',
      'aria-colindex="2"',
      'aria-rowspan="2"',
      'aria-colspan="2"',
      'aria-posinset="1"',
      'aria-setsize="9"',
      'aria-level="2"',
      'aria-cost="free"',
      'aria-current="Host three is free"',
      'aria-sort="cheapest first"',
    ]
    for (const attribute of numeric) {
      const to = `<main><span role="img" aria-labelledby="t" ${attribute}></span>\n<h1 id="t">`
      assert.deepEqual(swap('<main>\n<h1>', to), ['unsafe_attribute'], attribute)
    }
  })
  it('accepts the one ARIA state that takes decoration away, aria-hidden, outside the research', () => {
    for (const attribute of ['aria-hidden="true"', 'aria-hidden="false"']) {
      const to = `<main><nav ${attribute}><a href="#s1">Findings</a></nav>`
      assert.deepEqual(swap('<main>', to), [], attribute)
    }
  })
  // #117: a state is announced as a fact of its own, a box "checked" beside a heading, where no capture shows it.
  it('refuses every other ARIA state, in any of its tokens', () => {
    for (const attribute of [
      'aria-checked="true"',
      'aria-checked="false"',
      'aria-pressed="true"',
      'aria-selected="true"',
      'aria-expanded="false"',
      'aria-current="page"',
      'aria-sort="ascending"',
      'aria-invalid="true"',
      'aria-required="true"',
      'aria-disabled="true"',
      'aria-readonly="true"',
      'aria-busy="true"',
      'aria-live="polite"',
      'aria-relevant="additions text"',
      'aria-atomic="true"',
      'aria-haspopup="true"',
      'aria-modal="true"',
      'aria-orientation="vertical"',
      'aria-autocomplete="list"',
      'aria-multiline="true"',
      'aria-multiselectable="true"',
    ]) {
      const to = `<main><span role="img" aria-labelledby="t" ${attribute}></span>\n<h1 id="t">`
      assert.deepEqual(swap('<main>\n<h1>', to), ['unsafe_attribute'], attribute)
    }
  })
  it("refuses a widget's role, which announces a state or a value of its own, and accepts a document's parts", () => {
    for (const role of [
      'checkbox',
      'switch',
      'radio',
      'slider',
      'progressbar',
      'meter',
      'status',
      'alert',
      'tooltip',
      'button',
      'link',
      'tab',
      'option',
      'heading',
      'separator',
      'deletion',
      'insertion',
      'img checkbox',
      'CHECKBOX',
      '',
    ]) {
      const to = `<main><span role="${role}" aria-labelledby="t"></span>\n<h1 id="t">`
      assert.deepEqual(swap('<main>\n<h1>', to), ['unsafe_attribute'], role)
    }
    for (const role of ['img', 'presentation', 'none', 'group', 'note', 'doc-noteref', 'IMG', 'img presentation']) {
      const to = `<main><span role="${role}" aria-labelledby="t"></span>\n<h1 id="t">`
      assert.deepEqual(swap('<main>\n<h1>', to), [], role)
    }
    const region = '<main><nav role="navigation" aria-label="Contents"><a href="#s1">Findings</a></nav>'
    assert.deepEqual(swap('<main>', region), [], 'a landmark')
  })
  it('accepts a word for a part of the page in a few languages, with a number or a short id', () => {
    for (const name of ['Contents', 'Table b5', 'Indice 2', 'Tabelle 3', 'Sommaire', 'Índice']) {
      const to = `<main><nav aria-label="${name}"><a href="#s1">Findings</a></nav>`
      assert.deepEqual(swap('<main>', to), [], name)
    }
  })
  // #117, CX-0037: a label its markup hides proves nothing, and an ID reference names only what a reader can check.
  const claim = 'Host three is free'
  const references = [
    'aria-labelledby',
    'aria-describedby',
    'aria-details',
    'aria-errormessage',
    'aria-activedescendant',
    'aria-controls',
    'aria-flowto',
    'aria-owns',
  ]
  it('holds the document title and description to what the page shows (#117)', () => {
    const title = 'Where a confined renderer can run'
    for (const [from, to] of [
      ['<title>Report</title>', `<title>${claim}</title>`],
      ['<title>Report</title>', `<title>Report</title><meta name="description" content="${claim}">`],
      ['<title>Report</title>', `<title>${claim}</title><h2 hidden>${claim}</h2>`],
    ] as const)
      assert.ok(swap(from, to).includes('attribute_text'), to)
    const page = html(good)
      .replace('<title>Report</title>', `<title>${title}</title><meta name="description" content="${title}">`)
      .replace('<h1>Report</h1>', `<h1>${title}</h1>`)
    assert.deepEqual(codes(withHtml(good, page)), [], 'a title and description repeating the heading')
    assert.match(compile(withHtml(good, page), 'en'), /<h1 data-sophia-shown="h1:1">/)
  })
  // #117: aria-hidden changes no pixel, so research it takes from a screen reader is in every capture and in no reading.
  it('refuses aria-hidden on research, on what holds it and on what is inside it', () => {
    for (const [from, to] of [
      ['<p data-block="b1">', '<p data-block="b1" aria-hidden="true">'],
      ['<section id="s1" data-section="s1">', '<section id="s1" data-section="s1" aria-hidden="true">'],
      ['<main>', '<main aria-hidden="TRUE">'],
      [`<a data-cite="${A}"`, `<a aria-hidden="true" data-cite="${A}"`],
      [`<li id="src-${A}"`, `<li aria-hidden="true" id="src-${A}"`],
    ] as const)
      assert.ok(codes(withHtml(good, html(good).replace(from, to))).includes('research_hidden'), to)
    for (const [from, to] of [
      ['<main>', '<main aria-hidden="false">'],
      ['<main>', '<main><nav aria-hidden="true"><a href="#s1">Findings</a></nav>'],
    ] as const)
      assert.deepEqual(codes(withHtml(good, html(good).replace(from, to))), [], to)
  })
  // #117: the compile marks the labels the render measures; a page that marks its own could multiply what it reads.
  it('refuses a data-sophia-* attribute the page writes itself', () => {
    for (const to of ['<h1 data-sophia-shown="h1:1">', '<h1 data-sophia-other="x">', '<h1 DATA-SOPHIA-SHOWN="h1:1">'])
      assert.deepEqual(codes(withHtml(good, html(good).replace('<h1>', to))), ['unsafe_attribute'], to)
    assert.deepEqual(codes(withHtml(good, html(good).replace('<h1>', '<h1 data-sophiax="1">'))), [])
  })
  // #117: role="img" changes no pixel either, and gives what it holds as one image: its text is not read.
  it('refuses role="img" on research, on what holds it and on what is inside it', () => {
    for (const [from, to] of [
      ['<p data-block="b1">', '<p data-block="b1" role="img">'],
      ['<section id="s1" data-section="s1">', '<section id="s1" data-section="s1" role="img">'],
      ['<main>', '<main role="IMG">'],
      ['<main>', '<main role="none img">'],
      [`<li id="src-${A}"`, `<li role="img" id="src-${A}"`],
      ['needs a dedicated VM', 'needs a <span role="img">dedicated VM</span>'],
      [`<a data-cite="${A}"`, `<a role="img" data-cite="${A}"`],
    ] as const)
      assert.ok(codes(withHtml(good, html(good).replace(from, to))).includes('research_hidden'), to)
    const beside = html(good).replace('</main>', '<span role="img" aria-labelledby="sources-h"></span></main>')
    assert.deepEqual(codes(withHtml(good, beside.replace('<h2>Sources</h2>', '<h2 id="sources-h">Sources</h2>'))), [])
  })
  it('refuses a name repeating a label its markup hides, or one under a hidden ancestor', () => {
    for (const hidden of [
      `<h2 hidden>${claim}</h2>`,
      `<h2 aria-hidden="true">${claim}</h2>`,
      `<div hidden><h2>${claim}</h2></div>`,
    ]) {
      const to = `${hidden}<span title="${claim}">•</span></main>`
      assert.deepEqual(swap('</main>', to), ['attribute_text'], to)
    }
  })
  it('refuses every ID reference to a hidden label, to free text, or to nothing', () => {
    for (const name of references) {
      const to = `<main ${name}="claim">\n<h2 id="claim" hidden>${claim}</h2><h1>`
      assert.deepEqual(swap('<main>\n<h1>', to), ['attribute_text'], to)
    }
    assert.deepEqual(
      swap('<main>\n<h1>', `<main aria-describedby="claim">\n<h2 id="claim" aria-hidden="true">${claim}</h2><h1>`),
      ['attribute_text'],
    )
    assert.deepEqual(swap('<main>\n<h1>', '<main aria-describedby="nowhere">\n<h1>'), ['attribute_text'])
    const free = swap('<main>\n<h1>', `<main aria-describedby="claim">\n<p id="claim">${claim}</p><h1>`)
    assert.deepEqual(free.toSorted(), ['attribute_text', 'text_outside_blocks'])
  })
  // #117: a reference to part of a block or a label reads it apart from the rest: "free" out of "Not free".
  it('refuses an ID reference to part of a block or of a label, and accepts one to the whole', () => {
    const named = (from: string, to: string, id: string) =>
      codes(withHtml(good, html(good).replace(from, to).replace('<main>', `<main aria-labelledby="${id}">`)))
    for (const [from, to, id] of [
      ['needs a dedicated VM', 'needs a <span id="vm">dedicated VM</span>', 'vm'],
      ['<h1>Report</h1>', '<h1>Re<span id="frag">port</span></h1>', 'frag'],
      ['<h2>Sources</h2>', '<h2>Sour<b><i id="deep">ces</i></b></h2>', 'deep'],
      [`data-source="${A}">Source ${A}`, `data-source="${A}">Source <span id="src-name">${A}</span>`, 'src-name'],
    ] as const)
      assert.deepEqual(named(from, to, id), ['attribute_text'], to)
    assert.deepEqual(named('<h1>Report</h1>', '<h1 id="whole">Report</h1>', 'whole'), [])
    assert.deepEqual(named('<h2>Sources</h2>', '<div id="around"><h2>Sources</h2></div>', 'around'), [])
    // A whole block is named whole, even set inside a label.
    const page = html(good)
    const start = page.indexOf('<p data-block="b1">')
    const end = page.indexOf('</p>', start) + '</p>'.length
    const captioned = `${page.slice(0, start)}<figure><figcaption>${page.slice(start, end)}</figcaption></figure>${page.slice(end)}`
    assert.deepEqual(named('<p data-block="b1">', '<p data-block="b1" id="b1">', 'b1'), [])
    assert.deepEqual(
      codes(
        withHtml(
          good,
          captioned
            .replace('<p data-block="b1">', '<p data-block="b1" id="b1">')
            .replace('<main>', '<main aria-labelledby="b1">'),
        ),
      ),
      [],
    )
  })
  it('refuses a citation marker reference to anything but its own source entry', () => {
    const marker = `<a data-cite="${A}" href="#src-${A}">[1]</a>`
    for (const to of [
      `<a data-cite="${A}" href="#src-${A}" aria-describedby="src-${B}">[1]</a>`,
      `<sup data-cite="${A}"><a href="#src-${A}" aria-labelledby="claim">[1]</a></sup>`,
    ]) {
      const page = html(good)
        .replace(marker, to)
        .replace('<main>\n<h1>', `<main>\n<h2 id="claim" hidden>${claim}</h2><h1>`)
      assert.ok(codes(withHtml(good, page)).includes('citation_marker'), to)
    }
    const own = html(good).replace(marker, `<a data-cite="${A}" href="#src-${A}" aria-describedby="src-${A}">[1]</a>`)
    assert.deepEqual(codes(withHtml(good, own)), [])
  })
  it('accepts names and references resting on labels the page shows, and the render then measures those labels', () => {
    const accepted: Array<[string, string]> = [
      ['</main>', `<h2>${claim}</h2><span title="${claim}">•</span></main>`],
      ['<main>\n<h1>', '<main aria-labelledby="t">\n<h1 id="t">'],
      ['<main>\n<h1>', '<main aria-describedby="wrap">\n<div id="wrap"></div><h1>'],
      ['</main>', '<table><tr><th id="h-cost">Cost per month</th><td headers="h-cost">•</td></tr></table></main>'],
    ]
    for (const [from, to] of accepted) assert.deepEqual(swap(from, to), [], to)
    // A reference to the research itself: a block, whose visibility the render measures already.
    const toBlock = html(good)
      .replace('<p data-block="b1">', '<p data-block="b1" id="b1">')
      .replace('<main>', '<main aria-describedby="b1">')
    assert.deepEqual(codes(withHtml(good, toBlock)), [])
    const page = (from: string, to: string) => withHtml(good, html(good).replace(from, to))
    const marked = compile(page('<main>\n<h1>', '<main aria-labelledby="t">\n<h1 id="t">'), 'en')
    assert.match(marked, /<h1 id="t" data-sophia-shown="h1#t">/)
    assert.match(
      compile(page('</main>', `<h2>${claim}</h2><span title="${claim}">•</span></main>`), 'en'),
      new RegExp(`<h2 data-sophia-shown="h2:\\d+">${claim}</h2>`),
    )
    assert.deepEqual(
      compile(good, 'en').match(/data-sophia-shown="[^"]*"/g),
      ['data-sophia-shown="h1:1"'],
      'the plain page marks only the heading its title repeats',
    )
  })
})

describe('generated content draws decoration only (SDD-01-CX-0019 F2)', () => {
  const css = (rule: string): string[] => codes(withCss(good, `${rule}\n`))
  it('refuses text drawn by CSS, from a string, an attribute or a variable', () => {
    for (const bad of [
      '[data-block]::after{content:" (verified by NIST)"}',
      'p::before{content:attr(title)}',
      ':root{--claim:"cheapest"} p::after{content:var(--claim)}',
      'ul{list-style:"Best: " inside}',
      'q{quotes:"Said" "end"}',
      'p{text-overflow:"read more"}',
    ])
      assert.deepEqual(css(bad), ['css_unsafe'], bad)
    assert.deepEqual(
      codes(
        withHtml(
          good,
          html(good).replace('<h1>', '<h1 style="--x:1">').replace('<main>', '<main style="content:\'cheap\'">'),
        ),
      ),
      ['css_unsafe'],
    )
  })
  it('refuses letter-shaped symbols, marks that change a number, and strings that spell together (#117)', () => {
    for (const bad of [
      '[data-block]::after{content:"ⒽⓄ" "ⓈⓉ" " " "ⒻⓇ" "ⒺⒺ"}',
      '[data-block]::after{content:"Ⓗ" "Ⓞ"}',
      'p::before{content:"🄷"}',
      'p::before{content:"ℍ"}',
      'p::before{content:"\\24BD"}',
      '[data-block]::after{content:"%"}',
      '[data-block]::after{content:"✗"}',
      'p::before{content:"•" "•" "•" "•" "•" "•" "•"}',
      'q{quotes:"Ⓢ" "Ⓘ"}',
    ])
      assert.deepEqual(css(bad), ['css_unsafe'], bad)
  })
  it('accepts decoration that draws no text: keywords, quote keywords, an empty box', () => {
    for (const ok of [
      'p::after{content:none}',
      'p::before{content:normal}',
      'blockquote::before{content:open-quote}',
      'blockquote::after{content:close-quote}',
      'q{quotes:auto}',
      'q{quotes:none}',
      'h2::after{content:"";display:block;height:2px;background:#1a4fd6}',
      'li::marker{color:#999}',
    ])
      assert.deepEqual(css(ok), [], ok)
  })
  // #117: a mark drawn beside a block's text reads as part of it: "-" before "10%" makes it "-10%".
  it('refuses generated text of any kind, a mark included, in any property, medium or style attribute', () => {
    for (const bad of [
      '[data-block]::before{content:"-"}',
      '[data-block]::before{content:"\\2212"}',
      '[data-block]::before{content:"("}',
      'p::after{content:")"}',
      'li::before{content:"•"}',
      'a::after{content:" →"}',
      'nav a+a::before{content:" · "}',
      'li::marker{content:"§ "}',
      'q{quotes:"“" "”"}',
      'q{quotes:"-" "-"}',
      'ul{list-style-type:"→"}',
      'ul{list-style:"-" inside}',
      'p{hyphens:manual;hyphenate-character:"‐"}',
      'p{text-overflow:"…"}',
      'p{text-emphasis-style:"-"}',
      '@media (min-width: 600px){[data-block]::before{content:"-"}}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<p data-block="b1">', '<p data-block="b1" style="list-style:\'-\' inside">')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
  })
  // #117, CX-0038: a counter or a list marker spells words in any letter, numeral or custom style, in any medium.
  it('refuses a counter or a list marker that can spell, in print as on screen, in a stylesheet or a style attribute', () => {
    for (const bad of [
      '@media print{.s::after{content:counter(h,lower-alpha) counter(o,lower-alpha)}}',
      'h2::before{content:counter(h,upper-roman)}',
      'h2::before{content:counters(h,".",lower-greek)}',
      'h2::before{content:counter(h,cjk-ideographic)}',
      'h2::before{content:counter(h,my-letters)}',
      'h2::before{content:counter(h,symbols(cyclic "h" "o"))}',
      'ol{list-style-type:lower-alpha}',
      'ol{list-style:upper-latin inside}',
      '@media print{ol{list-style:lower-roman}}',
      'p{hyphens:manual;hyphenate-character:"host three"}',
      'p{text-emphasis-style:"h"}',
      'p{-webkit-text-security:disc}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<main>', '<main><ul style="list-style-type:lower-latin"><li></li></ul>')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
  })
  // #117: a counter's number is content no block holds, in any style, and so is a list marker's.
  it('refuses a generated number, and anything that chooses a list number', () => {
    for (const bad of [
      '.price::after{content:" " counter(n)}',
      'h2::before{content:counter(h)}',
      'h2::before{content:counter(h,decimal) ". "}',
      'h2::before{content:counters(h,".",decimal-leading-zero)}',
      'ol{counter-reset:list-item 999}',
      'li{counter-set:list-item 5}',
      'li{counter-increment:list-item 10}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const valued = html(good).replace('<main>', '<main><ul><li value="5"></li></ul>')
    assert.deepEqual(codes(withHtml(good, valued)), ['unsafe_attribute'])
  })
  // #117: an item's number is its place among the items the page writes: 99 empty items, hidden, make the next 100.
  it('refuses an ordered list in any form, and a list marker that draws a number', () => {
    for (const list of [
      `<ol>${'<li></li>'.repeat(99)}<li>•</li></ol>`,
      '<ol><li></li></ol>',
      '<ol type="1" reversed><li></li></ol>',
      '<ol start="3"><li></li></ol>',
      '<ol type="a"><li></li></ol>',
    ]) {
      const page = html(good).replace('<main>', `<main>${list}`)
      assert.deepEqual(codes(withHtml(good, page)), ['unsafe_element'], list)
    }
    for (const bad of [
      'ul{list-style-type:decimal}',
      'ul{list-style:decimal inside}',
      'li{list-style-type:decimal-leading-zero}',
      '@media print{ul{list-style-type:decimal}}',
      'details>summary{list-style:decimal}',
      'p{display:list-item;list-style-type:decimal}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<main>', '<main><ul style="list-style-type:decimal"><li></li></ul>')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
  })
  it('accepts bullets: list markers and marks that spell nothing', () => {
    for (const ok of [
      '@media (min-width: 720px){ul{list-style:square inside}}',
      'details>summary{list-style-type:disclosure-closed}',
      'ul{list-style:none}',
      'p{text-emphasis-style:filled circle}',
      'p{hyphens:manual;hyphenate-character:auto}',
    ])
      assert.deepEqual(css(ok), [], ok)
    const bulleted = html(good).replace('<main>', '<main><ul><li>•</li></ul><menu><li></li></menu>')
    assert.deepEqual(codes(withHtml(good, bulleted)), [])
  })
})

describe('a pseudo-element styles only generated content (#117)', () => {
  const css = (rule: string): string[] => codes(withCss(good, `${rule}\n`))
  it('refuses a pseudo-element that styles part of a text apart from its element, in any form or medium', () => {
    for (const bad of [
      'h2::first-line{color:transparent}',
      'h2::first-line{font-size:0}',
      'p::first-letter{color:#fafafa}',
      'h2:first-line{color:transparent}',
      'h2:FIRST-LETTER{font-size:0}',
      'H2::First-Line{opacity:0}',
      '@media print{h2::first-line{color:transparent}}',
      'details::details-content{opacity:0}',
      'p::target-text{color:transparent}',
      'h2::-webkit-scrollbar{width:0}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
  })
  // #117: a mask draws a text transparent while the box, colour and opacity the render measures stay whole.
  it('refuses a mask in every form, in any medium and in a style attribute', () => {
    for (const bad of [
      'h2{mask-image:linear-gradient(transparent,transparent)}',
      'h2{-webkit-mask-image:linear-gradient(transparent,transparent)}',
      'h2{mask:linear-gradient(transparent,transparent)}',
      'h2{-webkit-mask:linear-gradient(transparent,transparent)}',
      'h2{mask-size:0}',
      'h2{mask-mode:luminance}',
      'h2{-webkit-mask-box-image:linear-gradient(transparent,transparent)}',
      'h2{MASK-IMAGE:linear-gradient(transparent,transparent)}',
      '@media print{h2{mask-image:linear-gradient(transparent,transparent)}}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace(
      '<main>',
      '<main><div style="-webkit-mask-image:linear-gradient(transparent,transparent)"></div>',
    )
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
    for (const ok of ['h2{border-radius:4px}', '.marker{background:linear-gradient(#eef,#fff)}'])
      assert.deepEqual(css(ok), [], ok)
  })
  // #117: a stroke in the background's colour buries a text whose fill, which the render reads, stays readable.
  it('refuses a text stroke in every form, in any medium and in a style attribute', () => {
    for (const bad of [
      'h2{-webkit-text-stroke:12px #fff}',
      'h2{-webkit-text-stroke-width:12px}',
      'h2{-webkit-text-stroke-color:#fff}',
      'h2{text-stroke:12px #fff}',
      'h2{-WEBKIT-TEXT-STROKE:12px #fff}',
      '@media (min-width: 600px){h2{-webkit-text-stroke:12px #fff}}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<h1>', '<h1 style="-webkit-text-stroke:12px #fff">')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
    for (const ok of ['h2{text-shadow:0 1px 2px #ccc}', 'h2{-webkit-text-fill-color:#111}'])
      assert.deepEqual(css(ok), [], ok)
  })
  // #117: the render finds a cover by what a point on the text reaches; pointer-events: none would hide one from it.
  it('refuses pointer-events, which only a page with a pointer behaviour needs, in a stylesheet or a style attribute', () => {
    for (const bad of ['.cover{pointer-events:none}', 'h2::after{pointer-events:none}', '*{pointer-events:auto}'])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<main>', '<main><div style="pointer-events:none"></div>')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
  })
  // #117: a pinned element moves over the text as a reader scrolls; the captures show it only where the page starts.
  it('refuses fixed and sticky positions, in every spelling, in any medium and in a style attribute', () => {
    for (const bad of [
      'header{position:fixed}',
      'nav{position:sticky}',
      'nav{position:-webkit-sticky}',
      'nav{POSITION:FIXED}',
      'nav{position:fixed!important}',
      'nav{position:var(--pin)}',
      '@media print{nav{position:sticky}}',
      '@supports (position:sticky){nav{position:sticky}}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<main>', '<main><div style="position:fixed;top:0"></div>')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
    for (const ok of [
      'h2{position:relative}',
      'h2::after{position:absolute;inset:auto 0 0}',
      'p{position:static}',
      'p{position:inherit}',
      'p{position:revert-layer}',
      ':root{--pin:fixed}',
    ])
      assert.deepEqual(css(ok), [], ok)
  })
  // #117: the captures are taken on a screen at two widths in the light scheme; a rule for anything else is unseen.
  it('refuses media and container queries for what no capture shows, and a dark colour scheme', () => {
    for (const bad of [
      '@media print{[data-block]{display:none}}',
      '@MEDIA PRINT{[data-block]{display:none}}',
      '@media screen, print{p{display:none}}',
      '@media not screen{p{display:none}}',
      '@media (prefers-color-scheme: dark){p{color:#111}}',
      '@media (prefers-reduced-motion: no-preference){p{opacity:0}}',
      '@media (forced-colors: active){p{color:#eee}}',
      '@media (hover: hover){p{display:none}}',
      '@media (orientation: portrait){p{display:none}}',
      '@media (min-height: 900px){p{display:none}}',
      '@media (height > 900px){p{display:none}}',
      '@media (min-width: 720px) and (hover){p{display:none}}',
      '@container (height > 3px){p{display:none}}',
      'p{color:light-dark(#222,#eee)}',
      ':root{color-scheme:light dark}',
      ':root{color-scheme:dark}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    assert.ok(css('@media foo(bar){p{display:none}}').includes('css_unsafe'), 'a condition of its own')
    const inline = html(good).replace('<main>', '<main><div style="color-scheme:dark"></div>')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
    const meta = html(good).replace('</head>', '<meta name="color-scheme" content="light dark"></head>')
    assert.deepEqual(codes(withHtml(good, meta)), ['unsafe_attribute'])
    for (const ok of [
      '@media (max-width: 600px){body{font-size:17px}}',
      '@media screen and (min-width: 720px){main{display:grid}}',
      '@media only screen and (width >= 720px){main{display:grid}}',
      '@media (400px <= width <= 1000px){main{gap:2rem}}',
      '@media not (min-width: 720px){main{gap:1rem}}',
      ':root{color-scheme:light}',
      ':root{color-scheme:only light}',
    ])
      assert.deepEqual(css(ok), [], ok)
  })
  // #117, CX-0039: the render measures both ends of every band of window widths a page's breakpoints make, so a width
  // is one it can bound: in pixels, between 320 and 2560px, eight breakpoints at most across the page's stylesheets.
  it('refuses a width the render cannot bound, a container query, and more breakpoints than it measures', () => {
    for (const bad of [
      '@media (min-width: 40em){p{color:#111}}',
      '@media (min-width: 400em){p{color:#111}}',
      '@media (max-width: 2.5rem){p{color:#111}}',
      '@media (width >= 50vw){p{color:#111}}',
      '@media (min-width: 200px){p{color:#111}}',
      '@media (min-width: 3000px){p{color:#111}}',
      '@media (min-width: calc(600px + 1em)){p{color:#111}}',
      '@media (min-width: 0){p{color:#111}}',
      '@container (inline-size > 30em){p{columns:2}}',
      '@container (min-width: 400px){p{color:#111}}',
      '@CONTAINER card (min-width: 400px){p{color:#111}}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    for (const ok of [
      '@media (min-width: 320px){p{color:#111}}',
      '@media (max-width: 2560px){p{color:#111}}',
      '@media (max-width: 999.5px){p{color:#111}}',
      '@media (700PX <= width <= 900px){p{color:#111}}',
    ])
      assert.deepEqual(css(ok), [], ok)
    const head = (rules: string) => html(good).replace('</head>', `<style>${rules}</style></head>`)
    assert.deepEqual(
      codes(withCss(withHtml(good, head(mediaSheet(400, 4))), mediaSheet(800, 4))),
      [],
      'eight in two stylesheets',
    )
    assert.deepEqual(
      codes(withCss(withHtml(good, head(mediaSheet(400, 4))), mediaSheet(800, 5))),
      ['css_unsafe'],
      'nine',
    )
    assert.deepEqual(codes(withCss(good, `${mediaSheet(400, 8)}\n${mediaSheet(400, 8)}`)), [], 'the same eight twice')
  })
  // #117: the captures take no state a reader puts the page in: a pointer, focus, a followed fragment, a visited link.
  it('holds a rule for a state no capture takes to an outline of a few pixels, drawn outward, or an underline', () => {
    for (const bad of [
      '[data-block]:target{display:none}',
      'p:hover{color:#fafafa}',
      'a:visited{color:#fafafa}',
      'a:link{color:#222}',
      ':focus-within p{opacity:0}',
      'main:has(:target) p{display:none}',
      'p:not(:hover){visibility:hidden}',
      'details[open] ~ p{display:none}',
      'a:focus-visible{outline:2000px solid #fafafa}',
      'a:hover{text-decoration-thickness:40px}',
      'a:focus{outline-width:var(--w)}',
      'a:focus{outline-offset:-2em}',
      // #117: a mark is drawn outward, and an underline at the font's own thickness and place.
      'a:focus{outline-offset:-2px}',
      'a:focus{outline:2px solid #fafafa;outline-offset:-1px}',
      // SDD-01-CX-0041: an inset outline covered a whole 12px block once a link to it was followed.
      'p[data-block]:target{outline:6px solid #fff;outline-offset:-6px}',
      // An outward one 6px wide crosses half of the next line of text beside the box.
      'p[data-block]:target{outline:6px solid #fff}',
      'a:focus{outline:4px solid #1a4fd6}',
      'a:focus{outline-offset:4px}',
      'a:focus{outline:thick solid #1a4fd6}',
      '[data-block]:target{text-decoration:underline overline line-through #fafafa;text-decoration-thickness:6px}',
      '[data-block]:target{text-decoration:underline overline #fafafa}',
      'a:hover{text-decoration-line:overline}',
      'a:hover{text-decoration-thickness:2px}',
      'a:hover{text-underline-offset:3px}',
      '@media (min-width: 720px){a:hover{color:#fafafa}}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    assert.ok(css('a:hover{& span{display:none}}').includes('css_unsafe'), 'a rule nested in a state')
    for (const ok of [
      'a:focus-visible{outline:2px solid #1a4fd6;outline-offset:2px}',
      'p[data-block]:target{outline:2px solid #1a4fd6;outline-offset:2px}',
      'a:focus{outline:solid #1a4fd6}',
      'a:focus{outline:medium solid #1a4fd6;outline-offset:3px}',
      'a:focus{outline-offset:0}',
      'a:hover{text-decoration:underline wavy #1a4fd6}',
      'a:hover{text-decoration-line:underline}',
      'a:hover{text-decoration:underline;text-decoration-thickness:from-font;text-underline-offset:auto}',
      'a:hover{text-decoration-color:rgb(26 79 214)}',
      'a:any-link{color:#1a4fd6}',
      'li:nth-of-type(2n){background:#f6f6f6}',
      'section:has(h2) p:first-child{margin-top:0}',
      'p:is(.lead, .note):not(:empty){font-size:1.1em}',
    ])
      assert.deepEqual(css(ok), [], ok)
  })
  // #117: the captures are taken in Chromium; a branch for another engine, or a property only it reads, is in none.
  it('refuses @supports and the properties only other engines read', () => {
    for (const bad of [
      '@supports (-webkit-touch-callout: none){[data-block]{display:none}}',
      '@supports not (display:grid){p{color:#111}}',
      '@supports selector(:has(a)){p{color:#111}}',
      '@SUPPORTS (display:grid){p{color:#111}}',
      '@media (min-width: 720px){@supports (display:grid){p{color:#111}}}',
      'p{-moz-transform:scale(0)}',
      'p{-ms-transform:none}',
      'p{-o-transform:none}',
      'p{-MOZ-opacity:0}',
      '@media (min-width: 720px){p{-moz-opacity:0}}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<h1>', '<h1 style="-moz-opacity:0">')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
    for (const ok of ['p{-webkit-font-smoothing:antialiased}', 'p{--moz-like:1px}', '@layer base{p{color:#111}}'])
      assert.deepEqual(css(ok), [], ok)
  })
  // #117: a decoration is drawn over the text: through it, or as thick as a glyph, it can bury what the render passes.
  // #117, SDD-CX43: the sweep measures each band of widths at its ends, which bound a value that moves one way only.
  it('refuses a value that grows and shrinks as the window widens, and units no sweep varies', () => {
    for (const bad of [
      '[data-block]{height:max(1px,calc(1440px - 100vw),calc(100vw - 1440px));overflow:hidden}',
      'p{height:min(calc(100vw - 600px),calc(1800px - 100vw))}',
      'p{width:clamp(1px,calc(1440px - 100vw),100vw)}',
      'p{height:max(1px,calc(1440px - 100%),calc(100% - 1440px))}',
      'p{height:abs(100vw - 1440px)}',
      'p{height:calc(1px * abs(100vw - 1440px))}',
      'p{width:mod(100vw,400px)}',
      'p{width:rem(100%,300px)}',
      'p{width:round(up,100vw,1vw)}',
      'p{width:calc(100vw - 50%)}',
      'p{height:calc(sign(100vw - 1440px) * (1440px - 100vw))}',
      'p{height:calc(1px / 100vw * 1px)}',
      'p{height:calc(e * 100vw)}',
      'p{width:calc(var(--k) * 100vw)}',
      'p{height:attr(data-h px)}',
      'p{transform:translateY(max(0px,calc(1440px - 100vw),calc(100vw - 1440px)))}',
      ':root{--k:calc(1440px - 100vw)}p{height:max(1px,var(--k))}',
      ':root{--w:50%}',
      ':root{--g:2vw}',
      'section{height:100vh;overflow:hidden}',
      'p{min-height:100svh}',
      'p{font-size:2vmin}',
      'p{width:50cqw}',
      '@media (min-width: 720px){p{height:max(1px,calc(1440px - 100vw),calc(100vw - 1440px))}}',
      // SDD-CX44: an undefined environment name takes its fallback, which moves.
      '[data-block]{height:max(1px,env(sophia-gap,calc(1440px - 100vw)),calc(100vw - 1440px));overflow:hidden}',
      ':root{--k:env(sophia-gap,calc(1440px - 100vw))}p{height:max(1px,var(--k),calc(100vw - 1440px))}',
      ':root{--k:env(sophia-gap,50vw)}',
      ':root{--k:attr(data-h px)}',
      ':root{--k:linear-gradient(#fff max(0px,calc(1440px - 100vw),calc(100vw - 1440px)),#000 100%)}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<h1>', '<h1 style="height:abs(100vw - 1440px);overflow:hidden">')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
    for (const ok of [
      'h1{font-size:clamp(1.5rem,1rem + 2vw,3rem)}',
      'main{width:min(100%,60rem);margin:0 auto}',
      'section{padding:0 calc(5vw + 1rem)}',
      'p{width:calc(100% - 2rem)}',
      'p{margin-left:max(1rem,5vw)}',
      'p{width:90vw}',
      'p{width:max(50vw,calc(-1 * (2rem - 100vw)))}',
      'p{width:round(nearest,100vw,10px)}',
      ':root{--gap:1.5rem}p{padding:calc(var(--gap) * 2);width:calc(100% - var(--gap))}',
      ':root{--fade:linear-gradient(#fff 0%,#eee 100%)}',
      'p{transform:translate(-50%,-50%)}',
      'div{grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))}',
      'body{padding-top:env(safe-area-inset-top,1rem)}',
      ':root{--pad:env(safe-area-inset-left,1rem)}main{padding-left:var(--pad)}',
      'p{width:max(10vw,env(sophia-gap,5vw))}',
    ])
      assert.deepEqual(css(ok), [], ok)
  })
  // SDD-CX42: a state takes its outline's width and offset from the cascade, so an outline is a mark in every rule.
  it('holds an outline to a mark in every rule, so no state draws one inward or wide through the cascade', () => {
    for (const bad of [
      'p[data-block]{font:12px/12px Arial;color:#000;background:#fff;outline-offset:-6px;outline-style:none}p[data-block]:target{outline:6px solid #fff}',
      'section{outline-offset:-6px}p[data-block]:target{outline:6px solid #fff;outline-offset:inherit}',
      'p{outline-offset:-1px}',
      'p{outline-width:6px;outline-style:none}',
      'p{outline:6px solid #fff}',
      'p{outline:thick solid}',
      'p{outline-offset:-.5em}',
      'p{outline-offset:1em}',
      'p{outline-width:calc(1px + 1px)}',
      'p{outline-offset:var(--o)}',
      'p{outline-width:10%}',
      '@media (min-width: 720px){p{outline-offset:-2px}}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<h1>', '<h1 style="outline-offset:-6px">')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
    for (const ok of [
      'p[data-block]{outline-offset:2px}p[data-block]:target{outline:2px solid #1a4fd6}',
      'section{outline-offset:2px}p[data-block]:target{outline:2px solid #1a4fd6;outline-offset:inherit}',
      'p{outline:none}',
      'p{outline:0}',
      'p{outline:1px dotted rgb(26 79 214)}',
      'p{outline-width:thin;outline-offset:0}',
      'a:focus-visible{outline:auto}',
    ])
      assert.deepEqual(css(ok), [], ok)
  })
  it('refuses a line through a text, and a decoration of a thickness or an offset of its own, in any rule', () => {
    for (const bad of [
      'h2{text-decoration:line-through}',
      'h2{text-decoration-line:underline line-through}',
      'h2{TEXT-DECORATION:LINE-THROUGH #fafafa}',
      'h2{text-decoration-thickness:1em}',
      'h2{text-decoration-thickness:2px}',
      'h2{text-decoration-thickness:thick}',
      'h2{text-decoration:underline 12px}',
      'h2{text-decoration:underline 10%}',
      'h2{text-decoration:underline var(--t)}',
      'h2{text-decoration-line:var(--line)}',
      'h2{text-underline-offset:-.5em}',
      'h2{text-underline-offset:calc(1px - 1em)}',
      'a:hover{text-decoration:line-through}',
      'a:focus{text-decoration-line:line-through}',
      '@media (min-width: 720px){h2{text-decoration-thickness:2px}}',
    ])
      assert.deepEqual([...new Set(css(bad))], ['css_unsafe'], bad)
    const inline = html(good).replace('<h1>', '<h1 style="text-decoration:line-through">')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
    for (const ok of [
      'a{text-decoration:underline}',
      'a{text-decoration:underline dotted #1a4fd6}',
      'a{text-decoration:underline rgb(26 79 214) from-font}',
      'a{text-decoration:none}',
      'a{text-decoration-thickness:from-font}',
      'a{text-decoration-thickness:auto}',
      'a{text-underline-offset:auto}',
      'a{text-decoration-color:rgb(26 79 214)}',
      'a{text-decoration-line:underline overline}',
    ])
      assert.deepEqual(css(ok), [], ok)
  })
  it("accepts generated content, the reader's selection and the disclosure marker", () => {
    for (const ok of [
      'h2::before{content:""}',
      'a::after{content:none}',
      'a:after{content:""}',
      'blockquote:before{content:open-quote}',
      'li::marker{color:#999}',
      '::selection{background:#ffd}',
      'summary::-webkit-details-marker{display:none}',
      'h2:first-child{margin-top:0}',
      'p:first-of-type{font-size:1.1em}',
    ])
      assert.deepEqual(css(ok), [], ok)
  })
})

describe('a page any walk can finish (#117)', () => {
  const nested = (depth: number): SourceFile[] => {
    const deep = `<h2 id="deep">${'<span>'.repeat(depth)}Findings${'</span>'.repeat(depth)}</h2>`
    return withHtml(good, html(good).replace('<main>', `<main aria-describedby="deep">${deep}`))
  }
  it('refuses nesting past the profile depth as a finding, before any walk over it', () => {
    for (const depth of [300, 5000, 38_000]) {
      const started = Date.now()
      assert.deepEqual(codes(nested(depth)), ['html_too_deep'], String(depth))
      assert.ok(Date.now() - started < 5000, `${String(depth)} levels are refused quickly`)
    }
  })
  it('checks and compiles a page nested near the limit, a referenced label at the bottom of it', () => {
    const files = nested(240)
    assert.deepEqual(codes(files), [])
    assert.match(compile(files, 'en'), /<h2 id="deep" data-sophia-shown="h2#deep">/)
  })
  const timed = (files: SourceFile[]): { found: string[]; ms: number } => {
    const started = performance.now()
    const found = codes(files)
    return { found, ms: performance.now() - started }
  }
  it('judges a reference target once, however many references name it', () => {
    const marks = '<span>•</span>'.repeat(8000)
    const refs = '<i aria-describedby="big">•</i>'.repeat(8000)
    const files = withHtml(good, html(good).replace('<main>', `<main><div id="big">${marks}</div>${refs}`))
    assert.ok(Buffer.byteLength(html(files)) <= HTML_BYTES, 'the page fits the profile')
    const { found, ms } = timed(files)
    assert.deepEqual(found, [])
    assert.ok(ms < 2000, `8000 references to one 8000-mark target are checked in ${ms.toFixed(0)} ms`)
    const loose = html(files).replace('<span>•</span></div>', '<span>Host three is free</span></div>')
    assert.ok(codes(withHtml(good, loose)).includes('attribute_text'), 'a loose text deep in the target still fails')
  })
  it('reads nested targets in one walk, and a label at the bottom of them is shown', () => {
    const depth = 200
    const ids = Array.from({ length: depth }, (_, i) => `d${String(i)}`)
    const open = ids.map((id) => `<div id="${id}">`).join('')
    const deep = `${open}<h2 id="h">Findings</h2>${'<span>•</span>'.repeat(6000)}${'</div>'.repeat(depth)}`
    const refs = `<i aria-describedby="${ids.join(' ')}">•</i>`.repeat(40)
    const files = withHtml(good, html(good).replace('<main>', `<main>${deep}${refs}`))
    assert.ok(Buffer.byteLength(html(files)) <= HTML_BYTES, 'the page fits the profile')
    const { found, ms } = timed(files)
    assert.deepEqual(found, [])
    assert.ok(ms < 2000, `${String(depth)} nested targets over 6000 marks are checked in ${ms.toFixed(0)} ms`)
    assert.match(compile(files, 'en'), /<h2 id="h" data-sophia-shown="h2#h">Findings<\/h2>/)
    const loose = html(files).replace('<span>•</span></div>', '<span>Host three is free</span></div>')
    const failed = checkSource(withHtml(good, loose), content)
    assert.deepEqual([...new Set(failed.findings.map((f) => f.code))], ['text_outside_blocks', 'attribute_text'])
    // Every reference to every target above the text, and the text itself where it sits.
    assert.equal(failed.findingCount, 40 * depth + 1, 'loose text at the bottom fails every target above it')
  })
  it('reads the labels of a page within a bound, however deep they nest', () => {
    const depth = 250
    const open = '<div data-source="nested">'.repeat(depth)
    const text = 'Host three is free. '.repeat(24_000)
    const chain = `${open}${text}${'</div>'.repeat(depth)}`
    const page = html(good)
      .replace('<main>', '<main><h2>Hosts compared</h2><i title="Hosts compared"></i>')
      .replace('</main>', `${chain}</main>`)
    const files = withHtml(good, page)
    assert.ok(Buffer.byteLength(html(files)) <= HTML_BYTES, 'the page fits the profile')
    const { found, ms } = timed(files)
    assert.ok(
      ms < 1000,
      `${String(depth)} nested labels around ${String(text.length)} characters are read in ${ms.toFixed(0)} ms`,
    )
    assert.deepEqual([...new Set(found)], ['source_unknown'], 'a name repeating a label read before them is shown')
  })
  it('takes a label text repeated by many names once', () => {
    const labels = '<h2>Cost</h2>'.repeat(15_000)
    const names = '<i title=Cost></i>'.repeat(15_000)
    const files = withHtml(good, html(good).replace('<main>', `<main>${labels}${names}`))
    assert.ok(Buffer.byteLength(html(files)) <= HTML_BYTES, 'the page fits the profile')
    const { found, ms } = timed(files)
    assert.deepEqual(found, [])
    assert.ok(ms < 2000, `15000 names over 15000 equal labels are checked in ${ms.toFixed(0)} ms`)
  })
  it('numbers lines as the text reads, whichever text was asked about last', () => {
    const text = 'a\nb\n\nc'
    assert.deepEqual(
      [0, 1, 2, 4, 5, 99].map((offset) => lineAt(text, offset)),
      [1, 1, 2, 3, 4, 4],
    )
    assert.equal(lineAt('x\ny', 2), 2)
    assert.equal(lineAt(text, 5), 4)
  })
})

describe('compile', () => {
  it('writes one self-contained page: the policy first, the stylesheet inlined, the language set', () => {
    const out = compile(good, 'it')
    assert.match(
      out,
      /^<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="([^"]+)">/,
    )
    assert.equal(/content="([^"]+)"/.exec(out)?.[1]?.replace(/&#39;|'/g, "'"), DESIGN_CSP)
    assert.match(out, /<style>body \{ font: 18px\/1\.6 Georgia, serif;/)
    assert.equal(out.match(/<meta charset/g)?.length, 1)
    const noLang = withHtml(good, html(good).replace('<html lang="en">', '<html>'))
    assert.match(compile(noLang, 'it'), /<html lang="it">/)
  })

  it('is deterministic and names its source', () => {
    assert.equal(compile(good, 'en'), compile(good, 'en'))
    assert.ok(compile(good, 'en').includes(`source sha256:${packageSha256(good)}`))
  })

  it('compiles to a page that is itself safe and complete', () => {
    const out = compile(good, 'en')
    assert.match(out, / data-sophia-shown="h1:1"/)
    // The compile's own marks, which a page may not write itself (#117), are left out of the check.
    const page = out
      .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
      .replaceAll(/ data-sophia-[a-z-]+="[^"]*"/gu, '')
    const check = checkSource([{ path: 'index.html', text: page }], content)
    assert.deepEqual(
      check.findings.filter((f) => f.severity === 'error'),
      [],
    )
  })
})

describe('scoped edits (B-16..B-18)', () => {
  const scope = { sections: ['s2'], shell: false, styles: false }

  it('applies an exact edit inside an editable section, with its diff', () => {
    const r = reviseSource(
      good,
      [{ path: 'index.html', find: '<td>VM</td>', replace: '<td><strong>VM</strong></td>' }],
      scope,
      content,
    )
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.check.complete, true)
    assert.match(r.diff, /^--- a\/index\.html\n\+\+\+ b\/index\.html\n@@ /)
    assert.match(r.diff, /\n-.*<td>VM<\/td>/)
    assert.match(r.diff, /\n\+.*<strong>VM<\/strong>/)
  })

  it('refuses text that is absent (a stale base) or ambiguous, never guessing', () => {
    const absent = reviseSource(good, [{ path: 'index.html', find: 'not in the page', replace: 'x' }], scope, content)
    assert.equal(!absent.ok && absent.findings[0]?.code, 'edit_not_found')
    const twice = reviseSource(
      good,
      [{ path: 'index.html', find: '<section', replace: '<section' }],
      FULL_SCOPE,
      content,
    )
    assert.equal(!twice.ok && twice.findings[0]?.code, 'edit_ambiguous')
  })

  it('refuses a change to a protected section, the page around the sections, or the shared stylesheet (B-17)', () => {
    const sibling = reviseSource(
      good,
      [
        {
          path: 'index.html',
          find: 'Three hosts were compared on cost and isolation.',
          replace: 'Three hosts were compared on cost and isolation. ',
        },
      ],
      scope,
      content,
    )
    assert.equal(!sibling.ok && sibling.findings[0]?.code, 'scope_section_changed')
    const shell = reviseSource(
      good,
      [{ path: 'index.html', find: '<h1>Report</h1>', replace: '<h1>Another title</h1>' }],
      scope,
      content,
    )
    assert.equal(!shell.ok && shell.findings[0]?.code, 'scope_shell_changed')
    const restyle = reviseSource(
      good,
      [{ path: 'styles.css', find: 'max-width: 42rem', replace: 'max-width: 60rem' }],
      scope,
      content,
    )
    assert.equal(!restyle.ok && restyle.findings[0]?.code, 'scope_styles_changed')
  })

  it('refuses an edit that makes the page unsafe even inside its scope', () => {
    const r = reviseSource(
      good,
      [{ path: 'index.html', find: '<td>VM</td>', replace: '<td onmouseover="x()">VM</td>' }],
      scope,
      content,
    )
    assert.equal(r.ok, false)
  })

  it('stores an incomplete page with its findings rather than refusing it (only a candidate must be complete)', () => {
    const r = reviseSource(good, [{ path: 'index.html', find: '<td>30</td>', replace: '<td>31</td>' }], scope, content)
    assert.equal(r.ok, true)
    assert.equal(r.ok && r.check.complete, false)
  })
})
