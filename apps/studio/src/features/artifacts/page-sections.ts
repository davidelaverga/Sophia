// A designed page's sections (docs/plans/revise-section.md): read from its checked text, never parsed into the Studio's
// DOM, as HtmlView keeps it. Each `data-section` id the API accepts (DesignEditRequest's pattern), in page order, once,
// named by its aria-label, else its first heading's words, else its id.

export interface PageSection {
  id: string
  label: string
}

/** A section's opening tag, with its id; the id as the API accepts one. */
const OPENING = /<([a-z][a-z0-9]*)\b([^>]*\bdata-section="([^"]*)"[^>]*)>/g
const VALID = /^[a-z][a-z0-9-]{0,63}$/
const ARIA = /\baria-label="([^"]*)"/
const HEADING = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/

const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }

/** A fragment's character references read as the characters they stand for (the compiler writes them; Codex on #359). */
const decoded = (text: string) =>
  text.replaceAll(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref.startsWith('#')) {
      const code = ref[1] === 'x' || ref[1] === 'X' ? Number.parseInt(ref.slice(2), 16) : Number(ref.slice(1))
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED[ref.toLowerCase()] ?? whole
  })

/** Where a break or a block divides words, they stay apart; inline marks join the words they hold. */
const BREAK = /<(br|\/?(p|div|li|h[1-6]|section|header|footer))\b[^>]*>/gi

/** Words, from a fragment or an attribute: tags gone, references read, spaces folded. */
const words = (fragment: string) =>
  decoded(fragment.replaceAll(BREAK, ' ').replaceAll(/<[^>]*>/g, ''))
    .replaceAll(/\s+/g, ' ')
    .trim()

/** Its aria-label, else the words of the first heading before the next section opens, else its id. */
function labelOf(id: string, attributes: string, after: string): string {
  const aria = ARIA.exec(attributes)?.[1]
  if (aria && words(aria)) return words(aria)
  const heading = HEADING.exec(after.split('data-section="')[0] ?? '')?.[1]
  return (heading && words(heading)) || id
}

/**
 * What no element is: comments, and the raw text of script, style, textarea and title, where markup is only words. The
 * compiler reads elements (sectionsOf), so a section only there would be refused (Codex on #359).
 */
const NOT_ELEMENTS = /<!--[\s\S]*?-->|<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

export function pageSections(page: string): PageSection[] {
  const found: PageSection[] = []
  const seen = new Set<string>()
  const html = page.replaceAll(NOT_ELEMENTS, ' ')
  for (const match of html.matchAll(OPENING)) {
    const [whole, , attributes = '', id = ''] = match
    if (!VALID.test(id) || seen.has(id)) continue
    seen.add(id)
    found.push({ id, label: labelOf(id, attributes, html.slice(match.index + whole.length)) })
  }
  return found
}
