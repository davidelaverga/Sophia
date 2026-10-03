// A report as a web page (html-report-v1): the same parse and the same template parts as its PDF (report-html.ts),
// printed for a screen and saved by Studio as the report's HTML download. Nothing is stored: the page is printed from
// the version's Markdown after its hash is checked, with the sources the reader may read, so its numbering is the
// viewer's. A page never runs or loads anything: every string is escaped by the template, links keep http, https and
// mailto, images are named only, and its own policy forbids scripts and fetches even if that ever failed. The same
// input gives the same bytes. pdf-report-v1 (renderReport) is unchanged: its bytes are pinned by a test.
import { reportLanguage } from './language.ts'
import { REPORT_CSS } from './report-css.ts'
import { escapeHtml, printReport, type ReportSource } from './report-html.ts'

export { reportLanguage }

export const PAGE_PROFILE = 'html-report-v1'

/** The page's own policy: nothing loads, runs or submits, and only its inline stylesheet applies. */
export const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

/** On a screen, a readable column; print keeps pdf-report-v1's stylesheet as it is. */
const SCREEN_CSS = `
@media screen {
  html { background: #fff; }
  body { max-width: 46rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; font-size: 1.0625rem; }
  .toc { page-break-after: auto; }
  figure.table { overflow-x: auto; }
}
.provenance { margin: 3rem 0 0; padding-top: 0.75rem; border-top: 1px solid var(--rule); font-family: var(--font-sans); font-size: 0.8125rem; color: var(--ink-soft); }
`

export const PAGE_CSS = REPORT_CSS + SCREEN_CSS

export interface ReportPageInput {
  markdown: string
  /** The title when the report does not open with a level-1 heading. */
  title: string
  /** The sources the reader may read, titled as the viewer titles them. */
  sources: readonly ReportSource[]
  /** The ids a link may cite: the viewer's own (its version's sources), so the page numbers what the viewer does. */
  citable: readonly string[]
  /** The checked Markdown's sha256 and its version's number: a saved page names the record it came from. */
  sha256: string
  versionNumber: number | null
}

/** The page's head: its policy before anything the report wrote, then its record, title and stylesheet. */
function pageHead(title: string, sha256: string): string {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta name="color-scheme" content="light">',
    `<meta name="generator" content="Sophia ${PAGE_PROFILE}">`,
    `<meta name="sophia-markdown-sha256" content="${escapeHtml(sha256)}">`,
    `<title>${escapeHtml(title)}</title>`,
    `<style>${PAGE_CSS}</style>`,
  ].join('')
}

/** The report as one self-contained web page (see the header). Printed whatever its length: a page is not gated. */
export function renderReportPage(input: ReportPageInput): string {
  const language = reportLanguage(input.markdown)
  const printed = printReport({ ...input, language, layout: 'standard' })
  const record = [input.versionNumber === null ? null : `v${input.versionNumber}`, input.sha256.slice(0, 8)]
  const foot = `<footer class="provenance"><p>${escapeHtml(record.filter((x) => x !== null).join(' · '))}</p></footer>`
  return (
    `<!doctype html>\n<html lang="${escapeHtml(language)}"><head>${pageHead(printed.title, input.sha256)}</head>\n` +
    `<body class="standard">\n${[...printed.body, foot].join('\n')}\n</body></html>\n`
  )
}
