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
    assert.deepEqual(codes(withCss(good, 'h2{opacity:.9} @media (prefers-reduced-motion: reduce){h2{opacity:1}}')), [])
  })
  it('allows the CSS a static article needs: media queries, gradients, custom properties, calc', () => {
    const sheet =
      ':root{--ink:#1a1a1a} body{color:var(--ink);background:linear-gradient(#fff,#fafafa);width:calc(100% - 2rem)} @media (max-width: 600px){body{font-size:17px}} h1::before{content:"\\201C"}'
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
      `<sup data-cite="${A}"><a href="#src-${A}">(12)</a></sup>`,
      `<sup data-cite="${A}">[<a href="#src-${A}">2</a>]</sup>`,
      `<a data-cite="${A}" href="#src-${A}" title="Source 3">(1)</a>`,
      `<span data-cite="${A}" aria-label="Fonte 4"></span>`,
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
      `<a data-cite="${A}" href="#src-${A}" aria-braillelabel="Price 3">[1]</a>`,
      `<a data-cite="${A}" href="#src-${A}" title="Source">[1]</a>`,
    ])
      assert.deepEqual(swap(bad), ['citation_marker'], bad)
  })
  it('accepts a citation mark or name in any text-bearing attribute of the marker or its link', () => {
    for (const ok of [
      `<a data-cite="${A}" href="#src-${A}" aria-description="Source 4" aria-braillelabel="[1]">[1]</a>`,
      `<sup data-cite="${A}" aria-roledescription="" aria-label="Fuente 2"><a href="#src-${A}" title="Source [2]">[2]</a></sup>`,
      `<sup data-cite="${A}"><a href="#src-${A}" aria-description="Fonte 4" aria-braillelabel="(4)">(4)</a></sup>`,
      `<sup data-cite="${A}" title=" [ 1 ] " aria-label="">[1]</sup>`,
      `<a data-cite="${A}" href="#src-${A}" aria-label="†">†</a>`,
      `<sup data-cite="${A}" aria-label="[2]">[<a href="#src-${A}" title="[2]">2</a>]</sup>`,
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
      ['<main>', '<main><nav aria-label="Contents"><ol><li><a href="#s1"><span>1.</span> Findings</a></li></ol></nav>'],
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
      ['</main>', '<table><tr><th scope="col" abbr="Cost">Cost per month, in USD</th></tr></table></main>'],
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
      const to = `<main><span role="slider" tabindex="0" aria-labelledby="t" ${attribute}></span>\n<h1 id="t">`
      assert.deepEqual(swap('<main>\n<h1>', to), ['unsafe_attribute'], attribute)
    }
  })
  it('accepts the ARIA states that carry no data of their own', () => {
    for (const attribute of [
      'aria-hidden="true"',
      'aria-current="page"',
      'aria-expanded="false"',
      'aria-sort="ascending"',
      'aria-relevant="additions text"',
      'aria-live="polite"',
    ]) {
      const to = `<main><nav ${attribute}><a href="#s1">Findings</a></nav>`
      assert.deepEqual(swap('<main>', to), [], attribute)
    }
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
  it('accepts decoration: keywords, counters, a bullet, quote marks, an arrow', () => {
    for (const ok of [
      'li::before{content:"•"}',
      'q{quotes:"“" "”"}',
      'a::after{content:" →"}',
      'p::after{content:none}',
      'ol{list-style-type:decimal}',
      'blockquote::before{content:open-quote}',
      'q{quotes:"“" "”" "‘" "’"}',
      'nav a+a::before{content:" · "}',
      'a.back::after{content:" ↩"}',
      'li::marker{content:"§ "}',
    ])
      assert.deepEqual(css(ok), [], ok)
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
    const inline = html(good).replace('<main>', '<main><ol style="list-style-type:lower-latin"><li></li></ol>')
    assert.deepEqual(codes(withHtml(good, inline)), ['css_unsafe'])
    for (const type of ['a', 'A', 'i', 'I']) {
      const page = html(good).replace('<main>', `<main><ol type="${type}"><li></li></ol>`)
      assert.deepEqual(codes(withHtml(good, page)), ['unsafe_attribute'], type)
    }
  })
  // #117: a counter's number is content no block holds, in any style; a list's numbers follow its items.
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
    for (const list of ['<ol start="3"><li></li></ol>', '<ol><li value="5"></li></ol>']) {
      const page = html(good).replace('<main>', `<main>${list}`)
      assert.deepEqual(codes(withHtml(good, page)), ['unsafe_attribute'], list)
    }
  })
  it('accepts numbers and bullets: list markers and marks that spell nothing', () => {
    for (const ok of [
      'ol{list-style-type:decimal}',
      '@media print{ol{list-style:square inside}}',
      'ul{list-style-type:"→"}',
      'details>summary{list-style-type:disclosure-closed}',
      'ul{list-style:none}',
      'p{text-emphasis-style:filled circle}',
      'p{hyphens:manual;hyphenate-character:"‐"}',
    ])
      assert.deepEqual(css(ok), [], ok)
    const numbered = html(good).replace('<main>', '<main><ol type="1" reversed><li></li></ol>')
    assert.deepEqual(codes(withHtml(good, numbered)), [])
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
    const check = checkSource(
      [{ path: 'index.html', text: out.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '') }],
      content,
    )
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
