// A designed page's links to its own fragments, kept in the page (SDD-01). The viewer frames the checked page through
// `srcdoc` (HtmlView), and a srcdoc document takes its parent's address as its base: `href="#source-1"`, an inline
// citation's link to the page's source entry, reads as Studio's own page with that fragment, so a click navigated the
// frame to Studio and left it empty, nothing being able to run there (B-HTML-CITATION-LOCAL-TRIAGE-01). Written as
// `about:srcdoc#source-1`, the frame's own address, the same link only moves within the page. The page's own CSP
// refuses a <base> (base-uri 'none'), so the link itself is what changes, and only in the framed copy: the stored
// bytes, their hash and Download keep the page as it was checked. Nothing else in the page is touched.
//
// A page whose own links can't be kept so is not framed at all (`framed` is null; HtmlView says so and offers the
// version's other formats): its CSS reads an `href` (a selector such as `a[href^="#"]`, or `attr(href)`), so the design
// the policy checked may show or place a citation by its link and a changed link would change it (R2's F01); or the
// browser reads the copy as anything but the page with those links changed. Framed as stored instead, its citations
// would still empty the frame. A page with no link to its own fragment is framed as stored. The page is read with
// DOMParser, outside the frame, before it is framed: a document with no browsing context, which
// report-html-citation.spec.ts measures asking for nothing and running nothing, whatever the page names (R2's F02).

/** The framed page's own address: a link to it with a fragment moves within the page. */
const FRAME_SELF = 'about:srcdoc'

/** HTML's ASCII whitespace, which a URL loses at either end (so `" #a "` is a link to `#a`). */
const ENDS = /^[\t\n\f\r ]+|[\t\n\f\r ]+$/gu
/** What ends a tag's or an attribute's name. */
const NAME_END = /[\t\n\f\r />]/u
const ATTRIBUTE_END = /[\t\n\f\r />=]/u
const UNQUOTED_END = /[\t\n\f\r >]/u

/** Elements whose `href` a click follows. */
const LINKS = new Set(['a', 'area'])
/** Elements whose contents are text, never tags, up to their own end tag. */
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript'])

/** `href` as it stays in the framed page, when it links to the page's own fragment; otherwise null. */
export function inPage(href: string): string | null {
  const bare = href.replace(ENDS, '')
  return bare.startsWith('#') ? `${FRAME_SELF}${bare}` : null
}

interface Span {
  start: number
  end: number
}

interface Tag {
  name: string
  /** Just past the tag's `>` (or the text's end). */
  end: number
  /** Where its first `href` value lies, when it has one. */
  href?: Span
}

/** The first index from `i` whose character `stop` matches, or the text's end. */
function until(html: string, i: number, stop: RegExp): number {
  let at = i
  while (at < html.length && !stop.test(html.charAt(at))) at++
  return at
}

/** Past the whitespace (and, between attributes, the `/`) from `i`. */
const pastSpace = (html: string, i: number, slash = false) => until(html, i, slash ? /[^\t\n\f\r /]/u : /[^\t\n\f\r ]/u)

/** An attribute's value from `i` (just past its `=`): where it lies, and where the attribute ends. */
function attributeValue(html: string, i: number): { value: Span; end: number } {
  const at = pastSpace(html, i)
  const quote = html.charAt(at)
  if (quote !== '"' && quote !== "'") {
    const end = until(html, at, UNQUOTED_END)
    return { value: { start: at, end }, end }
  }
  const close = html.indexOf(quote, at + 1)
  const end = close < 0 ? html.length : close
  return { value: { start: at + 1, end }, end: close < 0 ? end : close + 1 }
}

/** The attribute at `i`: its name, its value if it has one, and where it ends. */
function attribute(html: string, i: number): { name: string; value: Span | null; end: number } {
  // A name's first character may be anything, `=` included, as HTML's tokenizer reads one.
  const nameEnd = until(html, i + 1, ATTRIBUTE_END)
  const name = html.slice(i, nameEnd).toLowerCase()
  const at = pastSpace(html, nameEnd)
  if (html.charAt(at) !== '=') return { name, value: null, end: at }
  return { name, ...attributeValue(html, at + 1) }
}

/** The start tag at `at` (its `<`), read as HTML's tokenizer reads one. */
function startTag(html: string, at: number): Tag {
  let i = until(html, at + 1, NAME_END)
  const tag: Tag = { name: html.slice(at + 1, i).toLowerCase(), end: html.length }
  let named = false
  for (i = pastSpace(html, i, true); i < html.length; i = pastSpace(html, i, true)) {
    if (html.charAt(i) === '>') return { ...tag, end: i + 1 }
    const read = attribute(html, i)
    // Only an element's first `href` counts, as the parser keeps only an attribute's first.
    if (read.name === 'href' && !named && read.value) tag.href = read.value
    named ||= read.name === 'href'
    i = read.end
  }
  return tag
}

/** Where the raw-text element `name`'s contents, starting at `from`, end: at its end tag, or the text's end. */
function rawEnd(html: string, name: string, from: number): number {
  const close = new RegExp(`</${name}(?=[\\t\\n\\f\\r />]|$)`, 'giu')
  close.lastIndex = from
  return close.exec(html)?.index ?? html.length
}

/** Where reading goes on after what starts at `lt` (a `<`), when that is no start tag: a comment, a declaration, an
 * end tag or a lone `<`; null at a start tag. */
function pastNonTag(html: string, lt: number): number | null {
  const closed = (close: number, by: number) => (close < 0 ? html.length : close + by)
  if (html.startsWith('<!--', lt)) return closed(html.indexOf('-->', lt + 4), 3)
  const next = html.charAt(lt + 1)
  if (next === '!' || next === '?' || next === '/') return closed(html.indexOf('>', lt), 1)
  return /[A-Za-z]/u.test(next) ? null : lt + 1
}

/** Where reading goes on after `tag`: past its contents when they are raw text. */
function pastTag(html: string, tag: Tag): number {
  if (tag.name === 'plaintext') return html.length
  return RAW.has(tag.name) ? rawEnd(html, tag.name, tag.end) : tag.end
}

/**
 * `html` with each link's `href` to the page's own fragment written to stay in the framed page (`inPage`), and every
 * other byte as it was: text, comments and raw text are read past, never changed.
 */
export function keptInPage(html: string): string {
  let out = ''
  let copied = 0
  let i = 0
  for (let lt = html.indexOf('<'); lt >= 0; lt = html.indexOf('<', i)) {
    const skipped = pastNonTag(html, lt)
    if (skipped !== null) {
      i = skipped
      continue
    }
    const tag = startTag(html, lt)
    const kept = tag.href && LINKS.has(tag.name) ? inPage(html.slice(tag.href.start, tag.href.end)) : null
    if (tag.href && kept !== null) {
      out += html.slice(copied, tag.href.start) + kept
      copied = tag.href.end
    }
    i = pastTag(html, tag)
  }
  return out + html.slice(copied)
}

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')

/** A CSS escape, as CSS reads one: up to six hex digits (and one space after them), or any other character as itself. */
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})[\t\n\f\r ]?|([^\n\f\r0-9a-f]))/giu

/** `css` with its escapes read, so `[\68 ref]` reads as `[href]`. */
function unescaped(css: string): string {
  return css.replace(CSS_ESCAPE, (_, hex: string | undefined, char: string | undefined) => {
    if (hex === undefined) return char ?? ''
    const code = Number.parseInt(hex, 16)
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '\ufffd'
  })
}

/** Whether the page's own CSS (its `<style>` elements, its `style` attributes) mentions `href` at all. */
function cssReadsHref(doc: Document): boolean {
  const styles = [
    ...[...doc.querySelectorAll('style')].map((style) => style.textContent),
    ...[...doc.querySelectorAll('[style]')].map((el) => el.getAttribute('style') ?? ''),
  ]
  return styles.some((css) => /href/iu.test(unescaped(css)))
}

/** Whether the browser reads `kept` as `meant` (the page, parsed) with only its links to its own fragments kept in it. */
function readAsKept(meant: Document, kept: string): boolean {
  for (const link of meant.querySelectorAll('a[href], area[href]')) {
    const href = inPage(link.getAttribute('href') ?? '')
    if (href !== null) link.setAttribute('href', href)
  }
  return parse(kept).documentElement.outerHTML === meant.documentElement.outerHTML
}

/** Whether the parsed page has a link to its own fragment. */
const linksInPage = (doc: Document) =>
  [...doc.querySelectorAll('a[href], area[href]')].some((link) => inPage(link.getAttribute('href') ?? '') !== null)

/**
 * The page to frame: the checked `page` as it is when it has no link to its own fragment; with those links kept in it
 * when its CSS never mentions `href` and the browser reads that copy as exactly the page with those links changed; or
 * null, not to be framed, when they can't be kept so (or there is no browser parser to check the copy).
 */
export function framed(page: string): string | null {
  const kept = keptInPage(page)
  if (typeof DOMParser === 'undefined') return kept === page ? page : null
  const meant = parse(page)
  if (!linksInPage(meant)) return page
  if (kept === page || cssReadsHref(meant)) return null
  return readAsKept(meant, kept) ? kept : null
}
