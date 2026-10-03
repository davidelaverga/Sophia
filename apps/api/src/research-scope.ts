// What a speaker said about the research they asked for, beyond its topic (CX-0030): what to change and what to keep
// as it is, a length, the sections, and limits on web searches and page reads. Pure. In production the guide passed
// start_research only the topic, so the worker never saw the length, the sections, the limits or "keep everything
// else", and nothing after admission can restore what admission did not store. The parts a v1.2 guide states in
// `scope` are appended to the question as plain lines, so the worker reads them wherever it reads the question (its
// task statement, its manifest, the question source). The lines are deterministic, in one order and wording whatever
// order the parts came in, so a retried call stays the same request under its idempotency key (0025's semantic
// request hashes the question). Without a scope, or with one that states nothing, the question is stored exactly as
// before. A part of the wrong type or size is asked about again, never dropped: a dropped part is an instruction the
// worker would never see. The limits are the speaker's words to the worker, not enforced here; the lineage's
// allowance (0024) still caps searches and reads.

/** 0025's limit on the stored question, lines included; a JavaScript length never counts fewer than PostgreSQL's. */
export const QUESTION_MAX = 2000
const TEXT_MAX = 500
const LENGTH_MAX = 100
const SECTION_MAX = 100
const SECTIONS_MAX = 12
/** The allowance's caps for a lineage (0024): a speaker's limit can only be lower. */
const SEARCHES_MAX = 5
const READS_MAX = 8

const HEAD = 'Asked by the speaker:'

const ASK = {
  scope: 'What should the research keep to, beyond its topic?',
  change: 'What should the research change? Say it in at most 500 characters.',
  keep: 'What should the research keep as it is? Say it in at most 500 characters.',
  length: 'How long should the report be? Say it in at most 100 characters.',
  sections: 'Which sections should the report have? Up to twelve, each a short name.',
  maxSearches: 'How many web searches may the research use? A whole number, at most five.',
  maxReads: 'How many pages may the research read? A whole number, at most eight.',
  tooLong: 'With its instructions the request is too long to keep whole. Could you say it more briefly?',
}

/** The parts the speaker stated; undefined where they stated nothing. */
interface Scope {
  change: string | undefined
  keep: string | undefined
  length: string | undefined
  sections: string[] | undefined
  maxSearches: number | undefined
  maxReads: number | undefined
}

const NOTHING: Scope = {
  change: undefined,
  keep: undefined,
  length: undefined,
  sections: undefined,
  maxSearches: undefined,
  maxReads: undefined,
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const unstated = (v: unknown) => v === undefined || v === null

/** One line: control characters, line breaks and runs of spaces become one space, so the block keeps its shape. */
const oneLine = (s: string) => s.replace(/[\s\p{Cc}]+/gu, ' ').trim()

/**
 * A text part on one line; undefined when it states nothing, null when it is not text or longer than `max` characters
 * (code points: an emoji is one, as in the declaration, though it is two in a JavaScript length).
 */
function textOf(v: unknown, max: number): string | undefined | null {
  if (unstated(v)) return undefined
  if (typeof v !== 'string') return null
  const line = oneLine(v)
  if (line === '') return undefined
  return Array.from(line).length <= max ? line : null
}

/** A section's name; a semicolon in it becomes a comma, so the Sections line lists as many names as were given. */
function sectionOf(v: unknown): string | undefined | null {
  const name = textOf(v, SECTION_MAX)
  return typeof name === 'string' ? name.replaceAll(';', ',') : name
}

/** The sections named, in order; blank names state nothing. */
function sectionsOf(v: unknown): string[] | undefined | null {
  if (unstated(v)) return undefined
  if (!Array.isArray(v) || v.length > SECTIONS_MAX) return null
  const items: unknown[] = v
  const names = items.map((s) => sectionOf(s))
  if (names.includes(null)) return null
  const named = names.filter((s) => typeof s === 'string')
  return named.length > 0 ? named : undefined
}

function countOf(v: unknown, max: number): number | undefined | null {
  if (unstated(v)) return undefined
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null
}

function scopeOf(value: unknown): Scope | { ask: string } {
  if (unstated(value)) return NOTHING
  if (!isRecord(value)) return { ask: ASK.scope }
  const change = textOf(value.change, TEXT_MAX)
  if (change === null) return { ask: ASK.change }
  const keep = textOf(value.keep, TEXT_MAX)
  if (keep === null) return { ask: ASK.keep }
  const length = textOf(value.length, LENGTH_MAX)
  if (length === null) return { ask: ASK.length }
  const sections = sectionsOf(value.sections)
  if (sections === null) return { ask: ASK.sections }
  const maxSearches = countOf(value.maxSearches, SEARCHES_MAX)
  if (maxSearches === null) return { ask: ASK.maxSearches }
  const maxReads = countOf(value.maxReads, READS_MAX)
  if (maxReads === null) return { ask: ASK.maxReads }
  return { change, keep, length, sections, maxSearches, maxReads }
}

const counted = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`

/** The stated parts as lines, always in this order. */
function linesOf(s: Scope): string[] {
  const limits = [
    s.maxSearches === undefined ? '' : counted(s.maxSearches, 'web search', 'web searches'),
    s.maxReads === undefined ? '' : counted(s.maxReads, 'page read', 'page reads'),
  ].filter((part) => part !== '')
  return [
    s.change === undefined ? '' : `Change: ${s.change}`,
    s.keep === undefined ? '' : `Keep as it is: ${s.keep}`,
    s.length === undefined ? '' : `Length: ${s.length}`,
    s.sections === undefined ? '' : `Sections: ${s.sections.join('; ')}`,
    limits.length === 0 ? '' : `At most ${limits.join(' and ')}.`,
  ].filter((line) => line !== '')
}

/**
 * The question as admission stores it: the model's (trimmed, at most QUESTION_MAX), then a line for each part of
 * `scope` the speaker stated; or the one question that would make it one.
 */
export function admittedQuestion(question: string, scope: unknown): { question: string } | { ask: string } {
  const stated = scopeOf(scope)
  if ('ask' in stated) return stated
  const lines = linesOf(stated)
  if (lines.length === 0) return { question }
  const full = `${question}\n\n${HEAD}\n${lines.map((line) => `- ${line}`).join('\n')}`
  return full.length <= QUESTION_MAX ? { question: full } : { ask: ASK.tooLong }
}
