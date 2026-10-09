// The bridge process at start (server.ts), in rehearsal: no Google call and an API that is not there. Only what it logs
// before polling is read: the effective settings an operator confirms a release by.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const SERVER = fileURLToPath(new URL('./server.ts', import.meta.url))

/**
 * Reads whole JSON lines off `buffer` into `lines`, and stops at `bridge.start`: a later line in the same chunk (the first
 * failed poll) is not read, so the last line read is always `bridge.start`. Returns what is left, and whether it started.
 */
export function readLines(buffer: string, lines: Record<string, unknown>[]): { rest: string; started: boolean } {
  let rest = buffer
  for (let at = rest.indexOf('\n'); at >= 0; at = rest.indexOf('\n')) {
    const line: unknown = JSON.parse(rest.slice(0, at))
    rest = rest.slice(at + 1)
    if (typeof line !== 'object' || line === null) continue
    lines.push(line as Record<string, unknown>)
    if ((line as Record<string, unknown>).event === 'bridge.start') return { rest, started: true }
  }
  return { rest, started: false }
}

/** The process's environment in rehearsal: no Google call, and an API that is not there. */
const rehearsal = (extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  SOPHIA_LIVE_MODE: 'rehearse',
  // Nothing listens on the discard port: the first poll fails, after the banner.
  SOPHIA_SERVICE_URL: 'http://127.0.0.1:9',
  SOPHIA_MEDIA_BRIDGE_TOKEN: 'synthetic-token',
  SOPHIA_BRIDGE_INSTANCE: 'test',
  ...extra,
})

/** The JSON lines the process writes until `bridge.start`; then it is stopped. */
async function startLines(
  captions: string | undefined,
  extra: NodeJS.ProcessEnv = {},
): Promise<Record<string, unknown>[]> {
  const env = rehearsal({ ...(captions === undefined ? {} : { SOPHIA_LIVE_CAPTIONS: captions }), ...extra })
  const child = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'inherit'] })
  const lines: Record<string, unknown>[] = []
  try {
    await new Promise<void>((resolve, reject) => {
      let buffer = ''
      let started = false
      const timer = setTimeout(() => reject(new Error('no bridge.start within 20 s')), 20_000)
      child.on('exit', (code) => reject(new Error(`exited ${String(code)} before bridge.start`)))
      child.stdout.on('data', (chunk: Buffer) => {
        if (started) return
        ;({ rest: buffer, started } = readLines(buffer + chunk.toString('utf8'), lines))
        if (!started) return
        clearTimeout(timer)
        resolve()
      })
    })
  } finally {
    child.kill('SIGKILL')
  }
  return lines
}

describe('bridge process: reading its start (the check itself)', () => {
  it('stops at bridge.start, though a later line arrives in the same chunk', () => {
    const lines: Record<string, unknown>[] = []
    const chunk = '{"event":"bridge.banner"}\n{"event":"bridge.start","liveCaptions":true}\n{"event":"poll.failed"}\n'
    assert.deepEqual(readLines(chunk, lines), { rest: '{"event":"poll.failed"}\n', started: true })
    assert.deepEqual(
      lines.map((l) => l.event),
      ['bridge.banner', 'bridge.start'],
    )
  })
})

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

describe('bridge process: voice qualification evidence switch (A15)', () => {
  it('bridge.start says whether it is on: off unset, empty or off, on only when on', async () => {
    assert.equal((await startLines(undefined)).at(-1)?.voiceEvidence, false)
    assert.equal((await startLines(undefined, { SOPHIA_VOICE_EVIDENCE: 'off' })).at(-1)?.voiceEvidence, false)
    assert.equal((await startLines(undefined, { SOPHIA_VOICE_EVIDENCE: '' })).at(-1)?.voiceEvidence, false)
    assert.equal((await startLines(undefined, { SOPHIA_VOICE_EVIDENCE: 'on' })).at(-1)?.voiceEvidence, true)
  })

  it('any other value stops the start, before the bridge polls, naming the setting', async () => {
    const env = rehearsal({ SOPHIA_VOICE_EVIDENCE: 'yes' })
    const child = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')))
    // Whichever comes first: the process stops, it starts after all, or 20 s pass. Only the first passes.
    let timer: ReturnType<typeof setTimeout> | undefined
    const outcome = await Promise.race([
      new Promise<string>((resolve) => child.on('exit', (code) => resolve(`exited ${String(code)}`))),
      new Promise<string>((resolve) =>
        child.stdout.on('data', (chunk: Buffer) => {
          if (chunk.toString('utf8').includes('"event":"bridge.start"')) resolve('started')
        }),
      ),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('still running after 20 s'), 20_000)
      }),
    ]).finally(() => {
      clearTimeout(timer)
      child.kill('SIGKILL')
    })
    assert.match(outcome, /^exited [1-9]/)
    assert.match(err, /SOPHIA_VOICE_EVIDENCE is on, off or unset/)
  })
})
