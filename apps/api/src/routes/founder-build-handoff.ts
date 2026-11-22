import type {
  FounderBuildBindingRequest,
  FounderBuildExportRequest,
  FounderBuildReturnRequest,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  bindFounderBuildRepository,
  prepareFounderBuildExport,
  readFounderBuildBindingEntry,
  readFounderBuildDestination,
  readFounderBuildExport,
  readFounderBuildExportFile,
  recordFounderBuildReturn,
  withActor,
  type FounderBuildScope,
} from '@sophia/persistence'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type pg from 'pg'
import type { ByteStore } from '../byte-store.ts'
import { readRetainedPrototype } from '../retained-prototype.ts'
import { idempotencyHeader, UUID_PATTERN } from './schemas.ts'

export const FOUNDER_BUILD_SCHEMA = `SELECT
  to_regprocedure('sophia.read_founder_build(uuid,uuid,uuid,text,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.write_founder_build(uuid,uuid,uuid,text,text,jsonb)') IS NOT NULL
  AND to_regclass('sophia.founder_build_grants') IS NOT NULL
  AS ok`

const base = '/api/v1/projects/:projectId/explore/sessions/:sessionId/handoff/:approvalId'
const params = (...additional: string[]) => {
  const names = ['projectId', 'sessionId', 'approvalId', ...additional]
  return {
    type: 'object',
    additionalProperties: false,
    required: names,
    properties: Object.fromEntries(names.map((name) => [name, { type: 'string', pattern: UUID_PATTERN }])),
  }
}
const ref = (schema: string) => ({ $ref: `${schema}#` })
const write = (body: string, result: string) => ({
  params: params(),
  headers: idempotencyHeader,
  body: ref(body),
  response: { 200: ref(result) },
})
type Headers = { 'idempotency-key': string }
type ExportPath = FounderBuildScope & { exportId: string }
type FilePath = ExportPath & { fileId: string }

interface Deps {
  pool: pg.Pool
  store: ByteStore | null
}

function noStore(reply: FastifyReply): void {
  reply.header('cache-control', 'private, no-store')
}

function registerWrites(app: FastifyInstance, { pool, store }: Deps): void {
  app.post<{ Params: FounderBuildScope; Headers: Headers; Body: FounderBuildBindingRequest }>(
    `${base}/repository-binding`,
    { schema: write('FounderBuildBindingRequest', 'FounderBuildBinding') },
    (req, reply) => {
      noStore(reply)
      return withActor(pool, req.actorId, 'write', (c) =>
        bindFounderBuildRepository(c, req.params, req.headers['idempotency-key'], req.body),
      )
    },
  )
  app.post<{ Params: FounderBuildScope; Headers: Headers; Body: FounderBuildExportRequest }>(
    `${base}/exports`,
    { schema: write('FounderBuildExportRequest', 'FounderBuildExport') },
    async (req, reply) => {
      noStore(reply)
      const entry = await withActor(pool, req.actorId, 'read', (c) =>
        readFounderBuildBindingEntry(c, req.params, req.body.bindingId),
      )
      // Verify actual storage availability first; the write then rechecks the scoped approval, binding and sources.
      await readRetainedPrototype(entry, store)
      return withActor(pool, req.actorId, 'write', (c) =>
        prepareFounderBuildExport(c, req.params, req.headers['idempotency-key'], req.body),
      )
    },
  )
  app.post<{ Params: FounderBuildScope; Headers: Headers; Body: FounderBuildReturnRequest }>(
    `${base}/returns`,
    { schema: write('FounderBuildReturnRequest', 'FounderBuildReturn') },
    (req, reply) => {
      noStore(reply)
      return withActor(pool, req.actorId, 'write', (c) =>
        recordFounderBuildReturn(c, req.params, req.headers['idempotency-key'], req.body),
      )
    },
  )
}

function registerReads(app: FastifyInstance, { pool, store }: Deps): void {
  app.get<{ Params: FounderBuildScope }>(
    `${base}/destination`,
    { schema: { params: params(), response: { 200: ref('FounderBuildDestination') } } },
    (req, reply) => {
      noStore(reply)
      return withActor(pool, req.actorId, 'read', (c) => readFounderBuildDestination(c, req.params))
    },
  )
  app.get<{ Params: ExportPath }>(
    `${base}/exports/:exportId/manifest`,
    { schema: { params: params('exportId'), response: { 200: ref('FounderBuildExport') } } },
    (req, reply) => {
      noStore(reply)
      return withActor(pool, req.actorId, 'read', (c) => readFounderBuildExport(c, req.params, req.params.exportId))
    },
  )
  app.get<{ Params: FilePath }>(
    `${base}/exports/:exportId/files/:fileId`,
    { schema: { params: params('exportId', 'fileId') } },
    async (req, reply) => {
      noStore(reply)
      const { exportId, fileId } = req.params
      const read = () =>
        withActor(pool, req.actorId, 'read', (c) => readFounderBuildExportFile(c, req.params, exportId, fileId))
      const entry = await read()
      const bytes = await readRetainedPrototype(entry, store)
      if (entry.text === null) await read()
      return reply
        .type('text/plain; charset=utf-8')
        .headers({
          'content-disposition': 'attachment; filename="index.html"',
          'content-length': bytes.byteLength,
          'x-content-type-options': 'nosniff',
          'content-security-policy': "sandbox; default-src 'none'",
        })
        .send(Buffer.from(bytes))
    },
  )
}

export function founderBuildRoutes(app: FastifyInstance, deps: Deps): void {
  void app.register((scoped, _opts, done) => {
    scoped.setErrorHandler((err, req, reply) => {
      noStore(reply)
      if (!(err instanceof DomainError) || err.code !== 'not_found') throw err
      return reply.status(404).send({
        code: 'not_found',
        message: 'Founder Build target not found',
        retry: 'never',
        requestId: req.id,
      })
    })
    registerReads(scoped, deps)
    registerWrites(scoped, deps)
    done()
  })
}
