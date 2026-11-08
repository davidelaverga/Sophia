// A project text a report cites, opened from its Sources (amendment A11's getCitedReportText, 0090). Pure: the checks
// a read passes before its text is shown, how a failed read is said, and the cache key that keeps it to one account.
// The text is shown only as plain text (a <pre> React fills), never as Markdown or HTML, so nothing in it runs, links
// or loads; and only after its bytes match the read's own record: the source it was asked for, a text kept inline,
// plain text or Markdown, its size in UTF-8 bytes and its sha256.
import type { SourceContent } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { sha256Hex, utf8 } from './download.ts'

export class CitedTextMismatch extends Error {
  constructor() {
    super('The text didn’t match its record, so it isn’t shown.')
  }
}

const TEXT_TYPES = new Set(['text/plain', 'text/markdown'])

/**
 * Whether a type is one the read serves as text (plain text or Markdown): exactly 0090's rule
 * (`split_part(lower(s.mime), ';', 1) IN (…)`, 0090_cited_report_text.sql:45): lowercased, the part before any ';',
 * untrimmed, so the row offers nothing the read would refuse.
 */
export const opensAsText = (mime: string): boolean => TEXT_TYPES.has(mime.toLowerCase().split(';')[0] ?? '')

/** What a row whose type the read cannot open says in place of Show text. */
export const ONLY_TEXT_OPENS = 'Only plain text and Markdown open here.'

/** The read's text once it is what its record says, for the source asked for; otherwise CitedTextMismatch. */
export async function checkedCitedText(content: SourceContent, sourceId: string): Promise<string> {
  const { text } = content
  if (
    content.sourceId !== sourceId ||
    text === undefined ||
    content.downloadUrl !== null ||
    !opensAsText(content.mime)
  ) {
    throw new CitedTextMismatch()
  }
  const bytes = utf8(text)
  if (bytes.byteLength !== content.byteLength || (await sha256Hex(bytes)) !== content.sha256.toLowerCase()) {
    throw new CitedTextMismatch()
  }
  return text
}

/** How a read that showed no text ended: refused (any answer that it can't be read here), mismatched, or failed. */
export type CitedTextFailure = 'refused' | 'mismatch' | 'failed'

export function citedTextFailure(error: unknown): CitedTextFailure {
  if (error instanceof CitedTextMismatch) return 'mismatch'
  if (error instanceof ApiError && [401, 403, 409, 422].includes(error.status)) return 'refused'
  return 'failed'
}

/** What a failed read says where the text would be. Never why a source was refused: one answer names nothing. */
export const CITED_TEXT_WORDS: Readonly<Record<CitedTextFailure, string>> = {
  refused: 'This source can’t be read here.',
  mismatch: 'The text didn’t match its record, so it isn’t shown.',
  failed: 'The text couldn’t be read.',
}

/** The press that opens or closes it, named for what it does now. */
export const citedTextToggle = (open: boolean): string => (open ? 'Hide text' : 'Show text')

/** Which source a press or region is for, as the row says it. */
const citedSource = (n: number | null): string =>
  n === null ? 'a source not cited in the text' : `citation ${String(n)}`

/** The region's name: which source's text it holds, as the row says it. */
export const citedTextRegion = (n: number | null): string => `Text of ${citedSource(n)}`

/** The press's name: its words on screen first (WCAG 2.5.3), then which source it opens, so no two read alike. */
export const citedTextPress = (open: boolean, n: number | null): string =>
  `${citedTextToggle(open)} of ${citedSource(n)}`

/** Only a failed read is asked again, twice at most: a refusal or a mismatch does not change by asking. */
export const retryCitedText = (failures: number, error: unknown): boolean =>
  citedTextFailure(error) === 'failed' && failures < 2

/** Where an account's cache keeps one open text: its account, report, version and source. Never kept once closed. */
export const citedTextKey = (account: string, artifactId: string, versionId: string, sourceId: string) =>
  ['cited-text', account, artifactId, versionId, sourceId] as const
