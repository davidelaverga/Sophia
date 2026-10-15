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

/** Words, from a fragment: tags gone, entities left as written, spaces folded. */
const words = (fragment: string) =>
  fragment
    .replaceAll(/<[^>]*>/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()

/** Its aria-label, else the words of the first heading before the next section opens, else its id. */
function labelOf(id: string, attributes: string, after: string): string {
  const aria = ARIA.exec(attributes)?.[1]
  if (aria) return aria
  const heading = HEADING.exec(after.split('data-section="')[0] ?? '')?.[1]
  return (heading && words(heading)) || id
}

export function pageSections(html: string): PageSection[] {
  const found: PageSection[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(OPENING)) {
    const [whole, , attributes = '', id = ''] = match
    if (!VALID.test(id) || seen.has(id)) continue
    seen.add(id)
    found.push({ id, label: labelOf(id, attributes, html.slice(match.index + whole.length)) })
  }
  return found
}
