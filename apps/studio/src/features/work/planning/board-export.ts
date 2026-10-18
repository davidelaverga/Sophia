// The board, exported (docs/plans/board-export.md): its tasks lane by lane, as CSV a sheet opens safely or as
// Markdown to paste into a report. Pure: the rows are given, the text is made.

export interface ExportRow {
  lane: string
  task: string
  who: string
  status: string
}

const FORMULA = new Set(['=', '+', '-', '@'])

/** Where a value's words start: past the control characters and spaces a sheet may skip (Codex P1 on #397). */
function wordsStart(value: string): number {
  let at = 0
  while (at < value.length && value.charCodeAt(at) <= 0x20) at += 1
  return at
}

/** A value a sheet would run: a formula's mark first or past what it skips, or a leading tab or CR (OWASP's list). */
const runs = (value: string) => FORMULA.has(value.charAt(wordsStart(value))) || /^[\t\r]/.test(value)

/** A field as CSV keeps it: quoted when it holds a comma, a quote or a line break; never a formula a sheet would run. */
function field(value: string): string {
  const safe = runs(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) || safe !== value ? `"${safe.replaceAll('"', '""')}"` : safe
}

/**
 * A header, then a row a task, lines ending CRLF as RFC 4180 has them. First the byte-order mark, without which Excel
 * reads the file as its local code page instead of UTF-8 (Codex P2 on #397).
 */
export function boardCsv(rows: readonly ExportRow[]): string {
  const lines = [['Lane', 'Task', 'Who', 'Status'], ...rows.map((r) => [r.lane, r.task, r.who, r.status])]
  return `\uFEFF${lines.map((l) => l.map(field).join(',')).join('\r\n')}\r\n`
}

/**
 * A value as Markdown keeps it inside its line: line breaks folded to spaces and marks escaped, so a task's words never
 * open a heading, an item, a link or a tag of their own (Codex P2 on #397).
 */
const inline = (value: string) => value.replace(/\s*[\r\n]+\s*/g, ' ').replace(/[\\`*_[\]<>~|#]/g, '\\$&')

/** «16 Oct 2026». */
const fullDay = (at: Date) => at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** A title, then a heading a lane with its tasks: «- [x]» for a complete one, «who · status» after each. */
export function boardMarkdown(rows: readonly ExportRow[], revision: number, now: Date): string {
  const lanes = [...new Set(rows.map((r) => r.lane))]
  const lines = [`# Tasks · plan r${String(revision)} · ${fullDay(now)}`, '']
  for (const lane of lanes) {
    lines.push(`## ${inline(lane)}`, '')
    for (const r of rows.filter((x) => x.lane === lane))
      lines.push(`- [${r.lane === 'Complete' ? 'x' : ' '}] ${inline(r.task)} — ${inline(r.who)} · ${inline(r.status)}`)
    lines.push('')
  }
  return lines.join('\n')
}

const two = (n: number) => String(n).padStart(2, '0')

/** «tasks-plan-r2-2026-10-16.csv». */
export const boardFileName = (revision: number, now: Date, kind: 'csv' | 'md') =>
  `tasks-plan-r${String(revision)}-${String(now.getFullYear())}-${two(now.getMonth() + 1)}-${two(now.getDate())}.${kind}`
