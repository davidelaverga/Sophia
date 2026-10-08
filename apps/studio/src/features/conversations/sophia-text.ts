// Sophia's words in a conversation, read as light text (docs/plans/conversations-answers.md, C6): the API sends her
// message as text (A18); the Studio gives it its shape. Paragraphs part at blank lines; a line ending in a colon leads
// what follows; lines starting «- » are a list, and an item that opens with a short name and a colon («Marco: …») names
// who said it. A member's message is never read this way: it stays as written.

export type ListItem = { who: string | null; text: string }
export type Block = { kind: 'p'; text: string } | { kind: 'lead'; text: string } | { kind: 'list'; items: ListItem[] }

/** «Marco: One page.» names Marco: a name of up to three words, capitalised, no sentence before the colon. */
const SPEAKER = /^(\p{Lu}[\p{L}'’-]*(?: \p{Lu}?[\p{L}'’-]*){0,2}): (.+)$/u

const itemOf = (line: string): ListItem => {
  const words = line.slice(2).trim()
  const said = SPEAKER.exec(words)
  return said?.[1] && said[2] ? { who: said[1], text: said[2] } : { who: null, text: words }
}

/** One block of lines (no blank line inside) as its paragraphs, lead and list, in order. */
function blockOf(lines: readonly string[]): Block[] {
  const out: Block[] = []
  let words: string[] = []
  const flush = () => {
    if (words.length > 0) out.push({ kind: 'p', text: words.join('\n') })
    words = []
  }
  for (const line of lines) {
    const last = out.at(-1)
    if (line.startsWith('- ')) {
      flush()
      if (last?.kind === 'list' && words.length === 0) last.items.push(itemOf(line))
      else out.push({ kind: 'list', items: [itemOf(line)] })
    } else if (line.endsWith(':') && words.length === 0) {
      out.push({ kind: 'lead', text: line })
    } else {
      words.push(line)
    }
  }
  flush()
  return out
}

/** A block's words as the parts of one line: a list's items, each with its speaker; else its text on one line. */
const partsOf = (b: Block): string[] =>
  b.kind === 'list' ? b.items.map((i) => (i.who ? `${i.who}: ${i.text}` : i.text)) : [b.text.replaceAll('\n', ' ')]

/** Her message as one line, for a row: a lead opens what follows it, the rest apart by « · ». */
export function plainOf(text: string): string {
  const parts: string[] = []
  let lead = ''
  for (const block of blocksOf(text)) {
    if (block.kind === 'lead') {
      lead = `${lead}${block.text} `
      continue
    }
    const [first = '', ...rest] = partsOf(block)
    parts.push(`${lead}${first}`, ...rest)
    lead = ''
  }
  if (lead) parts.push(lead.trim())
  return parts.join(' · ')
}

/** Sophia's message as blocks: what the thread draws in place of one paragraph. */
export function blocksOf(text: string): Block[] {
  return text
    .split(/\n\s*\n/)
    .map((part) =>
      part
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0)
    .flatMap(blockOf)
}
