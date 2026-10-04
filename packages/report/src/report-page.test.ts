import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { renderReport } from './report-html.ts'
import { PAGE_CSS, PAGE_CSP, renderReportPage, reportLanguage, type ReportPageInput } from './report-page.ts'

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

describe('the report as a web page (html-report-v1)', () => {
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
    assert.equal(digest, '58e68697ee93a4d5028f2a1c999d31d14e40330d4a3b885e614fae8003b669dc')
    const html = page()
    assert.ok(html.includes('<meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light">'))
    assert.ok(PAGE_CSS.includes('body { max-width: 46rem; margin: 0 auto;'), 'a readable column on a screen')
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
    ].join('\n')
    const html = page({ markdown: md, title: '</title><script>x</script>' })
    assert.doesNotMatch(html, /<(script|img|iframe|object|embed|form|base|link)\b|<[^>]*\son\w+=|javascript:/i)
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.match(html, /\[image: chart\]/)
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
    assert.match(html, /It cites <sup class="cite"><a href="#cite-1">\[1\]<\/a><\/sup> and names 2\./)
    assert.match(html, /<li id="cite-1">/)
  })

  it('names the record it was printed from: the version and the Markdown hash', () => {
    assert.match(page(), new RegExp(`<footer class="provenance"><p>v3 · ${SHA.slice(0, 8)}</p></footer>\\n</body>`))
    assert.match(page(), new RegExp(`<meta name="sophia-markdown-sha256" content="${SHA}">`))
    assert.match(page(), /<meta name="generator" content="Sophia html-report-v1">/)
    assert.match(page({ versionNumber: null }), new RegExp(`<p>${SHA.slice(0, 8)}</p></footer>`))
  })

  it("speaks the report's own language when it is clear, else none", () => {
    const italian =
      '# Rapporto\n\n## Sintesi\n\nIl servizio della rete che offre anche il rendering, per questo sono gli ' +
      'strumenti delle opzioni nel progetto, alla fine degli studi.'
    assert.equal(reportLanguage(italian), 'it')
    assert.match(page({ markdown: italian }), /<html lang="it">[\s\S]*<p class="eyebrow">Rapporto<\/p>/)
    assert.equal(reportLanguage(REPORT), 'und', 'filler words name no language')
    assert.equal(reportLanguage('Short.'), 'und')
    const english =
      '# Report\n\n## Summary\n\nThe service is the one that renders, and this is from the team with the hosts, ' +
      'which are for the project of the year.'
    assert.equal(reportLanguage(english), 'en')
    assert.match(page({ markdown: english }), /<html lang="en">[\s\S]*<p class="eyebrow">Report<\/p>/)
    const spanish =
      '# Informe\n\n## Resumen\n\nEl servicio que ofrece los informes para las empresas, como este proyecto, ' +
      'también está por encima de las opciones que son más caras.'
    assert.equal(reportLanguage(spanish), 'es')
    const es = page({ markdown: spanish })
    assert.match(es, /<html lang="es">[\s\S]*<p class="eyebrow">Informe<\/p>/)
    assert.match(page({ markdown: `${spanish}\n\nVer [${A}].` }), /<h2>Fuentes<\/h2>/)
    const mixed = `${italian} The service of the rendering is that this is the one which is from the team and the host.`
    assert.equal(reportLanguage(mixed), 'und', 'no clear lead')
  })
})
