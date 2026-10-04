import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import type { SourceContent } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { readReportSource, withActor, type ReportSource } from '@sophia/persistence'
import { objectPath, storedKey, type ByteStore } from '../byte-store.ts'
import { UUID_PATTERN } from './schemas.ts'

/** How long a signed URL reads: enough to start a download or a PDF's first page, short enough to stay private. */
export const CONTENT_URL_SECONDS = 120

const EXTENSION: Record<ReportSource['format'], string> = {
  markdown: 'md',
  pdf: 'pdf',
  html: 'html',
  pptx: 'pptx',
  ui: 'html',
}

/** A saved copy's name: the title in plain lowercase words, the version, the format's extension. */
export function reportFilename(title: string, versionNumber: number | null, format: ReportSource['format']): string {
  const slug =
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 80)
      .replace(/^-+|-+$/g, '') || 'report'
  return `${slug}${versionNumber === null ? '' : `-v${versionNumber}`}.${EXTENSION[format]}`
}

type Disposition = SourceContent['disposition']

const contentParams = {
  type: 'object',
  additionalProperties: false,
  properties: { sourceId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['sourceId'],
} as const

const contentQuery = {
  type: 'object',
  additionalProperties: false,
  properties: { disposition: { type: 'string', enum: ['inline', 'attachment'] } },
} as const

/**
 * getSourceContent (A11, SMC-M03): one authorized read of a report's source or rendition. A text kept inline is
 * answered as text; stored bytes as a URL the API signs for CONTENT_URL_SECONDS, never longer. The reader checks the
 * bytes against `sha256` before showing or saving them. A source that is not ready (being stored, redacted,
 * forgotten) gets no new URL.
 */
export function sourceRoutes(app: FastifyInstance, { pool, store }: { pool: pg.Pool; store: ByteStore | null }): void {
  app.get<{ Params: { sourceId: string }; Querystring: { disposition?: Disposition } }>(
    '/api/v1/sources/:sourceId/content',
    {
      schema: { params: contentParams, querystring: contentQuery, response: { 200: { $ref: 'SourceContent#' } } },
    },
    async (req, reply): Promise<SourceContent> => {
      const disposition = req.query.disposition ?? 'inline'
      const source = await withActor(pool, req.actorId, 'read', (c) => readReportSource(c, req.params.sourceId))
      if (source.state !== 'ready') throw new DomainError('invalid_state', 'This source can no longer be read')
      const filename = reportFilename(source.title, source.versionNumber, source.format)
      const known = {
        sourceId: source.sourceId,
        sha256: source.sha256,
        mime: source.mime,
        byteLength: source.byteLength,
        filename,
        disposition,
      }
      void reply.header('cache-control', 'no-store')
      if (source.text !== null) return { ...known, text: source.text, downloadUrl: null, expiresAt: null }
      if (source.storageKey !== storedKey(source.projectId, source.sourceId)) {
        throw new DomainError('unavailable', 'This source has no stored bytes')
      }
      if (!store) throw new DomainError('unavailable', 'The report store is not set up')
      // Stated before signing, so the URL never expires earlier than the reply says.
      const expiresAt = new Date(Date.now() + CONTENT_URL_SECONDS * 1000).toISOString()
      try {
        const downloadUrl = await store.signedUrl(
          objectPath(source.projectId, source.sourceId),
          CONTENT_URL_SECONDS,
          disposition === 'attachment' ? filename : null,
        )
        return { ...known, downloadUrl, expiresAt }
      } catch (err) {
        throw new DomainError('unavailable', 'The report store did not answer', { cause: err })
      }
    },
  )
}
