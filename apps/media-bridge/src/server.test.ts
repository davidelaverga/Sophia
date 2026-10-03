// The bridge process at start (server.ts), in rehearsal: no Google call and an API that is not there. Only what it logs
// before polling is read: the effective settings an operator confirms a release by.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const SERVER = fileURLToPath(new URL('./server.ts', import.meta.url))

/** The JSON lines the process writes until `bridge.start`; then it is stopped. */
async function startLines(captions: string | undefined): Promise<Record<string, unknown>[]> {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SOPHIA_LIVE_MODE: 'rehearse',
    // Nothing listens on the discard port: the first poll fails, after the banner.
    SOPHIA_SERVICE_URL: 'http://127.0.0.1:9',
    SOPHIA_MEDIA_BRIDGE_TOKEN: 'synthetic-token',
    SOPHIA_BRIDGE_INSTANCE: 'test',
    ...(captions === undefined ? {} : { SOPHIA_LIVE_CAPTIONS: captions }),
  }
  const child = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'inherit'] })
  const lines: Record<string, unknown>[] = []
  try {
    await new Promise<void>((resolve, reject) => {
      let buffer = ''
      const timer = setTimeout(() => reject(new Error('no bridge.start within 20 s')), 20_000)
      child.on('exit', (code) => reject(new Error(`exited ${String(code)} before bridge.start`)))
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
          const line: unknown = JSON.parse(buffer.slice(0, at))
          buffer = buffer.slice(at + 1)
          if (typeof line === 'object' && line !== null) lines.push(line as Record<string, unknown>)
          if (lines.at(-1)?.event === 'bridge.start') {
            clearTimeout(timer)
            resolve()
          }
        }
      })
    })
  } finally {
    child.kill('SIGKILL')
  }
  return lines
}

describe('bridge process: live captions switch (CX-0023)', () => {
  it('bridge.start says whether captions are on; off in any case is off', async () => {
    const on = await startLines(undefined)
    assert.equal(on.at(-1)?.liveCaptions, true)
    assert.equal(
      on.some((l) => l.event === 'bridge.setting_not_understood'),
      false,
    )
    const off = await startLines(' OFF')
    assert.equal(off.at(-1)?.liveCaptions, false)
  })

  it('a value it does not understand is read as off, and logged as such', async () => {
    const lines = await startLines('disabled')
    assert.equal(lines.at(-1)?.liveCaptions, false)
    const warning = lines.find((l) => l.event === 'bridge.setting_not_understood')
    assert.deepEqual({ name: warning?.name, readAs: warning?.readAs }, { name: 'SOPHIA_LIVE_CAPTIONS', readAs: 'off' })
    assert.equal(JSON.stringify(lines).includes('disabled'), false, 'the value itself is not echoed')
  })
})
