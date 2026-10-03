import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { anchorOf } from './markdown.ts'
import { MAX_REPORT_PARTS, MIN_REPORT_WORDS, renderReport, type ReportInput } from './report-html.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

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

### Detail

More detail.

## Conclusion

${filler(30)}
`

const input = (extra: Partial<ReportInput> = {}): ReportInput => ({
  markdown: REPORT,
  language: 'en',
  title: 'Fallback title',
  sources: [
    { id: A, title: 'Alpha docs', url: 'https://alpha.test/docs?q=1&x=2' },
    { id: B, title: null, url: null },
  ],
  layout: 'standard',
  ...extra,
})

const failed = (doc: ReturnType<typeof renderReport>) =>
  doc.checks.filter((c) => c.outcome === 'failed').map((c) => c.name)

describe('the PDF report template (pdf-report-v1, report_manifest_v1)', () => {
  it('prints one self-contained document, the same bytes for the same input', () => {
    const doc = renderReport(input())
    assert.equal(doc.html, renderReport(input()).html)
    assert.ok(doc.html.startsWith('<!doctype html>\n<html lang="en">'))
    assert.match(doc.html, /<style>[\s\S]*--accent[\s\S]*<\/style>/)
    assert.doesNotMatch(doc.html, /<(script|img|link|iframe|object|embed)\b/i, 'nothing that runs or loads')
    assert.deepEqual(failed(doc), [])
    assert.equal(doc.accepted, true)
  })

  it('takes the title from a leading level-1 heading, else from the input', () => {
    assert.equal(renderReport(input()).manifest.title, 'Hosts that render PDFs')
    const untitled = renderReport(input({ markdown: REPORT.replace(/^# .*\n/, '') }))
    assert.equal(untitled.manifest.title, 'Fallback title')
    assert.match(untitled.html, /<h1>Fallback title<\/h1>/)
  })

  it('makes a section of each top-level heading, with the anchor the service computes and a role', () => {
    const { manifest, html } = renderReport(input())
    assert.deepEqual(
      manifest.sections.map((s) => [s.id, s.role]),
      [
        ['executive-summary', 'summary'],
        ['findings', 'body'],
        ['conclusion', 'conclusion'],
      ],
    )
    assert.equal(manifest.sections[1]?.id, anchorOf('Findings'))
    assert.match(html, /<section id="findings" data-report-role="body"><h2>Findings<\/h2>/)
    assert.match(html, /<h3>Detail<\/h3>/, 'a deeper heading stays under its section')
    assert.match(
      html,
      /<p>Which hosts can run a confined renderer, and at what cost.<\/p>/,
      'the lead before the first section',
    )
  })

  it('prints sections at h2 whatever level the report used for them', () => {
    const md = `# T\n\n### One\n\n${filler(60)}\n\n#### Deeper\n\n### Two\n\n${filler(60)}\n`
    const { html, manifest } = renderReport(input({ markdown: md }))
    assert.deepEqual(
      manifest.sections.map((s) => s.title),
      ['One', 'Two'],
    )
    assert.match(html, /<h2>One<\/h2>/)
    assert.match(html, /<h3>Deeper<\/h3>/)
  })

  it("keeps every id unique: repeated headings, and headings named like the template's own parts", () => {
    const md = `# T\n\n## Notes\n\n${filler(40)}\n\n## Notes\n\n${filler(40)}\n\n## Report title\n\n${filler(30)} [${A}]\n\n## Cite 1\n\nx\n`
    const doc = renderReport(input({ markdown: md }))
    assert.deepEqual(
      doc.manifest.sections.map((s) => s.id),
      ['notes', 'notes-2', 'report-title-2', 'cite-1-2'],
    )
    assert.deepEqual(failed(doc), [])
  })

  it('prints contents from three sections, each linking to its section', () => {
    const doc = renderReport(input())
    assert.equal(doc.manifest.toc, true)
    assert.match(doc.html, /<nav class="toc" id="report-contents" data-report-role="toc"><h2>Contents<\/h2>/)
    for (const s of doc.manifest.sections) assert.ok(doc.html.includes(`<a href="#${s.id}">`))
    const short = renderReport(input({ markdown: `# T\n\n## One\n\n${filler(60)}\n\n## Two\n\n${filler(60)}\n` }))
    assert.equal(short.manifest.toc, false)
    assert.doesNotMatch(short.html, /report-contents/)
  })

  it('prints tables as identified figures, with their alignment', () => {
    const { manifest, html } = renderReport(input())
    assert.deepEqual(manifest.visuals, [{ id: 'table-1', kind: 'table', section: 'findings' }])
    assert.match(
      html,
      /<figure class="table" data-visual-id="table-1"><table><thead><tr><th class="al-left">Host<\/th>/,
    )
    assert.match(html, /<td class="al-center">yes<\/td><td class="al-right">7<\/td>/)
  })

  it('numbers citations and lists the cited sources, with a link only for an http(s) URL', () => {
    const doc = renderReport(input())
    assert.equal(doc.manifest.citations, 2)
    assert.match(doc.html, /<sup class="cite"><a href="#cite-1">\[1\]<\/a><\/sup>/)
    assert.match(
      doc.html,
      /<section class="sources" id="report-sources" data-report-role="references"><h2>Sources<\/h2>/,
    )
    assert.match(
      doc.html,
      /<li id="cite-1">Alpha docs<br><a class="url" href="https:\/\/alpha.test\/docs\?q=1&amp;x=2">/,
      'the URL is escaped',
    )
    assert.match(doc.html, new RegExp(`<li id="cite-2">${B}</li>`), 'a source without a title is named by its id')
  })

  it('refuses a citation the service did not resolve', () => {
    const doc = renderReport(input({ markdown: `${REPORT}\nAlso [${C}].\n` }))
    assert.deepEqual(failed(doc), ['citations_resolved'])
    assert.equal(doc.accepted, false)
    assert.match(doc.html, /<li id="cite-3">Source not available<\/li>/)
  })

  it('numbers a citation the report wrote as a link, and still refuses one the service did not resolve', () => {
    const doc = renderReport(input({ markdown: REPORT.replace(`[${A}]`, `[1](<${A}>)`) }))
    assert.equal(doc.manifest.citations, 2)
    assert.match(doc.html, /<sup class="cite"><a href="#cite-1">\[1\]<\/a><\/sup>/)
    assert.equal(doc.accepted, true)
    assert.deepEqual(failed(renderReport(input({ markdown: `${REPORT}\nAlso [3](${C}).\n` }))), ['citations_resolved'])
  })

  it('keeps ids and titles bounded, and refuses a report with too many sections', () => {
    const long = 'Word '.repeat(400)
    const doc = renderReport(input({ markdown: `# T\n\n## ${long}\n\n${filler(120)}\n` }))
    const [section] = doc.manifest.sections
    assert.ok((section?.id.length ?? 0) <= 80 && !section?.id.endsWith('-'))
    assert.equal(section?.title.length, 300)
    const many = Array.from({ length: MAX_REPORT_PARTS + 1 }, (_, i) => `## S${i}\n\nx`).join('\n\n')
    assert.deepEqual(failed(renderReport(input({ markdown: `# T\n\n${filler(120)}\n\n${many}` }))), ['report_size'])
  })

  it('refuses a report without sections, or with too few words', () => {
    assert.deepEqual(failed(renderReport(input({ markdown: `# T\n\n${filler(150)}\n` }))), ['report_sections'])
    const thin = renderReport(input({ markdown: `# T\n\n## A\n\nfew words here\n` }))
    assert.deepEqual(failed(thin), ['report_words'])
    assert.match(thin.checks.find((c) => c.name === 'report_words')?.detail ?? '', new RegExp(`${MIN_REPORT_WORDS}`))
  })

  it('escapes everything the report wrote: raw HTML, attributes and link targets', () => {
    const md = [
      '# <b>T</b>',
      '',
      '## A "quoted" <i>head</i>',
      '',
      `<script>alert(1)</script> ${filler(120)}`,
      '',
      '[click](javascript:alert(1)) [ok](https://ok.test/"onmouseover="x) ![chart](https://evil.test/p.png)',
      '',
      '```',
      '</code></pre><script>x</script>',
      '```',
    ].join('\n')
    const { html } = renderReport(input({ markdown: md }))
    assert.doesNotMatch(html, /<script|<b>|<i>|javascript:|<img/i)
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.match(html, /<h2>A &quot;quoted&quot; &lt;i&gt;head&lt;\/i&gt;<\/h2>/)
    assert.match(html, /<a href="https:\/\/ok.test\/%22onmouseover=%22x">ok<\/a>/)
    assert.match(html, /\[image: chart\]/, 'an image is named, never loaded')
    assert.match(html, /<pre><code>&lt;\/code&gt;&lt;\/pre&gt;&lt;script&gt;x&lt;\/script&gt;<\/code><\/pre>/)
  })

  it("speaks the report's language in its own words, and prints the compact layout", () => {
    const italian = renderReport(input({ language: 'it-IT', layout: 'compact' }))
    assert.match(italian.html, /<html lang="it-IT">/)
    assert.match(italian.html, /<p class="eyebrow">Rapporto<\/p>/)
    assert.match(italian.html, /<h2>Indice<\/h2>/)
    assert.match(italian.html, /<h2>Fonti<\/h2>/)
    assert.match(italian.html, /<body class="compact">/)
    assert.match(renderReport(input({ language: 'es' })).html, /<h2>Fuentes<\/h2>/)
    assert.match(renderReport(input({ language: 'fr' })).html, /<h2>Sources<\/h2>/, 'English for any other language')
    const roles = renderReport(
      input({
        markdown: `# T\n\n## Sintesi\n\n${filler(40)}\n\n## Analisi\n\n${filler(40)}\n\n## Conclusiones\n\n${filler(30)}\n`,
      }),
    ).manifest.sections.map((s) => s.role)
    assert.deepEqual(roles, ['summary', 'body', 'conclusion'])
  })

  it("counts the words a reader sees, never the template's own", () => {
    const md = `# Title words\n\n## Head\n\n${filler(MIN_REPORT_WORDS)}\n`
    const doc = renderReport(input({ markdown: md }))
    assert.equal(doc.manifest.words, MIN_REPORT_WORDS + 1, 'the section heading and its text, not the title or labels')
    assert.deepEqual(failed(doc), [])
  })
})
