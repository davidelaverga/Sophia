import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkSource,
  compile,
  contentPackage,
  DESIGN_CSP,
  FULL_SCOPE,
  packageSha256,
  reviseSource,
  type SourceFile,
} from './index.ts'
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
    assert.ok(mutate(`<a data-cite="${B}" href="#src-${B}">[s]</a>`, '').includes('citation_altered')))
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
    assert.deepEqual(
      mutate(
        '<h1>Report</h1>',
        '<h1>Dove può girare un renderer confinato: costi, isolamento e limiti dei tre host confrontati nel dettaglio</h1>',
      ),
      [],
    )
  })
  it('does not accept hiding as a content check: markup cannot prove visibility, so the render measures it', () => {
    // hidden="" keeps the text in the file; the capture kernel's visibility measurement is what refuses it.
    assert.deepEqual(mutate('<p data-block="b1">', '<p data-block="b1" hidden>'), [])
  })
})

describe('a citation marker cannot carry a claim or lead elsewhere (SDD-01-CX-0019 F2)', () => {
  const marker = `<a data-cite="${A}" href="#src-${A}">[s]</a>`
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
    assert.deepEqual(swap(`<a data-cite="${A}" href="https://example.com/">[s]</a>`), ['citation_marker'])
    assert.deepEqual(swap(`<a data-cite="${A}" href="#src-${B}">[s]</a>`), ['citation_marker'])
    // A fragment naming nothing on the page is already refused by the profile.
    assert.deepEqual(swap(`<a data-cite="${A}" href="#nowhere">[s]</a>`), ['anchor_missing'])
    assert.deepEqual(swap(`<a data-cite="${A}">[s]</a>`), ['citation_marker'])
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
    assert.deepEqual(swap(`<a data-cite="${A}" href="#src-${A}" aria-label="Independently verified">[s]</a>`), [
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
      const to = `<a data-cite="${A}" href="#src-${A}" ${name}="${claim}">[s]</a>`
      assert.deepEqual(swap(to), ['citation_marker'], to)
    }
  })
  it("refuses a claim in any text-bearing attribute of the marker's link", () => {
    for (const name of textAttributes) {
      const to = `<sup data-cite="${A}"><a href="#src-${A}" ${name}="${claim}">1</a></sup>`
      assert.deepEqual(swap(to), ['citation_marker'], to)
    }
  })
  it('accepts the ways a page marks a citation', () => {
    for (const ok of [
      `<sup data-cite="${A}">1</sup>`,
      `<sup data-cite="${A}"><a href="#src-${A}">12</a></sup>`,
      `<sup data-cite="${A}">[<a href="#src-${A}">2</a>]</sup>`,
      `<a data-cite="${A}" href="#src-${A}" title="Source 3">(a)</a>`,
      `<span data-cite="${A}" aria-label="Fonte 4"></span>`,
      `<sup data-cite="${A}">†</sup>`,
    ])
      assert.deepEqual(swap(ok), [], ok)
  })
  it('accepts a citation mark or name in any text-bearing attribute of the marker or its link', () => {
    for (const ok of [
      `<a data-cite="${A}" href="#src-${A}" aria-description="Source 4" aria-braillelabel="[s]">[s]</a>`,
      `<sup data-cite="${A}" aria-roledescription="" aria-label="Fuente 2"><a href="#src-${A}" title="Source [2]">2</a></sup>`,
      `<sup data-cite="${A}"><a href="#src-${A}" aria-description="Fonte 4" aria-braillelabel="(4)">4</a></sup>`,
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
  it('accepts headings, captions, a summary, table headers, in-page navigation, separators and source entries', () => {
    const cases: [string, string][] = [
      ['<main>', '<main><nav aria-label="Contents"><ol><li><a href="#s1"><span>1.</span> Findings</a></li></ol></nav>'],
      ['<main>', '<main><nav><a href="#s1">Findings</a> · <a href="#sources">Sources</a></nav>'],
      ['</main>', '<figure><figcaption>Costs per month, <em>in USD</em></figcaption></figure></main>'],
      ['</main>', '<details><summary>How the hosts were read</summary></details></main>'],
      ['</main>', '<table><thead><tr><th scope="col">Host</th></tr></thead></table></main>'],
      ['<h1>Report</h1>', '<header><h1>Report <small>v2</small></h1><h2>Three hosts, compared</h2></header>'],
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
      ['<h1>', '<h1 id="t">'],
      ['<main>', '<main aria-labelledby="t">'],
      ['</main>', '<table><tr><th scope="col" abbr="Cost">Cost per month, in USD</th></tr></table></main>'],
    ]
    for (const [from, to] of accepted) assert.deepEqual(swap(from, to), [], to)
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
  it('accepts decoration: keywords, counters, a bullet, quote marks, an arrow', () => {
    for (const ok of [
      'li::before{content:"•"}',
      'q{quotes:"“" "”"}',
      'h2::before{content:counter(section) ". "}',
      'a::after{content:" →"}',
      'p::after{content:none}',
      'ol{list-style-type:decimal}',
      'blockquote::before{content:open-quote}',
    ])
      assert.deepEqual(css(ok), [], ok)
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
