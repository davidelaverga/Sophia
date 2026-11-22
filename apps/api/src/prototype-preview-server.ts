// Separate content listener. The Studio/API listener does not serve executable prototype paths.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { checkRoleSafety, createPool, markManagedExplorePreviewServed } from '@sophia/persistence'
import { byteStoreFromEnv } from './byte-store.ts'
import { managedExplorePreviewReader } from './routes/managed-explore.ts'
import { createPrototypePreviewContentHandler } from './routes/prototype-preview-content.ts'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const previewOrigin = required('SOPHIA_MANAGED_EXPLORE_PREVIEW_ORIGIN')
const studioOrigin = required('SOPHIA_MANAGED_EXPLORE_STUDIO_ORIGIN')
const previewHost = new URL(previewOrigin).host
const pool = createPool(required('SOPHIA_API_DATABASE_URL'), { max: 4, connectionTimeoutMillis: 5_000 })
const readPermit = managedExplorePreviewReader(pool, byteStoreFromEnv(process.env))
const handle = createPrototypePreviewContentHandler({
  previewOrigin,
  studioOrigin,
  readPermit,
  recordServed: (permit) => markManagedExplorePreviewServed(pool, permit),
})
await checkRoleSafety(pool)

function unreachable(res: ServerResponse): void {
  res.writeHead(404, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end('Preview unavailable')
}

async function request(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end('{"ok":true}')
    return
  }
  // Ignore forwarded host and scheme. The ingress must preserve this configured Host header.
  const method = req.method
  if (
    (method !== 'GET' && method !== 'HEAD') ||
    req.headers.host !== previewHost ||
    req.headers.cookie !== undefined ||
    req.headers.authorization !== undefined ||
    !req.url?.startsWith('/v1/previews/')
  ) {
    unreachable(res)
    return
  }
  const origin = req.headers.origin
  const response = await handle(new Request(previewOrigin + req.url, { method, headers: origin ? { origin } : {} }))
  const payload = Buffer.from(await response.arrayBuffer())
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(payload)
}

const port = Number(process.env.PORT ?? '8788')
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('PORT is invalid')
const server = createServer((req, res) => {
  // Do not log a rejected request or any exception containing its permit.
  void request(req, res).catch(() => {
    if (res.headersSent) res.destroy()
    else unreachable(res)
  })
})
server.listen(port, process.env.HOST?.trim() || '127.0.0.1')

let closing = false
function stop(): void {
  if (closing) return
  closing = true
  server.close(() => {
    void pool.end().catch(() => {
      process.exitCode = 1
    })
  })
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, stop)
