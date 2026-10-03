import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { assertGrowth } from '../../test-support/src/growth.ts'
import { renderReport } from './report-html.ts'
import {
  PAGE_CSS,
  PAGE_CSP,
  renderReportPage,
  reportLanguage,
  type PageSource,
  type ReportPageInput,
} from './report-page.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const E = '55555555-5555-4555-8555-555555555555'

const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

const REPORT = `# Hosts that render PDFs

Which hosts can run a confined renderer, and at what cost.

## Executive summary

${filler(40)} [${A}]

## Findings

| Host | Sandbox | Price |
|:-----|:-------:|------:|
| Alpha | yes | 7 |

${filler(40)} (${A}; ${B})

## Conclusion

${filler(30)}
`

const SHA = createHash('sha256').update(REPORT).digest('hex')

const page = (extra: Partial<ReportPageInput> = {}) =>
  renderReportPage({
    markdown: REPORT,
    title: 'Fallback',
    sources: [
      { id: A, title: 'Alpha docs', url: 'https://alpha.test/docs?q=1&x=2' },
      { id: B, title: 'beta.test', url: null },
    ],
    citable: [A, B],
    sha256: SHA,
    versionNumber: 3,
    ...extra,
  })

/** A report that cites every kind of source Studio holds, with the provenance it holds for each. */
const RICH = `# Hosts for an EU product

Which host keeps the data in the EU [${A}].

## Executive summary

Harbor fits [${A}] [${B}]. Northwind is the fallback [${C}].

## Findings

| Host | EU | Cost |
|:--|:--:|--:|
| Harbor | yes | 310 |

Harbor [${A}] and Calder [${D}] state EU-only support [${A}].

## Risks and limitations

- Restore times are vendor claims [${E}].

## Conclusion

Choose Harbor [${A}].
`

const RICH_SOURCES: readonly PageSource[] = [
  {
    id: A,
    title: 'Harbor DPA',
    url: 'https://legal.harbor.example/dpa/eu?version=2026-06&lang=en',
    kind: 'web_read',
    coverage: 'complete',
    retrievedAt: '2026-10-01T23:59:59.000Z',
    limitations: [],
  },
  {
    id: B,
    title: 'Northwind backups',
    url: 'https://docs.northwind.example/backups',
    kind: 'web_read',
    coverage: 'partial',
    retrievedAt: '2026-10-02T09:16:02.000Z',
    limitations: ['The extractor returned the first part of the page.'],
  },
  {
    id: C,
    title: 'Search: Northwind EU support',
    url: null,
    kind: 'search_results',
    coverage: 'complete',
    retrievedAt: '2026-10-02T09:12:10.000Z',
    limitations: [],
  },
  {
    id: D,
    title: 'Calder DPA',
    url: 'javascript:alert(1)',
    kind: 'web_read',
    coverage: 'unsupported',
    retrievedAt: null,
    limitations: [],
  },
  {
    id: E,
    title: 'Ostrava terms (uploaded)',
    url: null,
    kind: 'input',
    coverage: null,
    retrievedAt: null,
    limitations: [],
  },
]

const rich = (extra: Partial<ReportPageInput> = {}) =>
  renderReportPage({
    markdown: RICH,
    title: 'Report',
    sources: RICH_SOURCES,
    citable: [A, B, C, D, E],
    sha256: createHash('sha256').update(RICH).digest('hex'),
    versionNumber: 2,
    publishedAt: '2026-10-02T00:30:00+02:00',
    limitations: [],
    ...extra,
  })

/**
 * Inputs no report should be able to use to break out of the page (the design's hostile fixture), with three sections,
 * so its headings reach the contents too, and image words in a mailto address, which keeps its spaces in the href.
 */
const HOSTILE: ReportPageInput = {
  markdown:
    '# A "quoted" </style><script>alert(1)</script> & \\ back\'s title </title>\n\n' +
    `Lead [x](<${A}>) text.\n\n## <b>Head</b> "q" & 's\n\nBody text with a citation [${B}] here.\n\n` +
    `## Limitations </section><script>\n\nMore [${A}]. Write to <mailto:[image: x]> now.\n\n` +
    '## Mail <mailto:[image: y]>\n\nThe end.\n',
  title: 'x',
  sha256: '0'.repeat(64),
  versionNumber: 1,
  publishedAt: 'not a date',
  sources: [
    {
      id: A,
      title: '"><img src=x onerror=alert(1)> <script>t</script> & \'s',
      url: 'https://en.wikipedia.org/wiki/Hilbert\'s_problems?a=1&b="2"#it\'s',
      kind: 'web_read',
      coverage: 'complete',
      retrievedAt: '2026-10-02T00:00:00Z',
      limitations: ['</li><script>x</script>'],
    },
    {
      id: B,
      title: 'plain',
      url: 'https://a.example/x?q=<script>',
      kind: 'search_results',
      coverage: 'complete',
      retrievedAt: null,
      limitations: [],
    },
  ],
  citable: [A, B],
  limitations: ['<b>stored</b> & "quoted"'],
}

/** The elements and attributes html-report-v1 printed, and what v2 adds to them: nothing that runs or loads. */
const V1_TAGS =
  'html head meta title style body header footer nav section div p h1 h2 h3 h4 h5 h6 ol ul li a sup span strong em ' +
  'code pre blockquote hr br figure table thead tbody tr th td'
const TAGS = new Set(`${V1_TAGS} main dl dt dd wbr`.split(' '))
const V1_ATTRS = 'class id href lang charset name content http-equiv start data-report-role data-visual-id'
const ATTRS = new Set(`${V1_ATTRS} tabindex role aria-label`.split(' '))

/** The style must be one inline sheet that loads nothing. */
function styleIssues(html: string): string[] {
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)]
  const style = styles[0]?.[1] ?? ''
  const css = style.replace(/\/\*[\s\S]*?\*\//g, '')
  const loads = [/url\(/i, /@import/i, /@font-face/i, /image-set\(/i, /expression\(/i].filter((re) => re.test(css))
  return [
    ...(styles.length === 1 ? [] : [`${styles.length} style elements`]),
    ...(style.includes('</') ? ['the style holds "</"'] : []),
    ...loads.map((re) => `the style has ${String(re)}`),
  ]
}

/** The head's seven metas, its policy unchanged and alone. */
function headIssues(html: string): string[] {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1]
  return [
    ...(html.match(/<meta\b/g)?.length === 7 ? [] : ['not 7 metas']),
    ...(csp === PAGE_CSP ? [] : ['CSP changed']),
    ...(html.match(/http-equiv=/g)?.length === 1 ? [] : ['a second http-equiv']),
  ]
}

/**
 * One element: a tag the page prints, attributes it prints, and a link to the page, the web or mail. Whatever is left
 * once each name="value" pair is taken out (a value holding a raw < or >, a stray quote) is an attribute broken open.
 */
function tagIssues(tag: string, attributes: string): string[] {
  const issues = TAGS.has(tag) ? [] : [`tag <${tag}>`]
  for (const [, name = '', value = ''] of attributes.matchAll(/\s([a-zA-Z-:]+)(?:="([^"]*)")?/g)) {
    if (!ATTRS.has(name.toLowerCase())) issues.push(`attribute ${name} on <${tag}>`)
    if (name === 'href' && !/^(#|https?:|mailto:)/.test(value)) issues.push(`href ${value}`)
  }
  const rest = attributes.replace(/\s[a-zA-Z-]+(="[^"<>]*")?/g, '').trim()
  if (rest !== '') issues.push(`<${tag}> broken open at ${rest}`)
  return issues
}

/** Every element and attribute is one the page prints; nothing scripts, and no break splits an entity. */
function markupIssues(body: string): string[] {
  const tags = [...body.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g)]
  return [
    ...tags.flatMap(([, tag = '', attributes = '']) => tagIssues(tag.toLowerCase(), attributes)),
    ...(/javascript:/i.test(body) ? ['javascript:'] : []),
    ...(/&(?:<wbr>)+#?[a-z0-9]+;|&[a-z0-9#]*<wbr>[a-z0-9#]*;/i.test(body) ? ['an entity split by <wbr>'] : []),
  ]
}

/** Every id once, and every in-page link lands on one. */
function linkIssues(body: string): string[] {
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? '')
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i)
  const targets = new Set(ids)
  const dangling = [...body.matchAll(/\shref="#([^"]+)"/g)].map((m) => m[1] ?? '').filter((t) => !targets.has(t))
  return [
    ...(twice.length === 0 ? [] : [`ids used twice: ${twice.join(', ')}`]),
    ...(dangling.length === 0 ? [] : [`links without a target: ${[...new Set(dangling)].join(', ')}`]),
  ]
}

/** What a page must never hold, whatever it was given (the page's hard constraints, on its bytes). */
function audit(html: string): string[] {
  const body = html.replace(/<style>[\s\S]*?<\/style>/, '')
  return [...styleIssues(html), ...headIssues(html), ...markupIssues(body), ...linkIssues(body)]
}

/** The order of the contents and the sections in the page. */
const order = (html: string) =>
  [...html.matchAll(/<(nav class="toc"|section id="[^"]+")/g)].map((m) => (m[1] ?? '').replace(/"[^"]*$/, ''))

/** The visible text of a part of the page: tags dropped, the few entities the template writes read back. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[e] ?? "'")

/** A part of the page between two markers (the first `from`, the next `to` after it). */
function slice(html: string, from: string, to: string): string {
  const start = html.indexOf(from)
  assert.ok(start >= 0, `no ${from}`)
  return html.slice(start, html.indexOf(to, start + from.length) + to.length)
}

describe('the report as a web page (html-report-v2)', () => {
  it('opens with its charset, viewport and policy, before anything the report wrote; the same bytes each time', () => {
    const html = page()
    const head =
      '<!doctype html>\n<html lang="und"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`
    assert.ok(html.startsWith(head), html.slice(0, 300))
    assert.equal(PAGE_CSP, "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
    assert.ok(html.includes(`<style>${PAGE_CSS}</style>`) && PAGE_CSS.includes('@media screen'))
    assert.equal(html, page(), 'the same bytes for the same input')
  })

  it('prints the bytes it has always printed for the same report (pinned: a change must be deliberate)', () => {
    const digest = createHash('sha256').update(page()).digest('hex')
    assert.equal(digest, '61355303e6866a1ffe6dfc06e00d9badba0fc3665b41d585d0b5c2726d636081')
    const html = page()
    assert.ok(
      html.includes('<meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light dark">'),
    )
    assert.ok(PAGE_CSS.includes('--measure: calc(var(--text-base) * 30)'), 'a reading column of 30 ems')
  })

  it('runs and loads nothing, whatever the report wrote', () => {
    const md = [
      '# <b>T</b>',
      '',
      '## S',
      '',
      '<script>alert(1)</script> <img src=x onerror=alert(1)>',
      '',
      '[click](javascript:alert(1)) [ok](https://ok.test/"onmouseover="x) ![chart](https://evil.test/p.png)',
      '',
      '![map [2026]](https://evil.test/m.png)',
    ].join('\n')
    const html = page({ markdown: md, title: '</title><script>x</script>' })
    assert.doesNotMatch(html, /<(script|img|iframe|object|embed|form|base|link)\b|<[^>]*\son\w+=|javascript:/i)
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.match(html, /<span class="omitted">Image not included: chart<\/span>/)
    assert.match(html, /<span class="omitted">Image not included: map \[2026\]<\/span>/, 'brackets in its name')
  })

  it('escapes its own title, whether a heading or the fallback gives it: nothing reaches the head', () => {
    const breakout = '</title><meta http-equiv="refresh" content="0;url=https://evil.test/"><b>x</b>'
    for (const html of [
      page({ markdown: `# ${breakout}\n\nSome text.` }),
      page({ markdown: 'Some text, no heading.', title: breakout }),
    ]) {
      const head = html.slice(0, html.indexOf('</head>'))
      assert.equal(head.match(/<title>/g)?.length, 1, head)
      assert.equal(html.match(/http-equiv="/g)?.length, 1, 'the policy is the only http-equiv')
      assert.equal(html.match(/<meta\b/g)?.length, 7, 'only the page’s own metas')
      assert.doesNotMatch(html, /<(b|i|script|iframe|base|link)\b/)
      assert.ok(head.includes('<title>&lt;/title&gt;&lt;meta http-equiv=&quot;refresh&quot;'), head)
    }
  })

  it('prints a short report too: a page is not gated by the PDF checks', () => {
    const markdown = 'Twenty words or so, no heading.'
    assert.equal(
      renderReport({ markdown, language: 'en', title: 'F', sources: [], layout: 'standard' }).accepted,
      false,
    )
    assert.match(page({ markdown }), /<h1>Fallback<\/h1>[\s\S]*Twenty words/)
  })

  it('numbers only what the viewer numbers: a link to an id outside its sources is its label', () => {
    const html = page({ markdown: `# T\n\nIt cites [1](<${A}>) and names [2](${C}).` })
    assert.match(
      html,
      /It cites<sup class="cite"><a href="#cite-1" id="ref-1" aria-label="Source 1">1<\/a><\/sup> and names 2\./,
    )
    assert.match(html, /<li id="cite-1"><a class="back" href="#ref-1"/)
  })

  it('names the record it was printed from: the version and the Markdown hash', () => {
    const sha12 = SHA.slice(0, 12)
    const foot = (version: string) =>
      `<footer class="provenance"><p><span>Sophia research report</span> · ${version}` +
      `<span>Markdown sha256 <span class="hash">${sha12}</span></span> · <span>html-report-v2</span></p></footer>\n</body>`
    assert.ok(page().includes(foot('<span>version 3</span> · ')), page().slice(-400))
    assert.match(page(), new RegExp(`<meta name="sophia-markdown-sha256" content="${SHA}">`))
    assert.match(page(), /<meta name="generator" content="Sophia html-report-v2">/)
    assert.ok(page({ versionNumber: null }).includes(foot('')))
  })

  it("speaks the report's own language when it is clear, else none", () => {
    const italian =
      '# Rapporto\n\n## Sintesi\n\nIl servizio della rete che offre anche il rendering, per questo sono gli ' +
      'strumenti delle opzioni nel progetto, alla fine degli studi.'
    assert.equal(reportLanguage(italian), 'it')
    assert.match(
      page({ markdown: italian }),
      /<html lang="it">[\s\S]*<p class="eyebrow">Sophia · Rapporto di ricerca<\/p>/,
    )
    assert.equal(reportLanguage(REPORT), 'und', 'filler words name no language')
    assert.equal(reportLanguage('Short.'), 'und')
    const english =
      '# Report\n\n## Summary\n\nThe service is the one that renders, and this is from the team with the hosts, ' +
      'which are for the project of the year.'
    assert.equal(reportLanguage(english), 'en')
    assert.match(page({ markdown: english }), /<html lang="en">[\s\S]*<p class="eyebrow">Sophia · Research report<\/p>/)
    const spanish =
      '# Informe\n\n## Resumen\n\nEl servicio que ofrece los informes para las empresas, como este proyecto, ' +
      'también está por encima de las opciones que son más caras.'
    assert.equal(reportLanguage(spanish), 'es')
    const es = page({ markdown: spanish })
    assert.match(es, /<html lang="es">[\s\S]*<p class="eyebrow">Sophia · Informe de investigación<\/p>/)
    assert.match(page({ markdown: `${spanish}\n\nVer [${A}].` }), /<h2>Fuentes<\/h2>/)
    const mixed = `${italian} The service of the rendering is that this is the one which is from the team and the host.`
    assert.equal(reportLanguage(mixed), 'und', 'no clear lead')
  })
})

describe('html-report-v2: what its bytes guarantee', () => {
  it('U1 · holds the page’s hard constraints on every input, hostile ones too', () => {
    const italianRich = RICH.replace(
      'Which host keeps the data in the EU',
      'Il servizio della rete che offre anche il ripristino, per questo sono gli strumenti delle opzioni nel ' +
        'progetto, alla fine degli studi, della rete che offre anche il ripristino nel progetto',
    )
    for (const [name, html] of [
      ['fixture', page()],
      ['rich', rich()],
      ['italian', rich({ markdown: italianRich })],
      ['hostile', renderReportPage(HOSTILE)],
      ['no sources', page({ markdown: `# T\n\n## One\n\n${filler(20)}`, sources: [], citable: [] })],
    ] as const) {
      assert.deepEqual(audit(html), [], name)
    }
  })

  it('U1 · prints the same bytes in every time zone: dates are the stored instants, written in UTC', () => {
    const zone = process.env.TZ
    try {
      const pages = ['Pacific/Kiritimati', 'America/Los_Angeles', 'UTC'].map((tz) => {
        process.env.TZ = tz
        return rich()
      })
      assert.equal(pages[0], pages[2], 'Kiritimati prints what UTC prints')
      assert.equal(pages[1], pages[2], 'Los Angeles prints what UTC prints')
    } finally {
      if (zone === undefined) delete process.env.TZ
      else process.env.TZ = zone
    }
  })

  it('U1 · escapes what a hostile report and record hold, and never splits an entity to break an address', () => {
    const html = renderReportPage(HOSTILE)
    const body = html.slice(html.indexOf('<body'))
    assert.doesNotMatch(body, /<(script|img|b)\b|<[^>]*\son\w+=/i)
    assert.ok(body.includes('<h1>A &quot;quoted&quot; &lt;/style&gt;&lt;script&gt;alert(1)&lt;/script&gt;'), body)
    const stored = renderReportPage({ ...HOSTILE, markdown: HOSTILE.markdown.replace('## Limitations', '## Notes') })
    assert.ok(stored.includes('<li>&lt;b&gt;stored&lt;/b&gt; &amp; &quot;quoted&quot;</li>'), 'a stored limitation')
    assert.ok(body.includes('<ul class="src-notes"><li>&lt;/li&gt;&lt;script&gt;x&lt;/script&gt;</li></ul>'))
    assert.ok(body.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &lt;script&gt;t&lt;/script&gt; &amp; &#39;s'))
    assert.ok(
      body.includes('/<wbr>wiki/<wbr>Hilbert&#39;s_problems<wbr>?a<wbr>=1<wbr>&amp;b<wbr>=&quot;2&quot;<wbr>#it&#39;s'),
    )
    assert.ok(body.includes('/<wbr>x<wbr>?q<wbr>=&lt;script&gt;'), 'shown decoded, escaped')
    assert.ok(body.includes('href="https://a.example/x?q=%3Cscript%3E"'), 'the link keeps its escaped form')
    assert.ok(
      body.includes('<li><a href="#bheadb-q-s">&lt;b&gt;Head&lt;/b&gt; &quot;q&quot; &amp; &#39;s</a>'),
      'contents',
    )
    assert.ok(body.includes('Write to <a href="mailto:[image: x]">mailto:<span class="omitted">'), 'a mailto href')
    assert.ok(body.includes('<h2>Mail <a href="mailto:[image: y]">mailto:<span class="omitted">'), 'in a heading')
    // An address whose path decodes to a control or format character (an override, a NUL, a zero width) shows escaped.
    const tricky = 'https://evil.example/%E2%80%AEmoc.knab.www%00%E2%80%8B'
    const shown = renderReportPage({ ...HOSTILE, sources: HOSTILE.sources.map((s) => ({ ...s, url: tricky })) })
    assert.ok(shown.includes('<span class="host">evil.example</span>/<wbr>%E2%80%AEmoc.knab.www%00%E2%80%8B</a>'))
    for (const c of ['\u0000', '\u200b', '\u202e']) assert.ok(!shown.includes(c), 'an invisible character in the page')
  })

  it('prints a page in linear time, whatever runs of spaces or image words a draft holds (a draft may hold 256 KiB)', async () => {
    // At the draft's limit a code block of spaces took 270 s and image words 15 s: a run of spaces was scanned from
    // each of its spaces, and each "[image: " to the end of its paragraph.
    const linear = (label: string, make: (size: number) => string, n: number) =>
      assertGrowth(
        label,
        (size, measure) => {
          const input = { ...HOSTILE, markdown: make(size) }
          return measure(() => renderReportPage(input))
        },
        n,
      )
    await linear('spaces in a code block', (n) => `# T\n\n## S\n\n\`\`\`\n${' '.repeat(n)}\n\`\`\`\n`, 4096)
    await linear('spaces in a paragraph', (n) => `# T\n\n## S\n\nword${' '.repeat(n)}x\n`, 4096)
    await linear(
      'no-break spaces in a table cell',
      (n) => `# T\n\n## S\n\n| a |\n|--|\n| b${'\u00a0'.repeat(n)}c |\n`,
      4096,
    )
    await linear('image words that never close', (n) => `# T\n\n## S\n\n${'[image: '.repeat(n / 8)}\n`, 16 * 1024)
  })

  it('U2 · gives every id once, and every in-page link a target, whatever the headings are called', () => {
    const md =
      `# Title that cites [${C}]\n\nLead [${A}].\n\n## Ref 1\n\n${filler(10)} [${B}]\n\n## Report method\n\n` +
      `${filler(10)}\n\n## Report limitations\n\n${filler(10)}\n\n## Cite 2\n\nx\n\n## Report sources\n\ny\n`
    const html = page({ markdown: md, citable: [A, B, C], limitations: ['Stored.'] })
    assert.deepEqual(audit(html), [])
    for (const id of ['ref-1-2', 'report-method-2', 'report-limitations-2', 'cite-2-2', 'report-sources-2']) {
      assert.ok(html.includes(`<section id="${id}"`), id)
    }
    // The title's citation prints as "[1]" in the title: its source links back to the title block.
    assert.ok(html.includes('<h1>Title that cites [1]</h1>'))
    assert.ok(
      html.includes('<li id="cite-1"><a class="back" href="#report-title" aria-label="Back to citation 1">1</a>'),
    )
  })

  it('U2 · renames a heading’s id the page gives its own part in the page only; pdf-report-v1 prints what it did', () => {
    const md =
      `# Hosts named like the page\n\nWhich hosts were compared [${A}].\n\n## Report method\n\n${filler(40)} [${A}]\n\n` +
      `## Report limitations\n\n${filler(40)} [${B}]\n\n## Ref 1\n\n${filler(30)}\n`
    const sources = [
      { id: A, title: 'Alpha docs', url: 'https://alpha.test/docs' },
      { id: B, title: 'Beta notes', url: null },
    ]
    const pdf = renderReport({ markdown: md, language: 'en', title: 'Fallback', sources, layout: 'standard' })
    // What report-html.ts printed for this report before html-report-v2 (8019e41): its section ids and its bytes.
    assert.equal(pdf.accepted, true)
    assert.deepEqual(
      pdf.manifest.sections.map((s) => s.id),
      ['report-method', 'report-limitations', 'ref-1'],
    )
    assert.equal(
      createHash('sha256').update(pdf.html).digest('hex'),
      '2bf6675fe4c0a403fc669b8f651e645a56a265ba4eca7d24b889f1dd75d460c7',
    )
    const html = page({ markdown: md, sources, citable: [A, B] })
    assert.deepEqual(audit(html), [])
    assert.deepEqual(
      [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]),
      ['report-method-2', 'report-limitations-2', 'ref-1-2'],
    )
    assert.ok(html.includes('<a href="#cite-1" id="ref-1" aria-label="Source 1">1</a>'), 'the citation keeps ref-1')
    assert.ok(html.includes('<section class="method" id="report-method"'), 'the method keeps report-method')
  })

  it('U3 · binds a citation to its word as a bare numeral; adjacent ones group; only the first carries the id', () => {
    const html = page({ markdown: `# T\n\n## S\n\nzone [${A}] [${B}].\n\nAgain\u00a0[${A}].` })
    assert.ok(
      html.includes(
        'zone<sup class="cite"><a href="#cite-1" id="ref-1" aria-label="Source 1">1</a><span class="sep">,</span><wbr>' +
          '<a href="#cite-2" id="ref-2" aria-label="Source 2">2</a></sup>.',
      ),
      html,
    )
    assert.ok(html.includes('Again<sup class="cite"><a href="#cite-1" aria-label="Source 1">1</a></sup>.'))
  })

  it('U4 · wraps the lead to the method in <main>; a table is a named region the keyboard can scroll', () => {
    const html = rich()
    const body = html.slice(html.indexOf('<body class="standard">\n') + 24)
    assert.ok(body.startsWith('<header class="title-block" id="report-title">'))
    assert.match(body, /<\/header>\n<main>\n<div class="lead">/)
    assert.match(body, /<\/ul><\/section>\n<\/main>\n<footer class="provenance">/)
    assert.match(body, /<section class="method" id="report-method"[^]*<\/section>\n<\/main>/)
    assert.ok(
      html.includes('<figure class="table" data-visual-id="table-1" tabindex="0" role="region" aria-label="Table 1">'),
    )
    const italian = page({
      markdown: `# Rapporto\n\n${'il servizio della rete che offre anche per questo '.repeat(4)}\n\n${REPORT}`,
    })
    assert.ok(italian.includes('aria-label="Tabella 1">'), 'in the report’s language')
  })

  it('U5 · dots and names a citation of a weak source; a source of no known kind is plain', () => {
    const html = rich()
    assert.ok(html.includes('<a href="#cite-1" id="ref-1" aria-label="Source 1">1</a>'))
    assert.ok(html.includes('<a href="#cite-2" id="ref-2" class="weak" aria-label="Source 2, read in part">2</a>'))
    assert.ok(html.includes('<a href="#cite-3" id="ref-3" class="weak" aria-label="Source 3, snippet only">3</a>'))
    assert.ok(html.includes('<a href="#cite-4" id="ref-4" class="weak" aria-label="Source 4, not read">4</a>'))
    assert.ok(html.includes('<a href="#cite-5" id="ref-5" aria-label="Source 5">5</a>'), 'a project input is not weak')
    assert.doesNotMatch(page(), /class="weak"/)
  })

  it('U6 · says of each source what was read and when, where it is cited, its address, and its stored limits', () => {
    const html = rich()
    assert.ok(
      html.includes(
        '<li id="cite-1"><a class="back" href="#ref-1" aria-label="Back to citation 1">1</a><span class="src-title">' +
          'Harbor DPA</span><span class="src-meta"><span class="status">Read in full</span> · retrieved 1 October 2026 · ' +
          'cited in <a href="#report-title">Introduction</a>, <a href="#executive-summary">Executive summary</a>, ' +
          '<a href="#findings">Findings</a>, <a href="#conclusion">Conclusion</a></span><a class="url" ' +
          'href="https://legal.harbor.example/dpa/eu?version=2026-06&amp;lang=en">https://<span class="host">' +
          'legal.harbor.example</span>/<wbr>dpa/<wbr>eu<wbr>?version<wbr>=2026-06<wbr>&amp;lang<wbr>=en</a></li>',
      ),
      slice(html, '<li id="cite-1">', '</li>'),
    )
    const two = slice(html, '<li id="cite-2">', '</ul></li>')
    assert.ok(two.includes('<span class="status weak">Read in part</span> · retrieved 2 October 2026 · cited in'))
    assert.ok(two.includes('<ul class="src-notes"><li>The extractor returned the first part of the page.</li></ul>'))
    const four = slice(html, '<li id="cite-4">', '</li>')
    assert.ok(four.includes('<span class="status weak">Not read</span> · cited in <a href="#findings">Findings</a>'))
    assert.doesNotMatch(four, /class="url"|javascript/, 'no address line for an unsafe address')
    const five = slice(html, '<li id="cite-5">', '</li>')
    assert.ok(five.includes('<span class="status">From the project</span> · cited in'), 'no retrieval date for input')
    const undated = rich({ sources: RICH_SOURCES.map((s) => (s.id === A ? { ...s, retrievedAt: 'yesterday' } : s)) })
    assert.ok(
      slice(undated, '<li id="cite-1">', '</li>').includes('<span class="status">Read in full</span> · cited in'),
      'no date from a timestamp that is not one',
    )
    const plain = slice(page(), '<li id="cite-2">', '</li>')
    assert.equal(
      plain,
      '<li id="cite-2"><a class="back" href="#ref-2" aria-label="Back to citation 2">2</a>' +
        '<span class="src-title">beta.test</span><span class="src-meta">cited in <a href="#findings">Findings</a></span></li>',
    )
  })

  it('U7 · sums the evidence by what was read, in one sentence, never by counting sites', () => {
    const html = rich()
    assert.ok(
      html.includes(
        '<p class="src-summary">5 sources: 1 read in full, 1 read in part, 1 snippet only (a search listing), ' +
          '1 not read, 1 from the project. A dotted number in the text cites a source read only in part or only as ' +
          'a search snippet.</p>',
      ),
    )
    assert.doesNotMatch(textOf(html), /\bsites?\b/i)
    assert.doesNotMatch(page(), /<p class="src-summary">/, 'not when a status is unknown')
    const full = rich({
      sources: RICH_SOURCES.map((s) => ({ ...s, kind: 'web_read' as const, coverage: 'complete' as const })),
    })
    assert.ok(full.includes('<p class="src-summary">5 sources: 5 read in full.</p>'), 'no key without a weak source')
  })

  it('U8 · counts the distinct sources each argued section cites in the contents, and no zeros', () => {
    const nav = slice(rich(), '<nav class="toc"', '</nav>')
    assert.equal(
      nav,
      '<nav class="toc" id="report-contents" data-report-role="toc"><h2>Contents</h2><p class="toc-key">Sources cited' +
        '</p><ol><li><a href="#executive-summary">Executive summary</a></li><li><a href="#findings">Findings</a>' +
        '<span class="n">2</span></li><li><a href="#risks-and-limitations">Risks and limitations</a><span class="n">1' +
        '</span></li><li><a href="#conclusion">Conclusion</a></li><li class="aux"><a href="#report-sources">Sources' +
        '</a></li><li class="aux"><a href="#report-method">How this report was made</a></li></ol></nav>',
    )
    const quiet = slice(
      page({ markdown: `# T\n\n## One\n\n${filler(9)}\n\n## Two\n\nx\n\n## Three\n\ny` }),
      '<nav',
      '</nav>',
    )
    assert.doesNotMatch(quiet, /class="n"|toc-key|report-sources/, 'no counts, no key, no sources row')
  })

  it('U9 · prints the stored limitations where the report wrote none, before its conclusion; never twice', () => {
    const without = RICH.replace(/## Risks and limitations[^#]*/, '')
    const html = rich({ markdown: without, limitations: ['Restore times are vendor claims.', '  '] })
    assert.ok(
      html.includes(
        '<section id="report-limitations" data-report-role="limitations"><h2>Limitations</h2>\n' +
          '<p class="aside">As stated when this version was published.</p><ul><li>Restore times are vendor claims.</li>' +
          '</ul></section>\n<section id="conclusion"',
      ),
    )
    assert.ok(html.includes('<li><a href="#report-limitations">Limitations</a></li>'), 'in the contents')
    const stated = rich({ limitations: ['Restore times are vendor claims.'] })
    assert.doesNotMatch(stated, /id="report-limitations"/)
    assert.equal(stated.match(/<section id="[^"]+" data-report-role="limitations"/g)?.length, 1)
    // A heading that names the limitations under another role states them too: nothing is printed twice.
    for (const heading of ['Risks and limits', 'Conclusions and limitations', 'Sources and limitations']) {
      const named = without.replace('## Conclusion', `## ${heading}`)
      assert.doesNotMatch(rich({ markdown: named, limitations: ['Stored.'] }), /id="report-limitations"/, heading)
    }
  })

  it('U10 · reads limitations and answers from their headings, and nothing else', () => {
    const role = (heading: string) => {
      const html = page({ markdown: `# T\n\n## ${heading}\n\n${filler(5)}\n\n## Background\n\nx` })
      return /<section id="[^"]+" data-report-role="([a-z]+)"><h2>/.exec(html)?.[1]
    }
    assert.equal(role('Risks and limitations'), 'limitations')
    assert.equal(role('Limiti'), 'limitations')
    assert.equal(role('Caveats'), 'limitations')
    assert.equal(role('Risks and limits'), 'limitations')
    assert.equal(role('Known limits'), 'limitations')
    assert.equal(role('Scope and limits'), 'limitations')
    assert.equal(role('Rischi e limiti'), 'limitations')
    assert.equal(role('Riesgos y límites'), 'limitations')
    assert.equal(role('Rate limits and quotas'), 'body')
    assert.equal(role('Pricing and limits'), 'body')
    assert.equal(role('Risk limits'), 'body')
    assert.equal(role('Answer'), 'summary')
    assert.equal(role('The bottom line'), 'summary')
    assert.equal(role('Answering engines compared'), 'body')
    const pdf = renderReport({
      markdown: `# T\n\n## Answer\n\n${filler(5)}`,
      language: 'en',
      title: 'T',
      sources: [],
      layout: 'standard',
    })
    assert.equal(pdf.manifest.sections[0]?.role, 'body', 'the PDF and its manifest keep their own roles')
  })

  it('puts a leading answer before the contents, and nothing else', () => {
    assert.deepEqual(order(rich()).slice(0, 3), [
      'section id="executive-summary',
      'nav class="toc',
      'section id="findings',
    ])
    const later = page({ markdown: `# T\n\n## Background\n\n${filler(5)}\n\n## Summary\n\nx\n\n## End\n\ny` })
    assert.deepEqual(order(later).slice(0, 2), ['nav class="toc', 'section id="background'])
  })

  it('U11 · says how the report was made from what the record proves, the weak evidence first', () => {
    const method = textOf(slice(rich(), '<section class="method"', '</section>'))
    assert.equal(
      method,
      'How this report was made' +
        '1 of 5 cited sources is a search listing (snippets only), not a page that was opened.' +
        '1 of 5 cited sources was read only in part.' +
        '1 of 5 cited sources could not be read.' +
        'All 5 cited sources are ones this task retrieved or was given: Sophia checked each one when this version ' +
        'was published.' +
        'Not independently reviewed. Sophia checks that each citation points to a source the task could read, not ' +
        'that each claim matches its source.' +
        'This version does not record how many searches and page reads the research used.',
    )
    const bare = slice(page({ markdown: `# T\n\n## One\n\n${filler(9)}` }), '<section class="method"', '</section>')
    assert.ok(bare.includes('<li class="note">This report cites no sources.</li>'))
    assert.ok(bare.includes('<li class="note">This report states no limitations.</li>'))
    assert.ok(bare.includes('<li class="note"><strong>Not independently reviewed.</strong> Sophia checks'))
    assert.ok(bare.includes('<li class="note">This version does not record how many searches'))
    assert.doesNotMatch(bare, /class="(ok|warn)"/)
    for (const heading of [
      'Risks and limits',
      'Rischi e limiti',
      'Conclusions and limitations',
      'Sources and limitations',
    ]) {
      const named = page({ markdown: `# T\n\n## One\n\n${filler(9)}\n\n## ${heading}\n\nx` })
      assert.doesNotMatch(named, /states no limitations/, heading)
    }
    const one = textOf(slice(page({ markdown: `# T\n\nSee [${A}].` }), '<section class="method"', '</section>'))
    assert.ok(one.includes('The cited source is one this task retrieved or was given: Sophia checked it when'))
    // Every count is of cited sources, as the byline counts them: four citations of two sources are two.
    const twice = rich({ markdown: `# T\n\n## S\n\nOne [${C}], two [${D}], again [${C}] and [${D}].` })
    assert.ok(
      textOf(slice(twice, '<section class="method"', '</section>')).includes(
        '1 of 2 cited sources is a search listing (snippets only), not a page that was opened.' +
          '1 of 2 cited sources could not be read.' +
          'All 2 cited sources are ones this task retrieved or was given',
      ),
    )
  })

  it('U12 · writes the stored instants as UTC dates in the report’s words; a bad one prints nothing', () => {
    const byline = (html: string) => textOf(slice(html, '<dl class="byline">', '</dl>'))
    assert.equal(
      byline(rich()),
      'Published1 October 2026Version2Sources5 cited, 1 read in fullLength49 words · 1 min read',
    )
    assert.equal(
      byline(rich({ publishedAt: 'not a date' })),
      'Version2Sources5 cited, 1 read in fullLength49 words · 1 min read',
    )
    assert.equal(byline(rich({ publishedAt: '2026-13-45T00:00:00Z' })).startsWith('Version'), true)
    // Only ECMAScript's own format with a real date and time, which every engine reads alike; V8 alone would print
    // 30 February as 2 March and 24:00 as the next day.
    for (const odd of ['2026-02-30T00:00:00Z', '2026-10-02T24:00:00Z', '0000-01-01T00:00:00Z', '2026-10-02T09:16']) {
      assert.ok(byline(rich({ publishedAt: odd })).startsWith('Version'), odd)
    }
    assert.ok(byline(rich({ publishedAt: '2024-02-29T23:59:59.999Z' })).startsWith('Published29 February 2024'))
    assert.ok(byline(rich({ publishedAt: '2026-10-02T00:30+02:00' })).startsWith('Published1 October 2026'))
    assert.equal(
      byline(page({ versionNumber: null })),
      'Sources2 citedLength134 words · 1 min read',
      'statuses unknown',
    )
    const long = `# T\n\n## One\n\n${filler(1234)} [${A}]`
    assert.ok(byline(page({ markdown: long })).endsWith('Length1,236 words · 5 min read'))
    const one = `# T\n\nWord.`
    assert.ok(byline(page({ markdown: one })).endsWith('Length1 word · 1 min read'), 'one word, singular')
    const italian =
      '# Rapporto\n\n## Sintesi\n\nIl servizio della rete che offre anche il rendering, per questo sono gli ' +
      `strumenti delle opzioni nel progetto, alla fine degli studi [${A}].`
    const itPage = rich({ markdown: italian, publishedAt: '2026-01-31T23:00:00-01:00' })
    assert.ok(byline(itPage).startsWith('Pubblicato1 febbraio 2026Versione2Fonti1 citata, 1 letta per intero'))
    assert.ok(itPage.includes('<span>Rapporto di ricerca Sophia</span> · <span>versione 2</span>'))
    const itSources = RICH_SOURCES.map((s, i) => ({
      ...s,
      retrievedAt: `2026-10-${['08', '11', '01', '02', '03'][i] ?? '01'}T09:00:00.000Z`,
      ...(s.id === D ? { kind: 'search_results' as const } : {}),
    }))
    const itRich = rich({
      markdown: italian.replace(`[${A}]`, `[${A}] [${B}] [${C}] [${D}]`),
      sources: itSources,
      limitations: ['Prezzi di un solo giorno.'],
    })
    const itMeta = (n: number) => textOf(slice(itRich, `<li id="cite-${n}">`, '</li>'))
    assert.ok(itMeta(1).includes("Letta per intero · consultata l'8 ottobre 2026"), itMeta(1))
    assert.ok(itMeta(2).includes("consultata l'11 ottobre 2026"))
    assert.ok(itMeta(3).includes('consultata il 1 ottobre 2026'))
    const itMethod = textOf(slice(itRich, '<section class="method"', '</section>'))
    assert.ok(itMethod.includes('2 fonti citate su 4 sono elenchi di ricerca (solo anteprime), non pagine aperte.'))
    assert.ok(itMethod.includes('Questo compito ha recuperato o ricevuto tutte le 4 fonti citate: Sophia lo ha'))
    assert.ok(
      itRich.includes('<p class="aside">Così come dichiarati al momento della pubblicazione di questa versione.'),
    )
    const itOne = textOf(slice(itPage, '<section class="method"', '</section>'))
    assert.ok(itOne.includes('Questo compito ha recuperato o ricevuto la fonte citata: Sophia lo ha verificato'))
    const es =
      '# Informe\n\n## Resumen\n\nEl servicio que ofrece los informes para las empresas, como este proyecto, ' +
      `también está por encima de las opciones que son más caras [${B}] [${C}].`
    const esPage = rich({ markdown: es, publishedAt: '2026-07-04T12:00:00Z' })
    assert.ok(byline(esPage).startsWith('Publicado4 de julio de 2026Versión2Fuentes2 citadas, 0 leídas completas'))
    const esMethod = textOf(slice(esPage, '<section class="method"', '</section>'))
    assert.ok(
      esMethod.startsWith(
        'Cómo se hizo este informe1 de 2 fuentes citadas es una lista de búsqueda (solo fragmentos), no una página ' +
          'abierta.',
      ),
    )
    assert.ok(esMethod.includes('Esta tarea obtuvo o recibió las 2 fuentes citadas: Sophia lo comprobó'))
    const esSearch = rich({
      markdown: es.replace(`[${B}] [${C}]`, `[${C}] [${D}]`),
      sources: RICH_SOURCES.map((s) => (s.id === D ? { ...s, kind: 'search_results' as const } : s)),
    })
    assert.ok(
      textOf(slice(esSearch, '<section class="method"', '</section>')).includes(
        '2 de 2 fuentes citadas son listas de búsqueda (solo fragmentos), no páginas abiertas.',
      ),
    )
    assert.ok(esMethod.includes('1 de 2 fuentes citadas se leyó solo en parte.'))
    const esOne = rich({ markdown: es.replace(`[${B}] [${C}]`, `[${A}]`) })
    assert.ok(byline(esOne).includes('Fuentes1 citada, 1 leída completaExtensión'), 'one source, singular')
  })
})
