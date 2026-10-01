// Reads over reports, their versions and renditions (migration 0022, contract amendment A11). Every read runs under
// the member's RLS: an artifact or source in a project the reader is not in is simply not found, and no count or
// project name from such a project is ever read.
import type pg from 'pg'
import type {
  ArtifactRendition,
  ArtifactVersion,
  ReportCard,
  ReportList,
  ReportSections,
  ReportSourceList,
  ReportSummary,
  ReportSummaryEdit,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'

interface VersionRow {
  id: string
  artifact_id: string
  project_id: string
  parent_id: string | null
  source_id: string
  source_hash: string
  state: ArtifactVersion['state']
  format: ArtifactVersion['format']
  title: string
  version_number: number | null
  created_at: Date
  preview_id: string | null
  change_note: string | null
  retained_note: string | null
  limitations: string[]
  change_facts: StoredFacts | null
  trigger: NonNullable<ArtifactVersion['trigger']> | null
}

/** The change facts as publication stores them (0026, 0027): the contract's fields and a few kept for audit. */
interface StoredFacts {
  cited: number
  added: string[]
  dropped: string[]
  bytes?: number | null
  previousBytes?: number | null
  sections?: ReportSections
  notesFromFacts?: boolean
}

const VERSION_COLUMNS = `v.id, v.artifact_id, v.project_id, v.parent_id, v.source_id, v.source_hash, v.state, a.format,
  a.title, v.version_number, v.created_at, v.change_note, v.retained_note, v.limitations, v.change_facts, v.trigger,
  (SELECT p.id FROM sophia.previews p WHERE p.project_id = v.project_id AND p.artifact_version_id = v.id
      AND p.state = 'ready' ORDER BY p.id LIMIT 1) AS preview_id`

/** Formats whose authored source is what a member edits; the others are kept as delivered. */
const editability = (format: ArtifactVersion['format']): ArtifactVersion['exportEditability'] =>
  format === 'pdf' || format === 'pptx' ? 'original_only' : 'source_editable'

/** The contract's change facts out of the stored record; a field publication did not write is omitted. */
function factsOf(f: StoredFacts): NonNullable<ArtifactVersion['changeFacts']> {
  return {
    cited: f.cited,
    added: f.added,
    dropped: f.dropped,
    ...(f.bytes === undefined ? {} : { bytes: f.bytes }),
    ...(f.previousBytes === undefined ? {} : { previousBytes: f.previousBytes }),
    ...(f.sections === undefined ? {} : { sections: f.sections }),
    ...(f.notesFromFacts === undefined ? {} : { notesFromFacts: f.notesFromFacts }),
  }
}

/** A version as the contract reads it. A property with no value is omitted (A11). */
function toVersion(r: VersionRow, renditions: ArtifactRendition[], notes: boolean): ArtifactVersion {
  return {
    id: r.id,
    artifactId: r.artifact_id,
    projectId: r.project_id,
    parentId: r.parent_id,
    sourceId: r.source_id,
    sourceHash: r.source_hash,
    state: r.state,
    previewId: r.preview_id,
    format: r.format,
    exportEditability: editability(r.format),
    title: r.title,
    ...(r.version_number === null ? {} : { versionNumber: r.version_number }),
    createdAt: r.created_at.toISOString(),
    ...(renditions.length === 0 ? {} : { renditions }),
    ...(notes ? notesOf(r) : {}),
  }
}

/** What a version says about itself (its history reads them; a snapshot does not). */
function notesOf(r: VersionRow): Partial<ArtifactVersion> {
  return {
    ...(r.change_note === null ? {} : { changeNote: r.change_note }),
    ...(r.retained_note === null ? {} : { retainedNote: r.retained_note }),
    ...(r.limitations.length === 0 ? {} : { limitations: r.limitations }),
    ...(r.change_facts === null ? {} : { changeFacts: factsOf(r.change_facts) }),
    ...(r.trigger === null ? {} : { trigger: r.trigger }),
  }
}

interface RenditionRow {
  artifact_version_id: string
  format: ArtifactRendition['format']
  source_id: string
  sha256: string
  byte_length: string
  mime: string
  page_count: number | null
}

async function readRenditions(c: pg.PoolClient, versionIds: string[]): Promise<Map<string, ArtifactRendition[]>> {
  const byVersion = new Map<string, ArtifactRendition[]>()
  if (versionIds.length === 0) return byVersion
  const { rows } = await c.query<RenditionRow>(
    `SELECT r.artifact_version_id, r.format, s.id AS source_id, s.sha256, s.byte_length, s.mime, r.page_count
       FROM sophia.artifact_renditions r
       JOIN sophia.source_objects s ON s.project_id = r.project_id AND s.id = r.source_id
      WHERE r.artifact_version_id = ANY($1::uuid[])
      ORDER BY r.artifact_version_id, r.format`,
    [versionIds],
  )
  for (const r of rows) {
    const list = byVersion.get(r.artifact_version_id) ?? []
    list.push({
      format: r.format,
      sourceId: r.source_id,
      sha256: r.sha256,
      byteLength: Number(r.byte_length),
      mime: r.mime,
      pageCount: r.page_count,
    })
    byVersion.set(r.artifact_version_id, list)
  }
  return byVersion
}

/** At most this many artifacts in a snapshot, the most recently published; Knowledge lists them all. */
const SNAPSHOT_ARTIFACTS = 100

/**
 * Each artifact's current version (the stable one) with its renditions, oldest first. A version that is not stable
 * is not shown: publication makes it stable in the transaction that makes it visible. Call inside withActor.
 */
export async function readCurrentArtifacts(c: pg.PoolClient, projectId: string): Promise<ArtifactVersion[]> {
  const { rows } = await c.query<VersionRow>(
    `SELECT * FROM (
       SELECT ${VERSION_COLUMNS}
         FROM sophia.artifacts a
         JOIN sophia.artifact_versions v ON v.project_id = a.project_id AND v.id = a.stable_version_id
        WHERE a.project_id = $1
        ORDER BY v.created_at DESC, v.id DESC LIMIT ${SNAPSHOT_ARTIFACTS}) latest
      ORDER BY created_at, id`,
    [projectId],
  )
  const renditions = await readRenditions(
    c,
    rows.map((r) => r.id),
  )
  return rows.map((r) => toVersion(r, renditions.get(r.id) ?? [], false))
}

/** A version that was published: the current one and those it replaced. Candidates and rejections stay internal. */
const PUBLISHED = `v.state IN ('stable','superseded')`

/** Every published version of one artifact, newest first, with notes. Not visible → not_found. */
export async function readArtifactVersions(c: pg.PoolClient, artifactId: string): Promise<ArtifactVersion[]> {
  const { rows } = await c.query<VersionRow>(
    `SELECT ${VERSION_COLUMNS}
       FROM sophia.artifacts a JOIN sophia.artifact_versions v ON v.project_id = a.project_id AND v.artifact_id = a.id
      WHERE a.id = $1 AND ${PUBLISHED}
      ORDER BY v.version_number DESC NULLS LAST, v.created_at DESC, v.id DESC LIMIT 500`,
    [artifactId],
  )
  if (rows.length === 0) throw new DomainError('not_found', 'Artifact not found')
  const renditions = await readRenditions(
    c,
    rows.map((r) => r.id),
  )
  return rows.map((r) => toVersion(r, renditions.get(r.id) ?? [], true))
}

export interface ReportQuery {
  /** One project, or null for every project the reader is a member of. */
  projectId: string | null
  format: 'any' | 'pdf' | 'markdown_only'
  /** What the reader typed; each word must begin a word of the title, the description or a version note. */
  search: string | null
  cursor: string | null
}

/**
 * A search as a full-text query: each word (letters and digits only, so nothing typed is query syntax) as a prefix,
 * all of them required, at most 8. Null when nothing searchable was typed.
 */
export function searchQuery(text: string | null): string | null {
  const words =
    (text ?? '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 8) ?? []
  return words.length === 0 ? null : words.map((w) => `${w}:*`).join(' & ')
}

/** Cards per page. */
export const REPORT_PAGE = 30

interface CardRow {
  artifact_id: string
  project_id: string
  project_title: string
  title: string
  summary: string | null
  summary_author_id: string | null
  summary_revision: string
  summary_updated_at: Date | null
  current_version_id: string
  current_version_number: number | null
  version_count: string
  updated_at: Date
  updated_us: string
  formats: ReportCard['formats']
  change_note: string | null
  retained_note: string | null
}

/** The keyset of the last card on a page: its update time in microseconds and its id. */
const encodeCursor = (us: string, id: string) => Buffer.from(`${us}.${id}`).toString('base64url')

/** The largest PostgreSQL bigint: a cursor's microseconds are compared as one in SQL. */
const BIGINT_MAX = 9223372036854775807n

/** A cursor this API issued, or `invalid_request` before any SQL: never a value the query would fail on (M03-RF-0002). */
function decodeCursor(cursor: string): { us: string; id: string } {
  const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('.')
  const [us, id] = parts
  if (
    parts.length !== 2 ||
    !us ||
    !/^[0-9]{1,19}$/.test(us) ||
    BigInt(us) > BIGINT_MAX ||
    !id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
  ) {
    throw new DomainError('invalid_request', 'Unknown cursor')
  }
  return { us, id }
}

/**
 * Reports (format markdown) whose current version matches the filters, with $1 project (or null), $2 format and $3
 * search. The search document is the title, the description and every published version's notes.
 */
const MATCHING = `
  SELECT a.id AS artifact_id, a.project_id, p.title AS project_title, a.title, a.summary, a.summary_author_id,
         a.summary_revision, a.summary_updated_at, v.id AS current_version_id, v.version_number AS current_version_number,
         (SELECT count(*) FROM sophia.artifact_versions x WHERE x.project_id = a.project_id AND x.artifact_id = a.id
             AND x.state IN ('stable','superseded')) AS version_count,
         greatest(v.created_at, coalesce(a.summary_updated_at, v.created_at)) AS updated_at,
         array_prepend(a.format, (SELECT coalesce(array_agg(r.format ORDER BY r.format), '{}') FROM sophia.artifact_renditions r
             WHERE r.project_id = v.project_id AND r.artifact_version_id = v.id)) AS formats,
         v.change_note, v.retained_note
    FROM sophia.artifacts a
    JOIN sophia.artifact_versions v ON v.project_id = a.project_id AND v.id = a.stable_version_id
    JOIN sophia.projects p ON p.id = a.project_id
   WHERE a.format = 'markdown' AND ($1::uuid IS NULL OR a.project_id = $1::uuid)
     AND ($3::text IS NULL OR to_tsvector('simple', a.title || ' ' || coalesce(a.summary, '') || ' ' || coalesce(
           (SELECT string_agg(concat_ws(' ', x.change_note, x.retained_note), ' ') FROM sophia.artifact_versions x
             WHERE x.project_id = a.project_id AND x.artifact_id = a.id AND x.state IN ('stable','superseded')), ''))
         @@ to_tsquery('simple', $3::text))`

const FORMAT_FILTER = `($2::text = 'any' OR ($2::text = 'pdf') = ('pdf' = ANY(formats)))`

/** listReports (A11): one page of cards, newest first, and every readable project's matching count. */
export async function listReports(c: pg.PoolClient, query: ReportQuery): Promise<ReportList> {
  const params = [query.projectId, query.format, searchQuery(query.search)]
  const after = query.cursor === null ? null : decodeCursor(query.cursor)
  const { rows } = await c.query<CardRow>(
    `SELECT *, (extract(epoch FROM updated_at) * 1000000)::bigint AS updated_us
       FROM (${MATCHING}) m
      WHERE ${FORMAT_FILTER}
        AND ($4::bigint IS NULL OR ((extract(epoch FROM updated_at) * 1000000)::bigint, artifact_id) < ($4::bigint, $5::uuid))
      ORDER BY updated_us DESC, artifact_id DESC LIMIT ${REPORT_PAGE + 1}`,
    [...params, after?.us ?? null, after?.id ?? null],
  )
  const counts = await c.query<{ project_id: string; project_title: string; count: string }>(
    `SELECT project_id, project_title, count(*) AS count FROM (${MATCHING}) m WHERE ${FORMAT_FILTER}
      GROUP BY project_id, project_title ORDER BY project_title, project_id`,
    params,
  )
  const page = rows.slice(0, REPORT_PAGE)
  const last = page.at(-1)
  return {
    reports: page.map(toCard),
    projects: counts.rows.map((r) => ({ projectId: r.project_id, title: r.project_title, count: Number(r.count) })),
    nextCursor: rows.length > REPORT_PAGE && last ? encodeCursor(last.updated_us, last.artifact_id) : null,
  }
}

const toCard = (r: CardRow): ReportCard => ({
  artifactId: r.artifact_id,
  projectId: r.project_id,
  projectTitle: r.project_title,
  title: r.title,
  summary: r.summary,
  summaryAuthorId: r.summary_author_id,
  summaryRevision: Number(r.summary_revision),
  summaryUpdatedAt: r.summary_updated_at?.toISOString() ?? null,
  currentVersionId: r.current_version_id,
  currentVersionNumber: r.current_version_number,
  versionCount: Number(r.version_count),
  updatedAt: r.updated_at.toISOString(),
  formats: r.formats,
  latestChange: { note: r.change_note, retained: r.retained_note },
})

/** A report's own source or one of its renditions, as getSourceContent needs it. */
export interface ReportSource {
  projectId: string
  sourceId: string
  sha256: string
  mime: string
  byteLength: number
  state: 'uploading' | 'ready' | 'blocked' | 'deleted' | 'failed'
  storageKey: string
  /** The bytes, when the source is a text kept inline (source_texts). */
  text: string | null
  title: string
  versionNumber: number | null
  /** The version's own format, or the rendition's. */
  format: ArtifactVersion['format']
}

interface ReportSourceRow {
  project_id: string
  id: string
  sha256: string
  mime: string
  byte_length: string
  state: ReportSource['state']
  storage_key: string
  body: string | null
  title: string
  version_number: number | null
  format: ArtifactVersion['format']
}

/**
 * The source `sourceId` when it is a published report version's source or a rendition of one, and the reader may see
 * it. A candidate's or a rejected version's bytes, and other sources (notes, manifests, passages until S3), are not
 * served through this read. Call inside withActor(..., "read").
 */
export async function readReportSource(c: pg.PoolClient, sourceId: string): Promise<ReportSource> {
  const { rows } = await c.query<ReportSourceRow>(
    `SELECT s.project_id, s.id, s.sha256, s.mime, s.byte_length, s.state, s.storage_key, t.body, a.title,
            v.version_number, coalesce(o.rendition_format, a.format) AS format
       FROM sophia.source_objects s
       JOIN LATERAL (
         SELECT v.artifact_id, v.id AS version_id, NULL::text AS rendition_format FROM sophia.artifact_versions v
          WHERE v.project_id = s.project_id AND v.source_id = s.id AND ${PUBLISHED}
         UNION ALL
         SELECT rv.artifact_id, rv.id, r.format FROM sophia.artifact_renditions r
           JOIN sophia.artifact_versions rv ON rv.project_id = r.project_id AND rv.id = r.artifact_version_id
          WHERE r.project_id = s.project_id AND r.source_id = s.id AND rv.state IN ('stable','superseded')
         LIMIT 1) o ON true
       JOIN sophia.artifact_versions v ON v.project_id = s.project_id AND v.id = o.version_id
       JOIN sophia.artifacts a ON a.project_id = s.project_id AND a.id = o.artifact_id
       LEFT JOIN sophia.source_texts t ON t.project_id = s.project_id AND t.source_id = s.id
      WHERE s.id = $1`,
    [sourceId],
  )
  const r = rows[0]
  if (!r) throw new DomainError('not_found', 'Source not found')
  return {
    projectId: r.project_id,
    sourceId: r.id,
    sha256: r.sha256,
    mime: r.mime,
    byteLength: Number(r.byte_length),
    state: r.state,
    storageKey: r.storage_key,
    text: r.body,
    title: r.title,
    versionNumber: r.version_number,
    format: r.format,
  }
}

interface CitedRow {
  source_id: string
  kind: 'search_results' | 'web_read' | 'admitted_input' | null
  provider: 'tavily' | 'jina' | null
  title: string | null
  url: string | null
  coverage: 'complete' | 'partial' | 'unsupported' | null
  origin_http_status: number | null
  limitations: string[] | null
  mime: string
  retrieved_at: Date | null
}

/**
 * listReportSources (A11): the sources a published version cites, with their provenance, oldest retrieval first. Each
 * one is a source the reader may read (RLS); a source the reader may not see is left out, never named. The URL is what
 * the extractor reported reaching, else what was asked for. Not visible → not_found. Call inside withActor.
 */
export async function listReportSources(
  c: pg.PoolClient,
  artifactId: string,
  versionId: string,
): Promise<ReportSourceList> {
  const version = await c.query<{ source_id: string; project_id: string }>(
    `SELECT v.source_id, v.project_id FROM sophia.artifact_versions v
      WHERE v.id = $2 AND v.artifact_id = $1 AND ${PUBLISHED}`,
    [artifactId, versionId],
  )
  const v = version.rows[0]
  if (!v) throw new DomainError('not_found', 'Version not found')
  const { rows } = await c.query<CitedRow>(
    `SELECT s.id AS source_id, p.kind, p.provider, p.title, coalesce(p.reported_final_url, p.requested_url) AS url,
            p.coverage, p.origin_http_status, p.limitations, s.mime, p.retrieved_at
       FROM sophia.source_dependencies d
       JOIN sophia.source_objects s ON s.project_id = d.project_id AND s.id = d.source_id
       LEFT JOIN sophia.source_provenance p ON p.project_id = s.project_id AND p.source_id = s.id
      WHERE d.project_id = $1 AND d.derived_source_id = $2
      ORDER BY p.retrieved_at NULLS LAST, s.created_at, s.id LIMIT 500`,
    [v.project_id, v.source_id],
  )
  return {
    sources: rows.map((r) => ({
      sourceId: r.source_id,
      kind: r.kind === null || r.kind === 'admitted_input' ? 'input' : r.kind,
      provider: r.provider,
      title: r.title,
      url: r.url,
      coverage: r.coverage,
      originHttpStatus: r.origin_http_status,
      limitations: r.limitations ?? [],
      mime: r.mime,
      retrievedAt: r.retrieved_at?.toISOString() ?? null,
    })),
  }
}

/**
 * editReportSummary (A11): a member's edit of a report's description, attributed to them and checked against the
 * revision they saw (stale → stale_revision). Editors and admins only. Call inside withActor(..., "write").
 */
export async function editReportSummary(
  c: pg.PoolClient,
  artifactId: string,
  edit: ReportSummaryEdit,
): Promise<ReportSummary> {
  const { rows } = await c.query<{ summary: ReportSummary }>(
    `SELECT sophia.edit_report_summary($1, $2, $3) AS summary`,
    [artifactId, edit.summary, edit.expectedRevision],
  )
  const row = rows[0]
  if (!row) throw new DomainError('not_found', 'Report not found')
  return row.summary
}
