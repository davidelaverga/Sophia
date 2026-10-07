// A report's tile on Knowledge (docs/plans/knowledge-library.md): what a Markdown report's first lines say, as words,
// the monogram a cover falls back to, and the tile's one meta line. Pure, so the tile draws them as text, never HTML.
import type { ReportCard } from '@sophia/contracts'
import { dayOf } from '../../app/time-words.ts'

/** At most this many lines under the heading: a cover shows the opening, not the report. */
const LINES = 6

const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/**
 * A line's words: no citation (bare `[id]`, or a link to an id), no image, a link's words without its address, no
 * emphasis (an underscore only around words, so snake_case names stay whole), no heading, list or quote mark. A rule
 * says nothing.
 */
function wordsOf(line: string): string {
  if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) return ''
  return line
    .replace(new RegExp(`\\s?\\[[^\\]]*\\]\\(<?${ID}>?\\)`, 'g'), '')
    .replace(new RegExp(`\\s?\\[${ID}\\]`, 'g'), '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|\*)(.+?)\1/g, '$2')
    .replace(/(?<!\w)(__|_)(.+?)\1(?!\w)/g, '$2')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
    .trim()
}

/** A table row as words, its cells joined; a table's rule (`| --- |`) says nothing. */
function rowOf(line: string): string | null {
  const cells = line
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean)
  if (cells.every((c) => /^:?-{3,}:?$/.test(c))) return null
  return cells.map(wordsOf).join(' · ')
}

/** A line on a Markdown cover: its words, and whether it heads a section (`## `). */
export interface CoverLine {
  words: string
  section: boolean
}

/** The cover of a Markdown report: its first heading (`# `), then the lines that open it, as words. */
export function coverOf(markdown: string): { heading: string | null; lines: CoverLine[] } {
  const all = markdown.split('\n').map((l) => l.trim())
  const first = all.findIndex((l) => l !== '')
  const titled = first >= 0 && /^#\s/.test(all[first] ?? '')
  const heading = titled ? wordsOf(all[first] ?? '') : null
  const lines: CoverLine[] = []
  for (const line of all.slice(titled ? first + 1 : 0)) {
    if (lines.length === LINES) break
    const words = line.startsWith('|') ? rowOf(line) : wordsOf(line)
    if (words) lines.push({ words, section: /^#{2,6}\s/.test(line) })
  }
  return { heading, lines }
}

/** The format a cover names when it has nothing to show: the designed page first, then the PDF, then the Markdown. */
export function monogramOf(formats: ReportCard['formats']): 'HTML' | 'PDF' | 'MD' {
  if (formats.includes('html')) return 'HTML'
  if (formats.includes('pdf')) return 'PDF'
  return 'MD'
}

/**
 * A tile's one meta line: the project when every project is listed, the formats beyond the Markdown, the version, the
 * count of versions when there are several, and the day.
 */
export function metaOf(card: ReportCard, showProject: boolean, now: number): string {
  return [
    showProject ? card.projectTitle : null,
    card.formats.includes('html') ? 'HTML' : null,
    card.formats.includes('pdf') ? 'PDF' : null,
    card.currentVersionNumber ? `v${String(card.currentVersionNumber)}` : null,
    card.versionCount > 1 ? `${String(card.versionCount)} versions` : null,
    dayOf(card.updatedAt, now),
  ]
    .filter(Boolean)
    .join(' · ')
}
