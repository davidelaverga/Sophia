// A project's current words, searched by one of its members (A38, docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md;
// #365 section 5). One read as the member (withActor 'read', sophia_api): every row passes their own row security, as
// the chat, the brief and the report viewer read them, and the same states are checked here too. Nothing is SECURITY
// DEFINER, copied or indexed: each request reads the current texts it may see, under its own statement timeout.
import { createHash } from 'node:crypto'
import type pg from 'pg'
import type { SearchHit, SearchPage } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { searchWords } from './artifacts.ts'

/** Hits per page. */
export const SEARCH_PAGE = 20

/** The longest word searched, in characters: a longer one is refused, never cut. */
export const LONGEST_WORD = 64

/** Fewer characters than this, once trimmed, search nothing: one letter matches everything. */
const SHORTEST_QUERY = 2

/** How long the search may take before it fails (503), never hangs: one statement's timeout, in milliseconds. */
const SEARCH_TIMEOUT_MS = 2000

/** The kinds, in the order a page puts equal times in. */
const KINDS = ['report', 'report_section', 'note', 'decision', 'message'] as const

/**
 * A source the member reads, as the source policy (0002 eligible_sources_read) says: their own, or the project's
 * released, eligible and ready. The text's own policy (0012 readable_source) follows the source.
 */
const READABLE = `(s.owner_id = sophia.actor_id() OR (s.scope = 'project' AND s.eligible AND s.state = 'ready'))`

/** A source of $1 the member reads, and its text. */
const TEXT_OF = (alias: string, column: string) => `
    JOIN sophia.source_objects s ON s.project_id = ${alias}.project_id AND s.id = ${alias}.${column} AND ${READABLE}
    JOIN sophia.source_texts t ON t.project_id = s.project_id AND t.source_id = s.id`

/**
 * Every place the member may find, with the words it is found by (`doc`) and the words its snippet is cut from:
 * - a Markdown report's current version: its title and the text before its first heading (report), and each section
 *   by its heading and its words, named as the viewer names it (report_section);
 * - the brief's current notes, and its decisions proposed or accepted (a withdrawn one has no proposal);
 * - the room's current messages, written or shared, by the words the chat shows this member (DISCUSSION_PAGE).
 * Then those matching $2, after the cursor ($3-$6), a page and one more. The key (time in microseconds, kind, record,
 * section) is unique, so equal times never repeat or drop a hit.
 */
const SEARCH = `
WITH reports AS (
  SELECT a.id, v.id AS version_id, v.created_at AS at, a.title, t.body, s.sha256
    FROM sophia.artifacts a
    JOIN sophia.artifact_versions v ON v.project_id = a.project_id AND v.id = a.stable_version_id AND v.state = 'stable'
    ${TEXT_OF('v', 'source_id')}
   WHERE a.project_id = $1 AND a.format = 'markdown'),
sections AS MATERIALIZED (
  SELECT r.id, r.version_id, r.at, r.title, r.sha256, x.ord, x.anchor, x.occurrence, x.heading, x.body AS words
    FROM reports r CROSS JOIN LATERAL sophia.markdown_section_texts(r.body) x),
found AS (
  SELECT 1 AS k, r.id, r.version_id AS record_id, 0 AS part, r.at, r.title, NULL::text AS anchor,
         r.title || E'\\n' || coalesce(p.words, '') AS doc, coalesce(nullif(btrim(p.words), ''), r.title) AS words,
         r.sha256, NULL::uuid AS actor_id, NULL::text AS author_name
    FROM reports r LEFT JOIN sections p ON p.version_id = r.version_id AND p.heading IS NULL
  UNION ALL
  SELECT 2, x.id, x.version_id, x.ord, x.at, x.title || ' · ' || x.heading,
         CASE WHEN x.occurrence > 0 THEN x.anchor || '#' || x.occurrence ELSE x.anchor END,
         x.heading || E'\\n' || x.words, coalesce(nullif(btrim(x.words), ''), x.heading), x.sha256, NULL, NULL
    FROM sections x WHERE x.heading IS NOT NULL
  UNION ALL
  SELECT 3, e.id, e.id, 0, e.recorded_at, t.body, NULL, t.body, t.body, s.sha256, NULL, NULL
    FROM sophia.mission_entries e ${TEXT_OF('e', 'source_id')}
   WHERE e.project_id = $1 AND e.state = 'current'
  UNION ALL
  SELECT 4, d.id, d.id, 0, d.created_at, d.proposal->>'statement', NULL, w.words, w.words, s.sha256, NULL, NULL
    FROM sophia.decisions d
    JOIN sophia.source_objects s ON s.project_id = d.project_id AND s.id = d.body_source_id AND ${READABLE}
    CROSS JOIN LATERAL (SELECT concat_ws(E'\\n', d.proposal->>'statement', d.proposal->>'purpose',
           d.proposal->>'destination', d.proposal->>'origin') AS words) w
   WHERE d.project_id = $1 AND d.proposal IS NOT NULL AND d.state IN ('proposed', 'accepted')
  UNION ALL
  SELECT 5, ct.id, ct.id, 0, ct.created_at, NULL, NULL, t.body, t.body, s.sha256, ct.actor_id, ct.author_name
    FROM sophia.contributions ct ${TEXT_OF('ct', 'source_id')}
   WHERE ct.project_id = $1 AND ct.state = 'current'),
matched AS (
  SELECT f.*, (extract(epoch FROM f.at) * 1000000)::bigint AS at_us FROM found f
   WHERE to_tsvector('simple', f.doc) @@ to_tsquery('simple', $2)),
page AS (
  SELECT * FROM matched m
   WHERE $3::bigint IS NULL OR m.at_us < $3::bigint OR (m.at_us = $3::bigint AND (m.k > $4::int OR (m.k = $4::int
     AND (m.record_id < $5::uuid OR (m.record_id = $5::uuid AND m.part > $6::int)))))
   ORDER BY m.at_us DESC, m.k, m.record_id DESC, m.part LIMIT ${String(SEARCH_PAGE + 1)})
SELECT p.k, p.id, p.record_id, p.part, p.at, p.at_us::text AS at_us, p.anchor, p.sha256,
       CASE WHEN p.k = 5 THEN sophia.actor_label($1, p.actor_id, p.author_name) ELSE p.title END AS title,
       ts_headline('simple', p.words, to_tsquery('simple', $2),
         'StartSel="",StopSel="",MaxWords=35,MinWords=15,ShortWord=0,MaxFragments=1') AS snippet,
       CASE WHEN p.k = 5 THEN (SELECT n.id FROM sophia.contributions n
         WHERE n.project_id = $1 AND (n.created_at, n.id) > (p.at, p.id)
         ORDER BY n.created_at, n.id LIMIT 1) END AS before
  FROM page p ORDER BY p.at_us DESC, p.k, p.record_id DESC, p.part`

interface Row {
  k: number
  id: string
  record_id: string
  part: number
  at: Date
  at_us: string
  anchor: string | null
  sha256: string
  title: string | null
  snippet: string
  before: string | null
}

/** Where a page ends: its last hit's key, bound to its project and query. */
interface Cursor {
  v: 2
  p: string
  q: string
  at: string
  k: number
  r: string
  n: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const BIGINT_MAX = 9223372036854775807n
const INT_MAX = 2147483647

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')

const isInt = (v: unknown, most: number, least = 0): v is number =>
  Number.isInteger(v) && Number(v) >= least && Number(v) <= most

/** A time in microseconds as the cursor keeps it: a bigint's digits. */
const isMicros = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9]{1,19}$/.test(v) && BigInt(v) <= BIGINT_MAX

/** Whether a decoded value is a cursor's shape (its project and query are compared after). */
const isCursor = (c: unknown): c is Cursor =>
  isObject(c) &&
  c.v === 2 &&
  typeof c.p === 'string' &&
  typeof c.q === 'string' &&
  isMicros(c.at) &&
  isInt(c.k, KINDS.length, 1) &&
  typeof c.r === 'string' &&
  UUID.test(c.r) &&
  isInt(c.n, INT_MAX)

/** A cursor this API issued for this project and query, or invalid_request before any SQL. */
function decodeCursor(cursor: string, projectId: string, query: string): Cursor {
  let c: unknown
  try {
    c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw new DomainError('invalid_request', 'Unknown cursor')
  }
  if (!isCursor(c)) throw new DomainError('invalid_request', 'Unknown cursor')
  if (c.p !== projectId || c.q !== query) throw new DomainError('invalid_request', 'The cursor is for another search')
  return c
}

/** A text cut to at most `size` characters (code points, as the contract counts them), an ellipsis where it was cut. */
function cut(text: string, size: number): string {
  const chars = Array.from(text)
  return chars.length <= size ? text : `${chars.slice(0, size - 1).join('')}…`
}

/** Words on one line: whitespace collapsed, trimmed. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

function toHit(r: Row): SearchHit {
  const kind = KINDS[r.k - 1]
  if (!kind) throw new DomainError('unavailable', 'A search hit of no known kind')
  // A note's title is its first line; a decision's, its statement; a message's, its author's current name.
  const first = kind === 'note' ? ((r.title ?? '').split('\n').find((l) => l.trim() !== '') ?? '') : (r.title ?? '')
  const title = cut(oneLine(first), kind === 'note' || kind === 'decision' ? 120 : 300)
  return {
    kind,
    id: r.id,
    title,
    snippet: cut(oneLine(r.snippet), 200),
    at: r.at.toISOString(),
    cite: { recordId: r.record_id, sha256: r.sha256, ...withAnchor(sectionAnchor(r.anchor)) },
    ...(kind === 'message' ? { before: r.before } : {}),
  }
}

export interface SearchQuery {
  projectId: string
  /** What the member typed (at most 200 characters, checked by the route's schema). */
  q: string
  cursor: string | null
}

/**
 * The words to search, as a full-text query of prefixes, all required (Knowledge's rule, at most eight); null when
 * nothing is searched (under two characters once trimmed, or no letter or digit). A word too long is refused.
 */
function queryOf(q: string): string | null {
  const typed = q.trim()
  const words = searchWords(typed)
  if (words.some((w) => Array.from(w).length > LONGEST_WORD)) {
    throw new DomainError('invalid_request', `A searched word is longer than ${String(LONGEST_WORD)} characters`)
  }
  if (Array.from(typed).length < SHORTEST_QUERY || words.length === 0) return null
  return words.map((w) => `${w}:*`).join(' & ')
}

/** The cursor after a page's last hit, bound to its project and query. */
const cursorAfter = (last: Row, projectId: string, hash: string): Cursor => ({
  v: 2,
  p: projectId,
  q: hash,
  at: last.at_us,
  k: last.k,
  r: last.record_id,
  n: last.part,
})

/**
 * searchProject (A38): a page of the project's current words the member may read that match every typed word, newest
 * first. Null when the project isn't the member's (RLS: an active member's only). A word longer than LONGEST_WORD, or a
 * cursor not this project's and query's, is invalid_request. Call inside withActor(..., "read").
 */
export async function searchProject(c: pg.PoolClient, query: SearchQuery): Promise<SearchPage | null> {
  const { rows: project } = await c.query(`SELECT 1 FROM sophia.projects WHERE id = $1`, [query.projectId])
  if (project.length === 0) return null
  const tsquery = queryOf(query.q)
  if (tsquery === null) return { hits: [], next: null }
  const hash = createHash('sha256').update(tsquery).digest('hex')
  const after = query.cursor === null ? null : decodeCursor(query.cursor, query.projectId, hash)
  await c.query(`SELECT set_config('statement_timeout', $1, true)`, [String(SEARCH_TIMEOUT_MS)])
  const keyset = after ? [after.at, after.k, after.r, after.n] : [null, null, null, null]
  const { rows } = await c.query<Row>(SEARCH, [query.projectId, tsquery, ...keyset])
  const page = rows.slice(0, SEARCH_PAGE)
  const last = page.at(-1)
  return {
    hits: page.map(toHit),
    next: rows.length > SEARCH_PAGE && last ? encodeCursor(cursorAfter(last, query.projectId, hash)) : null,
  }
}

/**
 * A heading whose words are only punctuation or emoji has an empty anchor in 0072 (its slug keeps letters, digits,
 * spaces and hyphens), yet it is a real section with its own repeats. Its hit names it by a token no slug can be
 * (EMPTY_SECTION, "_"), with the same "#n" for its n-th repeat; the report viewer gives such headings the same id
 * (MarkdownView). A report row (null) has no anchor (4306435438).
 */
export const EMPTY_SECTION = '_'
export const sectionAnchor = (raw: string | null): string | null =>
  raw === null ? null : raw === '' || raw.startsWith('#') ? `${EMPTY_SECTION}${raw}` : raw
const withAnchor = (anchor: string | null) => (anchor ? { anchor } : {})
