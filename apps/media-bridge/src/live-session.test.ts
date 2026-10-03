// The provider setup the bridge actually sends (M01_PROMPT_LOADING §7.2, cases T19 and T21): the real `@google/genai`
// SDK, driven by the bridge's own connector, talks to a local WebSocket endpoint standing in for Google, and the test
// reads the setup frame off the wire. No Google model or key is involved; the frame is what Google would receive.
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { GUIDE_DIR, loadMissionGuide, type GuideVersion } from './guide.ts'
import { geminiLive, type LiveEvents } from './live-session.ts'
import { DECLARED_NAMES, TOOL_SETS } from './tools.ts'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** One server frame: FIN + text opcode, unmasked, with the length in the smallest form. */
function textFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const head =
    payload.length < 126
      ? Buffer.from([0x81, payload.length])
      : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff])
  return Buffer.concat([head, payload])
}

/** Complete client frames at the start of `buf` (masked, as clients must send), and what is left. */
function readFrames(buf: Buffer): { messages: string[]; rest: Buffer } {
  const messages: string[] = []
  let at = 0
  for (;;) {
    if (buf.length - at < 2) break
    const opcode = (buf[at] ?? 0) & 0x0f
    let length = (buf[at + 1] ?? 0) & 0x7f
    let offset = at + 2
    if (length === 126) {
      length = buf.readUInt16BE(offset)
      offset += 2
    } else if (length === 127) {
      length = Number(buf.readBigUInt64BE(offset))
      offset += 8
    }
    if (buf.length < offset + 4 + length) break
    const mask = buf.subarray(offset, offset + 4)
    const payload = Buffer.from(buf.subarray(offset + 4, offset + 4 + length).map((b, i) => b ^ (mask[i % 4] ?? 0)))
    if (opcode === 0x1) messages.push(payload.toString('utf8'))
    at = offset + 4 + length
  }
  return { messages, rest: buf.subarray(at) }
}

/** A stand-in for Google's Live endpoint: it records each connection's first message and answers setupComplete. */
class LocalLiveEndpoint {
  readonly setups: unknown[] = []
  private readonly server: Server = createServer()
  private readonly sockets = new Set<Duplex>()

  async start(): Promise<string> {
    this.server.on('upgrade', (req: IncomingMessage, socket: Duplex) => this.accept(req, socket))
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${String((this.server.address() as AddressInfo).port)}`
  }

  private accept(req: IncomingMessage, socket: Duplex): void {
    this.sockets.add(socket)
    const key = req.headers['sec-websocket-key'] ?? ''
    const accept = createHash('sha1').update(`${key}${WS_GUID}`).digest('base64')
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    let pending: Buffer = Buffer.alloc(0)
    let first = true
    socket.on('data', (chunk: Buffer) => {
      const { messages, rest } = readFrames(Buffer.concat([pending, chunk]))
      pending = rest
      for (const message of messages) {
        if (!first) continue
        first = false
        this.setups.push(JSON.parse(message))
        socket.write(textFrame(JSON.stringify({ setupComplete: {} })))
      }
    })
    socket.on('error', () => undefined)
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy()
    await new Promise((resolve) => this.server.close(resolve))
  }
}

const noEvents: LiveEvents = {
  setupComplete: () => undefined,
  toolCalls: () => undefined,
  toolCancellations: () => undefined,
  interrupted: () => undefined,
  audio: () => undefined,
  inputTranscript: () => undefined,
  outputTranscript: () => undefined,
  generationComplete: () => undefined,
  turnComplete: () => undefined,
  goAway: () => undefined,
  resumption: () => undefined,
  usage: () => undefined,
  closed: () => undefined,
}

// oxlint-disable-next-line typescript/no-explicit-any -- the setup frame is Google's wire JSON, read field by field
type Setup = any

describe('the provider setup frame (T19, T21)', () => {
  const endpoint = new LocalLiveEndpoint()
  let baseUrl: string
  before(async () => {
    baseUrl = await endpoint.start()
  })
  after(() => endpoint.stop())

  async function setupOf(version: GuideVersion, resumptionHandle: string | null): Promise<Setup> {
    const connect = geminiLive({ baseUrl })
    const options = {
      apiKey: 'test-key',
      model: 'gemini-3.8-live',
      systemInstruction: loadMissionGuide(TOOL_SETS[version].names, GUIDE_DIR, version).instruction,
      tools: TOOL_SETS[version].declarations,
      resumptionHandle,
    }
    const link = await connect(options, noEvents)
    link.close()
    const frame = endpoint.setups.at(-1) as { setup: Setup }
    assert.ok(frame.setup, 'the first message is the setup')
    return frame.setup
  }

  for (const version of ['v1.1', 'v1.2'] as const) {
    const guide = loadMissionGuide(TOOL_SETS[version].names, GUIDE_DIR, version)
    it(`carries exactly the checked ${version} instruction, once, and that version’s declared operations`, async () => {
      const setup = await setupOf(version, null)
      const parts: Array<{ text?: string }> = setup.systemInstruction.parts
      assert.equal(parts.length, 1, 'one instruction part: no second copy of the skill, no appended prose')
      const text = parts[0]?.text ?? ''
      assert.equal(text, guide.instruction)
      assert.equal(createHash('sha256').update(text, 'utf8').digest('hex'), guide.combined.sha256)
      assert.equal(Buffer.byteLength(text, 'utf8'), guide.combined.bytes)
      const tools: Array<{ functionDeclarations?: Array<{ name: string; behavior: string }> }> = setup.tools
      const declarations = tools.flatMap((t) => t.functionDeclarations ?? [])
      assert.deepEqual(
        declarations.map((d) => d.name),
        guide.operationNames,
      )
      assert.ok(declarations.every((d) => d.behavior === 'NON_BLOCKING'))
      assert.match(setup.model, /gemini-3\.8-live$/)
      assert.deepEqual(setup.generationConfig.responseModalities, ['AUDIO'], 'the media configuration is unchanged')
      assert.deepEqual(setup.sessionResumption, {})
    })
  }

  it('v1.1 declares M01’s six exactly as before, and v1.2 adds research without changing the other five', async () => {
    type Declared = {
      name: string
      description?: string
      parametersJsonSchema?: { properties?: Record<string, { description?: string }> }
    }
    const declared = async (version: GuideVersion) =>
      ((await setupOf(version, null)).tools as Array<{ functionDeclarations?: Declared[] }>).flatMap(
        (t) => t.functionDeclarations ?? [],
      )
    const older = await declared('v1.1')
    const newer = await declared('v1.2')
    assert.deepEqual(
      older.map((d) => d.name),
      DECLARED_NAMES,
    )
    // M01's six as Google receives them, byte for byte as before CX-0026.
    const wire = createHash('sha256').update(JSON.stringify(older), 'utf8').digest('hex')
    assert.equal(wire, '9717b92ed6e587f3e8df8cef4ad8b9559e316ca3b222137ac69e9e53cedffea4')
    // v1.2's as Google receives them: the digest provider.setup logs, so a setup receipt names what was sent.
    const wireV12 = createHash('sha256').update(JSON.stringify(newer), 'utf8').digest('hex')
    assert.equal(wireV12, '57cdfdadd238ceb5851045d1da1bd2c12a72547b406144a3f10f6f694598dcf6')
    assert.deepEqual([wire, wireV12], [TOOL_SETS['v1.1'].sha256, TOOL_SETS['v1.2'].sha256])
    assert.deepEqual(newer.slice(0, 5), older.slice(0, 5))
    assert.deepEqual(
      newer.slice(5).map((d) => d.name),
      ['control_work', 'start_research', 'render_research'],
    )
    // CX-0026, deliberately: v1.2's Steer says where it reaches and that a refused control changed nothing, and a
    // follow-up says the report is edited in place.
    const [control, research] = newer.slice(5)
    assert.match(
      String(control?.description),
      / Steer reaches only research that project_status shows waiting or running; a finished report is changed with start_research and amendsTaskId\. Do not say a control took effect before its result arrives; a refused control changed nothing\.$/,
    )
    assert.match(
      String(research?.parametersJsonSchema?.properties?.amendsTaskId?.description),
      /^A finished research task this request revises\. The report is edited in place: /,
    )
  })

  it('v1.2’s start_research asks Google for the whole request, and for the scope the speaker stated (CX-0030)', async () => {
    type Research = {
      name: string
      parametersJsonSchema: {
        properties: { question: { description: string }; scope: { properties: Record<string, unknown> } }
      }
    }
    const tools = (await setupOf('v1.2', null)).tools as Array<{ functionDeclarations?: Research[] }>
    const research = tools.flatMap((t) => t.functionDeclarations ?? []).find((d) => d.name === 'start_research')
    assert.ok(research)
    const { question, scope } = research.parametersJsonSchema.properties
    assert.match(question.description, /^The whole request in the speaker’s own words and language: /)
    assert.deepEqual(Object.keys(scope.properties), ['change', 'keep', 'length', 'sections', 'maxSearches', 'maxReads'])
  })

  it('a resumed connection sends the same instruction bytes with its handle, and nothing else changes', async () => {
    const fresh = await setupOf('v1.2', null)
    const resumed = await setupOf('v1.2', 'handle-7')
    assert.equal(resumed.sessionResumption.handle, 'handle-7')
    assert.deepEqual({ ...resumed, sessionResumption: {} }, fresh)
  })
})
