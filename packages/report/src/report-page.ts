// A report as a web page (html-report-v2): the same parse and the same template parts as its PDF (report-html.ts),
// printed for a reader and saved by Studio as the report's HTML download. Nothing is stored: the page is printed from
// the version's Markdown after its hash is checked, with the sources the reader may read, so its numbering is the
// viewer's. A page never runs or loads anything: every string is escaped, links keep http, https and mailto, images are
// named only, and its own policy forbids scripts and fetches even if that ever failed. The same input gives the same
// bytes, on any machine and in any time zone: dates are the stored ISO timestamps written in UTC, with no clock and no
// Intl. pdf-report-v1 (renderReport) is unchanged: its bytes are pinned by a test.
//
// The page is a pass over printReport's parts, made on strings: escaped text never holds "<", so every pattern below
// that looks for markup meets the template's own (the one that looks for words, an image's, skips every tag). It
// binds each citation to the word before it as a bare numeral (adjacent ones grouped, a weak source dotted and named),
// gives a section a page role its heading names (an answer, limitations) and a new id when one of the page's own parts
// uses its id (a heading "Report method" or "Ref 1"), puts a leading answer before the contents,
// and adds what Studio already holds of the version: when it was published, what was read of each source and when,
// the limitations it stored, and what Sophia checked when it was published. A part whose input is absent is not
// printed; the page never prints a fact the record does not hold.
//
// What this page is not (M75): a designed deliverable. It is one fixed template applied to a version's Markdown, with
// no designer, no render review and no stored HTML. It stays as the seed and comparison control for SDD-01's native
// design, and as legacy compatibility for the "HTML page" downloads Studio already offers; a newly requested HTML
// deliverable is SDD-01's to design (docs/coordination/M75/HANDOFF_TO_SDD01.md). Its passes are written for
// printReport's own markup, which escaped text cannot imitate: authored HTML must never be passed through them.
import { reportLanguage } from './language.ts'
import { safeHref } from './markdown.ts'
import { PAGE_CSS } from './page-css.ts'
import { pageWords, type PageWords, type Status } from './page-words.ts'
import { escapeHtml, printReport, type PrintedReport, type ReportSource } from './report-html.ts'

export { PAGE_CSS, reportLanguage }

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

/**
 * ECMAScript's date-time format, as the API's toISOString writes it (seconds and milliseconds optional, a zone
 * required), with a time of day in range. Every engine reads such a string alike; an impossible one each reads its own
 * way (V8 turns 30 February into 2 March), so the page would print different bytes in different browsers.
 */
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{3})?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/

/** A stored ISO timestamp (with its zone) as a date in the page's words, in UTC; null when it is not one. */
function dateOf(iso: string | null | undefined, words: PageWords): string | null {
  const m = INSTANT.exec(iso ?? '')
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  // A day the calendar lacks (30 February, a 13th month) or a year before 100 does not come back from Date.UTC.
  const check = new Date(Date.UTC(year, month, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) return null
  const t = new Date(Date.parse(m[0]))
  return words.date(t.getUTCDate(), t.getUTCMonth(), t.getUTCFullYear())
}

/**
 * A heading the page reads as limitations, or as the answer (a body section by printReport's own roles). Italian and
 * Spanish headings name them with their article (M75): "I limiti", "Los límites", "The limits" read as limitations
 * when the article and the word are the whole heading; "La risposta", "La respuesta" and "The answer" read as the
 * answer as "Answer" does. These read a heading's words, not what the section says, so they decide only how a section
 * is set (its amber rule, the answer first), the method's "states no limitations" and the stored section's title:
 * never which stored limitations are printed (M75: "Limits of liability" read as limitations and the page dropped them).
 */
const LIMITS =
  /\b(limitations?|caveats?|limitazioni|limitaciones|salvedades)\b|^(limits|limiti|l[ií]mites)\b|^(the|i|los)\s+(limits|limiti|l[ií]mites)\s*[.:]?\s*$/i
/** "Limits" further in: joined to risks or scope, or known ("Rischi e limiti", "I rischi e i limiti"), never alone. */
const JOINED =
  /\b(known|(risks|scope|rischi|ambit[oi]|riesgos|alcance)(,|\s+(and|e|y|&)))\s+((the|i|los)\s+)?(limits|limiti|l[ií]mites)\b/i
const ANSWER = /^((the|la)\s+)?(answer|bottom line|key findings|risposta|in breve|respuesta|en resumen)\b/i

const namesLimits = (title: string) => LIMITS.test(title) || JOINED.test(title)

function pageRole(role: string, title: string): string {
  if (role !== 'body') return role
  if (namesLimits(title)) return 'limitations'
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
 * Citations as bare numerals bound to the word before them (the white space before them dropped, any the viewer's
 * `bindCites` trims: a tab or a wide space as well, M75), adjacent ones in one
 * group that wraps between numerals only; an image named in the page's words; a table a named region the keyboard
 * can scroll; room kept beside a citation whose square could reach the next target (`roomed`). Each pattern runs in
 * linear time, since a page is printed whatever its length: a run of spaces is
 * matched from its start only, and an image's name ends at the first bracket that does not close inside it ("chart
 * [2026]" is one name). An image is named in text only, never inside a tag: a mailto address keeps its spaces, so
 * `<mailto:[image: x]>` holds the same words in its href.
 */
function pagePass(html: string, pass: Pass): string {
  return roomed(
    html
      .replace(/(?<!\s)\s+(?=<sup class="cite">)/g, '')
      .replace(/(?:<sup class="cite"><a href="#cite-\d+">\[\d+\]<\/a><\/sup>)+/g, (run) => {
        const links = [...run.matchAll(/#cite-(\d+)/g)].map((m) => citeLink(Number(m[1]), pass))
        return `<sup class="cite">${links.join('<span class="sep">,</span><wbr>')}</sup>`
      })
      .replace(
        /(<[^>]*>)|\[image: ((?:[^[\]<]|\[[^[\]<]*\])*)\]/g,
        (match: string, tag: string | undefined, alt: string) =>
          tag === undefined ? `<span class="omitted">${esc(pass.words.image)}: ${alt}</span>` : match,
      )
      .replace(
        /<figure class="table" data-visual-id="table-(\d+)">/g,
        (open: string, k: string) =>
          `${open.slice(0, -1)} tabindex="0" role="region" aria-label="${esc(pass.words.table)} ${k}">`,
      ),
  )
}

/**
 * Fewer visible characters than these between a citation and the next target in its block may be narrower than the
 * room its 24px square needs (page-css.ts): the square reaches 24px less one digit past a neighbour's, and 12px less
 * half a digit past a link. They are counted at the narrowest glyph the page's fonts have, an apostrophe at about
 * 0.19em of a table's 14px; from these on, the words between keep the squares apart.
 */
const ROOM_FROM_CITE = 8
const ROOM_FROM_LINK = 4
const GROUP = '<sup class="cite">'
/** In order: a citation group, a link's start or end, any other tag (its name captured), text, or a stray "<". */
const TOKEN = /<sup class="cite">(?:[^<]|<(?!\/sup>))*<\/sup>|<a\b[^>]*>|<\/a>|<\/?([a-z][a-z0-9]*)\b[^>]*>|[^<]+|</g
/** Tags that end a line box: a target before one is never beside a target after it. */
const BLOCKS = new Set(
  'address article aside blockquote br caption dd details div dl dt figcaption figure footer h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section summary table tbody td tfoot th thead tr ul'.split(
    ' ',
  ),
)

const ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi
const WHITE = new Set([' ', '\n', '\t', '\r'])
/** Characters that count: a letter, digit, mark of punctuation or symbol, or a no-break space. A combining mark, a
 * control or format character and a narrow space (thin, hair) count as nothing, so the count never overstates. */
const COUNTED = /[\p{L}\p{N}\p{P}\p{S}\u00a0]/u

/** The pass so far: the last target in this block, the visible characters since it, and the sides to keep. */
interface Room {
  /** A citation group (its token's index) or a link. */
  last: { link: true } | { link: false; at: number } | null
  gap: number
  /** Whether the last character counted was white space, which a following one joins. */
  blank: boolean
  inLink: boolean
  sides: Map<number, string[]>
}

const keep = (room: Room, at: number, side: string) => room.sides.set(at, [...(room.sides.get(at) ?? []), side])

/** A target ends at this token: a citation group (`at`) or a link. */
function targetEnds(room: Room, last: Room['last']): void {
  room.last = last
  room.gap = 0
  room.blank = false
}

/** A citation group: room after the group before it, or before this one past a link. */
function groupMet(room: Room, at: number): void {
  const { last, gap } = room
  if (room.inLink) return
  if (last && !last.link && gap < ROOM_FROM_CITE) keep(room, last.at, 'before-cite')
  if (last?.link && gap < ROOM_FROM_LINK) keep(room, at, 'after-link')
  targetEnds(room, { link: false, at })
}

/** A link starts: room after the group before it. */
function linkMet(room: Room): void {
  const { last, gap } = room
  if (last && !last.link && gap < ROOM_FROM_LINK) keep(room, last.at, 'before-link')
  room.inLink = true
}

/** Text: its visible characters, as the line box sets them (an entity one, a run of white space one space). */
function textMet(room: Room, text: string): void {
  if (room.inLink || room.last === null) return
  for (const ch of text.replace(ENTITY, 'x')) {
    const space = WHITE.has(ch)
    if (space ? !room.blank : COUNTED.test(ch)) room.gap += 1
    room.blank = space
  }
}

/**
 * Marks each citation group whose square could reach the next target in its block (another group or a link) with
 * the side to keep room on, which page-css.ts makes a margin: no square then covers a neighbour's or a link's own
 * press. Linear in the markup: one pass over its tokens, the marks set at the end.
 */
function roomed(html: string): string {
  const tokens: string[] = []
  const room: Room = { last: null, gap: 0, blank: true, inLink: false, sides: new Map() }
  for (const [token, tag] of html.matchAll(TOKEN)) {
    tokens.push(token)
    if (token.startsWith(GROUP)) groupMet(room, tokens.length - 1)
    else if (token === '</a>') {
      room.inLink = false
      targetEnds(room, { link: true })
    } else if (tag !== undefined) {
      if (BLOCKS.has(tag)) room.last = null
    } else if (token.startsWith('<a')) linkMet(room)
    else textMet(room, token)
  }
  for (const [at, side] of room.sides)
    tokens[at] = `<sup class="cite ${side.join(' ')}">${tokens[at]?.slice(GROUP.length) ?? ''}`
  return tokens.join('')
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

/** The ids of the page's own parts that printReport does not reserve: a section's id may be one of them. */
const PAGE_IDS = /^(report-method|report-limitations|ref-\d+)$/

/**
 * printReport's section ids, each one a page part uses renamed the way printReport renames a taken id ("Report method"
 * becomes report-method-2). Only the page renames it, so pdf-report-v1 prints the ids and bytes it always did.
 */
function pageIds(ids: readonly string[]): string[] {
  const used = new Set(ids)
  return ids.map((id) => {
    if (!PAGE_IDS.test(id)) return id
    let k = 2
    while (used.has(`${id}-${k}`)) k += 1
    used.add(`${id}-${k}`)
    return `${id}-${k}`
  })
}

/** printReport's sections, each under its page id and role and passed (after the lead, so ids follow reading order). */
function pageSections(printed: PrintedReport, pass: Pass): PageSection[] {
  const ids = pageIds(printed.manifest.sections.map((s) => s.id))
  return printed.body
    .filter((part) => part.startsWith('<section id="'))
    .map((html, i) => {
      const id = ids[i] ?? ''
      const title = printed.manifest.sections[i]?.title ?? ''
      const role = pageRole(/ data-report-role="([a-z]+)"/.exec(html)?.[1] ?? 'body', title)
      const open = () => `<section id="${esc(id)}" data-report-role="${role}"`
      const out = pagePass(html.replace(/^<section id="[^"]+" data-report-role="[a-z]+"/, open), pass)
      return { id, role, title, html: out, nums: numsOf(out) }
    })
}

/** A section where the report states its limitations: one the page sets as limitations, or one whose heading names
 * them under another role ("Conclusions and limitations", "Sources and limitations"). */
const limitsSection = (s: PageSection) => s.role === 'limitations' || namesLimits(s.title)

/** Whether the report states its limitations. It decides the method's note, never what is printed. */
const statesLimits = (sections: readonly PageSection[]) => sections.some(limitsSection)

/** Whether a stored limitation shows anything: a character that is not white space, a control or a format character. */
const visible = (text: string) => /[^\s\p{Cc}\p{Cf}]/u.test(text)

/**
 * Every limitation the version stored, as a section of its own: after the last body or summary section, before the
 * conclusion or references that follow it. Always, whatever the report says (M75, the cloud review on 85c1ae1): it is
 * the version's record, as Studio's reader shows it above the report, and no reading of the report's headings or text
 * can tell that the report states one (a heading may be a subject, "Limits of liability"; a sentence may be framed,
 * narrowed or refuted by the one before or after it). A limitation the report also states is printed again here, under
 * "As stated when this version was published"; beside a section of the report's own on its limitations, this one is
 * titled "Limitations on record", so the contents never list two alike.
 */
function withStoredLimitations(sections: PageSection[], stored: readonly string[], words: PageWords): PageSection[] {
  const lines = stored.map((l) => l.trim()).filter(visible)
  if (lines.length === 0) return sections
  const items = lines.map((l) => `<li>${esc(l)}</li>`).join('')
  const title = sections.some(limitsSection) ? words.limitationsOnRecord : words.limitations
  const section: PageSection = {
    id: 'report-limitations',
    role: 'limitations',
    title,
    html:
      `<section id="report-limitations" data-report-role="limitations"><h2>${esc(title)}</h2>\n` +
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
 * inside an entity. The path is shown decoded (the link keeps it escaped); one that does not decode, or decodes to an
 * invisible character, is shown as given.
 */
function typesetUrl(href: string): string {
  const m = /^(https?:\/\/)([^/?#]*)(.*)$/.exec(href)
  if (!m) return esc(href)
  const [, scheme = '', host = '', raw = ''] = m
  let path = raw
  try {
    const decoded = decodeURI(raw)
    // A control, format or separator character would act on the text around it (an override reverses it, a zero
    // width hides in it): such a path stays escaped.
    if (!/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(decoded)) path = decoded
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
  // page.sections holds the record's limitations whenever the version stored any (`withStoredLimitations`).
  if (!statesLimits(page.sections)) lines.push(['note', esc(words.noLimits)])
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

/** A CSS string of fixed words: a backslash, a quote or a "<" escaped, so it can neither end the string nor the sheet. */
const cssString = (text: string) => `"${text.replace(/[\\"<]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`

/**
 * Print's running head in the report's own words (M75-RF-0003): PAGE_CSS sets it in English on every page but the
 * first, so a page in another language adds one rule after it that names the report as its masthead does. An English
 * or undetermined page adds nothing and keeps its bytes.
 */
function runningHead(words: PageWords): string {
  return words.kicker === pageWords('en').kicker ? '' : `\n@page { @top-left { content: ${cssString(words.kicker)}; } }`
}

/** The page's head: its policy before anything the report wrote, then its record, title and stylesheet. */
function pageHead(title: string, sha256: string, words: PageWords): string {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta name="color-scheme" content="light dark">',
    `<meta name="generator" content="Sophia ${PAGE_PROFILE}">`,
    `<meta name="sophia-markdown-sha256" content="${esc(sha256)}">`,
    `<title>${esc(title)}</title>`,
    `<style>${PAGE_CSS}${runningHead(words)}</style>`,
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
    `<!doctype html>\n<html lang="${esc(language)}"><head>${pageHead(printed.title, input.sha256, words)}</head>\n` +
    `<body class="standard">\n${[titleBlock(page), ...main, colophon(words, input)].join('\n')}\n</body></html>\n`
  )
}
