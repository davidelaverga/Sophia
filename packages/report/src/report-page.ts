// A report as a web page (html-report-v2): the same parse and the same template parts as its PDF (report-html.ts),
// printed for a reader and saved by Studio as the report's HTML download. Nothing is stored: the page is printed from
// the version's Markdown after its hash is checked, with the sources the reader may read, so its numbering is the
// viewer's. A page never runs or loads anything: every string is escaped, links keep http, https and mailto, images are
// named only, and its own policy forbids scripts and fetches even if that ever failed. The same input gives the same
// bytes, on any machine and in any time zone: dates are the stored ISO timestamps written in UTC, with no clock and no
// Intl. pdf-report-v1 (renderReport) is unchanged: its bytes are pinned by a test.
//
// The page is a pass over printReport's parts, made on strings: escaped text never holds "<", so every pattern below
// meets the template's own markup only. It binds each citation to the word before it as a bare numeral (adjacent ones
// grouped, a weak source dotted and named), gives a section a page role its heading names (an answer, limitations),
// puts a leading answer before the contents, and adds what Studio already holds of the version: when it was published,
// what was read of each source and when, the limitations it stored, and what Sophia checked when it was published.
// A part whose input is absent is not printed; the page never prints a fact the record does not hold.
import { safeHref } from './markdown.ts'
import { PAGE_CSS } from './page-css.ts'
import { pageWords, type PageWords, type Status } from './page-words.ts'
import { escapeHtml, printReport, type PrintedReport, type ReportSource } from './report-html.ts'

export { PAGE_CSS }

export const PAGE_PROFILE = 'html-report-v2'

/** The page's own policy: nothing loads, runs or submits, and only its inline stylesheet applies. */
export const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

/** A source the reader may read, with what the version's record says of it (the API's ReportSource). */
export interface PageSource extends ReportSource {
  kind?: 'search_results' | 'web_read' | 'input'
  coverage?: 'complete' | 'partial' | 'unsupported' | null
  /** When it was read, ISO; printed as a UTC date. */
  retrievedAt?: string | null
  /** What the reading could not cover, as stored. */
  limitations?: readonly string[]
}

export interface ReportPageInput {
  markdown: string
  /** The title when the report does not open with a level-1 heading. */
  title: string
  /** The sources the reader may read, titled as the viewer titles them. */
  sources: readonly PageSource[]
  /** The ids a link may cite: the viewer's own (its version's sources), so the page numbers what the viewer does. */
  citable: readonly string[]
  /** The checked Markdown's sha256 and its version's number: a saved page names the record it came from. */
  sha256: string
  versionNumber: number | null
  /** When the version was published (its createdAt), ISO; printed as a UTC date. */
  publishedAt?: string | null
  /** The limitations the version stored when it was published. */
  limitations?: readonly string[]
}

const STOPWORDS: readonly [string, ReadonlySet<string>][] = [
  ['en', new Set(['the', 'and', 'of', 'to', 'is', 'that', 'with', 'are', 'this', 'for', 'from', 'which'])],
  ['it', new Set(['il', 'della', 'che', 'gli', 'delle', 'nel', 'sono', 'anche', 'questo', 'degli', 'alla', 'per'])],
  ['es', new Set(['el', 'los', 'las', 'que', 'para', 'por', 'como', 'más', 'está', 'también', 'este', 'son'])],
]

/**
 * The report's language, from its own words: English, Italian or Spanish when one clearly leads (at least 8 of its
 * common words, twice the next), else `und` (the template's words are then English).
 */
export function reportLanguage(markdown: string): string {
  const counts = new Map(STOPWORDS.map(([lang]) => [lang, 0]))
  for (const word of markdown.toLowerCase().match(/\p{L}+/gu) ?? []) {
    for (const [lang, words] of STOPWORDS) if (words.has(word)) counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  const [first, second] = [...counts].toSorted((a, b) => b[1] - a[1])
  return first && first[1] >= 8 && first[1] >= 2 * (second?.[1] ?? 0) ? first[0] : 'und'
}

const esc = escapeHtml

/** A source read only in part, only as a search snippet, or not at all: its citations are dotted. */
const WEAK: ReadonlySet<Status> = new Set(['part', 'snippet', 'unread'])
const isWeak = (status: Status | null) => status !== null && WEAK.has(status)
/** The order of the evidence mix under Sources. */
const MIX: readonly Status[] = ['full', 'part', 'snippet', 'unread', 'project']

/** What was read of a source, from its stored provenance (as Studio's Sources tab says it); unknown without a kind. */
function statusOf(source: PageSource | undefined): Status | null {
  if (!source?.kind) return null
  if (source.kind === 'input') return 'project'
  if (source.kind === 'search_results') return 'snippet'
  if (source.coverage === 'complete') return 'full'
  return source.coverage === 'partial' ? 'part' : 'unread'
}

/** A stored ISO timestamp (with its zone) as a date in the page's words, in UTC; null when it is not one. */
function dateOf(iso: string | null | undefined, words: PageWords): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(iso)) return null
  const t = new Date(Date.parse(iso))
  return Number.isNaN(t.getTime()) ? null : words.date(t.getUTCDate(), t.getUTCMonth(), t.getUTCFullYear())
}

/** A heading the page reads as limitations, or as the answer (a body section by printReport's own roles). */
const LIMITS = /\b(limitations?|caveats?|limitazioni|limitaciones|salvedades)\b|^(limits|limiti|l[ií]mites)\b/i
const ANSWER = /^(the )?(answer|bottom line|key findings|risposta|in breve|respuesta|en resumen)\b/i

function pageRole(role: string, title: string): string {
  if (role !== 'body') return role
  if (LIMITS.test(title)) return 'limitations'
  return ANSWER.test(title) ? 'summary' : role
}

/** The pass over printed markup: what it numbers in what words, and the numbers already printed once. */
interface Pass {
  words: PageWords
  /** Each citation's status, by its number less one. */
  status: readonly (Status | null)[]
  /** Only a number's first citation carries the id its source links back to. */
  seen: Set<number>
}

function citeLink(n: number, pass: Pass): string {
  const status = pass.status[n - 1] ?? null
  const weak = status !== null && isWeak(status) ? pass.words.status[status].toLowerCase() : null
  const id = pass.seen.has(n) ? '' : ` id="ref-${n}"`
  pass.seen.add(n)
  const label = esc(pass.words.cite(n, weak))
  return `<a href="#cite-${n}"${id}${weak === null ? '' : ' class="weak"'} aria-label="${label}">${n}</a>`
}

/**
 * Citations as bare numerals bound to the word before them (the space before them dropped), adjacent ones in one
 * group that wraps between numerals only; an image named in the page's words; a table a named region the keyboard
 * can scroll.
 */
function pagePass(html: string, pass: Pass): string {
  return html
    .replace(/[ \u00a0]+(?=<sup class="cite">)/g, '')
    .replace(/(?:<sup class="cite"><a href="#cite-\d+">\[\d+\]<\/a><\/sup>)+/g, (run) => {
      const links = [...run.matchAll(/#cite-(\d+)/g)].map((m) => citeLink(Number(m[1]), pass))
      return `<sup class="cite">${links.join('<span class="sep">,</span><wbr>')}</sup>`
    })
    .replace(
      /\[image: ([^\]<]*)\]/g,
      (_, alt: string) => `<span class="omitted">${esc(pass.words.image)}: ${alt}</span>`,
    )
    .replace(
      /<figure class="table" data-visual-id="table-(\d+)">/g,
      (open: string, k: string) =>
        `${open.slice(0, -1)} tabindex="0" role="region" aria-label="${esc(pass.words.table)} ${k}">`,
    )
}

/** The citation numbers a part's markup holds. */
const numsOf = (html: string): ReadonlySet<number> =>
  new Set([...html.matchAll(/href="#cite-(\d+)"/g)].map((m) => Number(m[1])))

interface PageSection {
  id: string
  role: string
  title: string
  html: string
  nums: ReadonlySet<number>
}

/** printReport's sections, each under its page role and passed (after the lead, so ids follow reading order). */
function pageSections(printed: PrintedReport, pass: Pass): PageSection[] {
  return printed.body
    .filter((part) => part.startsWith('<section id="'))
    .map((html, i) => {
      const entry = printed.manifest.sections[i]
      const id = entry?.id ?? ''
      const title = entry?.title ?? ''
      const role = pageRole(/ data-report-role="([a-z]+)"/.exec(html)?.[1] ?? 'body', title)
      const out = pagePass(html.replace(/^(<section id="[^"]+" data-report-role=")[a-z]+"/, `$1${role}"`), pass)
      return { id, role, title, html: out, nums: numsOf(out) }
    })
}

/**
 * The limitations the version stored, as a section of their own when the report wrote none: after the last body or
 * summary section, before the conclusion or references that follow it.
 */
function withStoredLimitations(sections: PageSection[], stored: readonly string[], words: PageWords): PageSection[] {
  const lines = stored.map((l) => l.trim()).filter((l) => l !== '')
  if (lines.length === 0 || sections.some((s) => s.role === 'limitations')) return sections
  const items = lines.map((l) => `<li>${esc(l)}</li>`).join('')
  const section: PageSection = {
    id: 'report-limitations',
    role: 'limitations',
    title: words.limitations,
    html:
      `<section id="report-limitations" data-report-role="limitations"><h2>${esc(words.limitations)}</h2>\n` +
      `<p class="aside">${esc(words.limitsLead)}</p><ul>${items}</ul></section>`,
    nums: new Set(),
  }
  const lastBody = sections.findLastIndex((s) => s.role === 'body' || s.role === 'summary')
  const at = sections.findIndex((s, i) => i > lastBody && (s.role === 'conclusion' || s.role === 'references'))
  return at === -1 ? [...sections, section] : [...sections.slice(0, at), section, ...sections.slice(at)]
}

/** Everything the page's own parts are written from, once the report's parts are passed. */
interface Page {
  words: PageWords
  printed: PrintedReport
  input: ReportPageInput
  /** The sources by id, as the citations name them (lower case). */
  known: ReadonlyMap<string, PageSource>
  status: readonly (Status | null)[]
  /** The numbers the lead cites, and the numbers whose first citation carries `ref-N`. */
  lead: ReadonlySet<number>
  seen: ReadonlySet<number>
  sections: readonly PageSection[]
}

const headingOf = (part: string) => /<h2>([^<]*)<\/h2>/.exec(part)?.[1] ?? ''
const whole = <T>(list: readonly (T | null)[]): T[] => list.filter((x) => x !== null)

/**
 * An address as typeset text: the scheme kept, the host marked, and a break opportunity after each "/" of the path
 * and before "?", "&", "#" and "=". The raw address is split first and each piece escaped, so a break never lands
 * inside an entity. The path is shown decoded (the link keeps it escaped); one that does not decode is shown as given.
 */
function typesetUrl(href: string): string {
  const m = /^(https?:\/\/)([^/?#]*)(.*)$/.exec(href)
  if (!m) return esc(href)
  const [, scheme = '', host = '', raw = ''] = m
  let path = raw
  try {
    path = decodeURI(raw)
  } catch {
    // A malformed escape: the path stays as the address has it.
  }
  const pieces = path.split(/(?<=\/)(?=.)|(?=[?&#=])/u).map((p) => esc(p))
  return `${esc(scheme)}<span class="host">${esc(host)}</span>${pieces.join('<wbr>')}`
}

/** Where source `n` is cited: the introduction (the lead) and each section that cites it, as links. */
function citedIn(page: Page, n: number): string | null {
  const where = page.lead.has(n) ? [`<a href="#report-title">${esc(page.words.intro)}</a>`] : []
  for (const s of page.sections) {
    if (s.nums.has(n) && s.role !== 'references') where.push(`<a href="#${esc(s.id)}">${esc(s.title)}</a>`)
  }
  return where.length > 0 ? `${esc(page.words.citedIn)} ${where.join(', ')}` : null
}

/** What was read of source `n` and when, and where it is cited; each part only when it is known. */
function sourceMeta(page: Page, n: number, source: PageSource | undefined): string | null {
  const status = page.status[n - 1] ?? null
  const date = status === 'project' ? null : dateOf(source?.retrievedAt, page.words)
  const meta = whole([
    status === null
      ? null
      : `<span class="status${isWeak(status) ? ' weak' : ''}">${esc(page.words.status[status])}</span>`,
    date === null ? null : esc(page.words.retrieved(date)),
    citedIn(page, n),
  ])
  return meta.length > 0 ? `<span class="src-meta">${meta.join(' · ')}</span>` : null
}

/**
 * Source `n` in the bibliography: its number links back to its first citation (or to the title block, when only the
 * title cites it), then its title as printReport printed it, its meta, its address and its stored limitations.
 */
function sourceItem(page: Page, n: number, title: string): string {
  const source = page.known.get(page.printed.citations[n - 1] ?? '')
  const back = page.seen.has(n) ? `ref-${n}` : 'report-title'
  const href = source?.url ? safeHref(source.url) : null
  const notes = (source?.limitations ?? []).map((l) => l.trim()).filter((l) => l !== '')
  return [
    `<li id="cite-${n}"><a class="back" href="#${back}" aria-label="${esc(page.words.back(n))}">${n}</a>`,
    `<span class="src-title">${title}</span>`,
    sourceMeta(page, n, source) ?? '',
    href === null ? '' : `<a class="url" href="${esc(href)}">${typesetUrl(href)}</a>`,
    notes.length === 0 ? '' : `<ul class="src-notes">${notes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
    '</li>',
  ].join('')
}

/** One sentence on the evidence by status, only when every cited source's status is known; then the dotted key. */
function evidenceMix(page: Page): string {
  const known = whole(page.status)
  if (known.length < page.status.length) return ''
  const count = (status: Status) => known.filter((s) => s === status).length
  const mix = MIX.filter((s) => count(s) > 0).map((s) => `${count(s)} ${page.words.mix[s](count(s))}`)
  const key = known.some(isWeak) ? ` ${esc(page.words.weakKey)}` : ''
  return `<p class="src-summary">${esc(`${page.words.mixHead(known.length)}: ${mix.join(', ')}.`)}${key}</p>`
}

/** The bibliography: printReport's heading and titles, with the evidence the record holds for each source. */
function sourcesSection(page: Page, part: string): string {
  const titles = new Map([...part.matchAll(/<li id="cite-(\d+)">([^<]*)/g)].map((m) => [Number(m[1]), m[2] ?? '']))
  const items = page.printed.citations.map((_, k) => sourceItem(page, k + 1, titles.get(k + 1) ?? ''))
  return (
    `<section class="sources" id="report-sources" data-report-role="references"><h2>${headingOf(part)}</h2>` +
    `${evidenceMix(page)}<ol>${items.join('')}</ol></section>`
  )
}

/**
 * How the report was made, from what the record proves today: the weak evidence first, each with its denominator;
 * the publish gate's fact; that nobody reviewed it; and what this version does not record.
 */
function methodSection(page: Page): string {
  const { words, status } = page
  const n = status.length
  const count = (s: Status) => status.filter((x) => x === s).length
  const lines: [string, string][] = []
  if (count('snippet') > 0) lines.push(['warn', esc(words.snippets(count('snippet'), n))])
  if (count('part') > 0) lines.push(['warn', esc(words.partial(count('part'), n))])
  if (count('unread') > 0) lines.push(['warn', esc(words.unread(count('unread'), n))])
  lines.push(n > 0 ? ['ok', esc(words.gate(n))] : ['note', esc(words.noCites)])
  lines.push(['note', `<strong>${esc(words.review[0])}</strong> ${esc(words.review[1])}`])
  if (!page.sections.some((s) => s.role === 'limitations')) lines.push(['note', esc(words.noLimits)])
  lines.push(['note', esc(words.noRecord)])
  const items = lines.map(([kind, text]) => `<li class="${kind}">${text}</li>`).join('')
  return (
    `<section class="method" id="report-method" data-report-role="method"><h2>${esc(words.method)}</h2>` +
    `<ul class="checks">${items}</ul></section>`
  )
}

/** A section counts its distinct sources in the contents when it argues from them: body and limitations. */
const counted = (s: PageSection) => (s.role === 'body' || s.role === 'limitations') && s.nums.size > 0

/** The contents: the sections (not the references) with their source counts, then the sources and the method. */
function contentsNav(page: Page, part: string, sources: string | null): string {
  const rows = page.sections
    .filter((s) => s.role !== 'references')
    .map((s) => {
      const count = counted(s) ? `<span class="n">${s.nums.size}</span>` : ''
      return `<li><a href="#${esc(s.id)}">${esc(s.title)}</a>${count}</li>`
    })
  if (sources !== null) rows.push(`<li class="aux"><a href="#report-sources">${headingOf(sources)}</a></li>`)
  rows.push(`<li class="aux"><a href="#report-method">${esc(page.words.method)}</a></li>`)
  const key = page.sections.some(counted) ? `<p class="toc-key">${esc(page.words.key)}</p>` : ''
  return (
    `<nav class="toc" id="report-contents" data-report-role="toc"><h2>${headingOf(part)}</h2>${key}` +
    `<ol>${rows.join('')}</ol></nav>`
  )
}

/** The title block: the masthead, the title and the byline (published, version, sources, length), each when known. */
function titleBlock(page: Page): string {
  const { words, status, input } = page
  const published = dateOf(input.publishedAt, words)
  // How many were read in full, said only when what was read of every cited source is known.
  const full = whole(status).length === status.length ? status.filter((s) => s === 'full').length : null
  const length = page.printed.manifest.words
  const cell = (dt: string, dd: string) => `<div><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`
  const cells = whole([
    published === null ? null : cell(words.published, published),
    input.versionNumber === null ? null : cell(words.version, String(input.versionNumber)),
    status.length > 0 ? cell(words.sources, words.cited(status.length, full)) : null,
    cell(words.length, words.size(length, Math.max(1, Math.round(length / 230)))),
  ])
  return (
    `<header class="title-block" id="report-title"><p class="eyebrow">${esc(words.kicker)}</p>` +
    `<h1>${esc(page.printed.title)}</h1><dl class="byline">${cells.join('')}</dl></header>`
  )
}

/** The colophon: the record the page was printed from, in words. */
function colophon(words: PageWords, input: ReportPageInput): string {
  const record = whole([
    esc(words.colophon),
    input.versionNumber === null ? null : `${esc(words.version.toLowerCase())} ${input.versionNumber}`,
    `${esc(words.hash)} <span class="hash">${esc(input.sha256.slice(0, 12))}</span>`,
    PAGE_PROFILE,
  ])
  return `<footer class="provenance"><p>${record.map((r) => `<span>${r}</span>`).join(' · ')}</p></footer>`
}

/** The page's head: its policy before anything the report wrote, then its record, title and stylesheet. */
function pageHead(title: string, sha256: string): string {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta name="color-scheme" content="light dark">',
    `<meta name="generator" content="Sophia ${PAGE_PROFILE}">`,
    `<meta name="sophia-markdown-sha256" content="${esc(sha256)}">`,
    `<title>${esc(title)}</title>`,
    `<style>${PAGE_CSS}</style>`,
  ].join('')
}

/** printReport's parts passed for the page, in reading order, with what the page's own parts are written from. */
function passParts(input: ReportPageInput, words: PageWords, printed: PrintedReport) {
  const known = new Map(input.sources.map((s) => [s.id.toLowerCase(), s]))
  const status = printed.citations.map((id) => statusOf(known.get(id)))
  const pass: Pass = { words, status, seen: new Set() }
  const part = (prefix: string) => printed.body.find((p) => p.startsWith(prefix)) ?? null
  const leadPart = part('<div class="lead">')
  const lead = leadPart === null ? null : pagePass(leadPart, pass)
  const sections = withStoredLimitations(pageSections(printed, pass), input.limitations ?? [], words)
  const page: Page = { words, printed, input, known, status, lead: numsOf(lead ?? ''), seen: pass.seen, sections }
  return { page, lead, nav: part('<nav class="toc"'), sources: part('<section class="sources"') }
}

/** The report as one self-contained web page (see the header). Printed whatever its length: a page is not gated. */
export function renderReportPage(input: ReportPageInput): string {
  const language = reportLanguage(input.markdown)
  const words = pageWords(language)
  const printed = printReport({ ...input, language, layout: 'standard' })
  const { page, lead, nav, sources } = passParts(input, words, printed)
  // The answer comes first: a leading summary goes before the contents.
  const first = page.sections[0]?.role === 'summary' ? 1 : 0
  const main = whole([
    '<main>',
    lead,
    ...page.sections.slice(0, first).map((s) => s.html),
    nav === null ? null : contentsNav(page, nav, sources),
    ...page.sections.slice(first).map((s) => s.html),
    sources === null ? null : sourcesSection(page, sources),
    methodSection(page),
    '</main>',
  ])
  return (
    `<!doctype html>\n<html lang="${esc(language)}"><head>${pageHead(printed.title, input.sha256)}</head>\n` +
    `<body class="standard">\n${[titleBlock(page), ...main, colophon(words, input)].join('\n')}\n</body></html>\n`
  )
}
