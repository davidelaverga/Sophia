// One room exchange on the bridge (architecture 06 §2–§12, S1-05A §6): the LiveKit room, one Gemini Live
// connection and the API's assignment, joined by the pure ExchangeState. This module acts; ExchangeState decides.
//
//  - Only the admitted holder's microphone reaches Google, and only while the exchange is open, no guest is in
//    the room and the provider is ready. A handoff ends the old holder's audio stream and settles (or cancels)
//    the model turn before the new holder is heard.
//  - Stop Speaking and barge-in move the playback generation: queued output is cleared at the AudioSource, and
//    the rest of an interrupted model turn is dropped. Neither touches background work.
//  - A tool call acts for the holder whose audio the turn answered (the API binds it to that input epoch); an
//    unattributed call, or one arriving while paused, is answered with a question and never executed. A call
//    from an older connection is never answered on a newer one.
//  - GoAway or a lost connection: stale output stops, the latest resumption handle is used once the new
//    connection is ready; a handle that fails is dropped and the next connection starts cold.
//  - The room's state (what the bridge observes, never content) is reported to the API and set as the `sophia`
//    participant's attributes, so the room's light shows what is actually happening.
import type { FunctionCall, FunctionResponse } from '@google/genai'
import type { MediaAssignment } from '@sophia/contracts'
import { base64ToPcm, FormatError, InputChunker, isAudible, OUTPUT_RATE, OutputFramer, pcmRate } from './audio.ts'
import { type Assignment, ExchangeState, type InputState } from './exchange-state.ts'
import { type ConnectLive, type LiveEvents, type LiveLink, systemInstruction } from './live-session.ts'
import type { JoinRoom, RoomLink, RoomPerson, VisualSource } from './rtc.ts'
import type { MediaService } from './service.ts'
import { isToolName, refusedResponse, toolResponse } from './tools.ts'
import { FrameSampler, type RgbaFrame, toJpeg } from './vision.ts'

export type Log = (event: string, detail?: Record<string, unknown>) => void

export interface SessionDeps {
  service: MediaService
  joinRoom: JoinRoom
  connectLive: ConnectLive
  apiKey: string
  model: string
  bridgeInstanceId: string
  now: () => number
  log: Log
  /** The tick scheduler; tests drive `tick()` themselves and pass a no-op. */
  every?: (fn: () => void, ms: number) => () => void
  /** Called once when LiveKit gives up on the room, so the bridge can replace the session promptly. */
  lost?: (exchangeId: string) => void
}

const everyInterval = (fn: () => void, ms: number) => {
  const timer = setInterval(fn, ms)
  return () => clearInterval(timer)
}

export const TICK_MS = 100
/** The bridge reports what it observes at least this often; the API treats 20 s of silence as unavailable. */
export const PRESENCE_EVERY_MS = 5000
/** A holder who left gets this long to come back before the floor is cleared (compare-and-set, A15). */
export const HOLDER_GRACE_MS = 5000
/** How long after the last frame handed to the AudioSource the room still hears Sophia (its 200 ms queue). */
const PLAYING_TAIL_MS = 250
const RECONNECT_DELAYS_MS = [250, 1000, 2000, 4000, 8000]
/** A room join that failed is tried again after these waits, then every 30 s. */
const JOIN_RETRY_MS = [1000, 2000, 5000, 10_000]
/** A stopped reply that has not started within this long is not coming: the fence lapses. */
const STOPPED_REPLY_WAIT_MS = 8000
/** Once a stopped reply's audio pauses this long, it is over. */
const STOPPED_TAIL_MS = 3000
const UNAVAILABLE_RETRY_MS = 30_000
const CALL_ID = /^[A-Za-z0-9_.:-]{1,64}$/

export const toAssignment = (a: MediaAssignment): Assignment => ({
  exchangeId: a.exchangeId,
  projectId: a.projectId,
  roomId: a.roomId,
  state: a.state,
  pauseReason: a.pauseReason,
  inputEpoch: a.inputEpoch,
  inputActorId: a.inputActorId,
  playbackEpoch: a.playbackEpoch,
  observationEpoch: a.observationEpoch,
  allowVision: a.allowVision,
  looking: a.looking,
  roomRevision: a.roomRevision,
})

const isGuestLike = (p: RoomPerson) => p.standing === 'guest' || p.standing === 'unknown'

/** For logs: how many people of each standing, never who. */
function standings(people: readonly RoomPerson[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of people) counts[p.standing] = (counts[p.standing] ?? 0) + 1
  return counts
}

const epochs = (a: MediaAssignment) => ({
  state: a.state,
  pauseReason: a.pauseReason,
  inputEpoch: a.inputEpoch,
  playbackEpoch: a.playbackEpoch,
  observationEpoch: a.observationEpoch,
})

/** For logs: a tool response's status (ok, admitted, refused, clarify, error), never its output. */
function statusOf(response: FunctionResponse): unknown {
  const output: unknown = response.response?.output
  return typeof output === 'object' && output !== null && 'status' in output ? output.status : undefined
}
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export type OutputState = 'idle' | 'responding' | 'playing'
/** Why a reply may still be on its way: the model is producing it, Google transcribed words, or sound was heard. */
type PendingReply = 'responding' | 'transcript' | 'sound'

/** What the room is told about Sophia (attributes on the `sophia` participant): observed state, no content. */
export interface Observed {
  voice: 'connecting' | 'ready' | 'recovering' | 'unavailable'
  input: InputState
  output: OutputState
  inputEpoch: number
  generation: number
}

interface HolderAbsence {
  actorId: string
  inputEpoch: number
  since: number
  goneReported: boolean
}

export class RoomSession {
  readonly exchangeId: string
  private readonly deps: SessionDeps
  private readonly state: ExchangeState
  private assignment: MediaAssignment
  private room: RoomLink | null = null
  private live: LiveLink | null = null
  private connection: number
  private connecting = false
  private handle: string | null = null
  private everReady = false
  private readyConnection = 0
  private reconnectAt: number | null = null
  private attempts = 0
  private reason: string | null = null
  private closed = false
  /** The room connection is down: nobody is heard or played to, and presence is not reported (it is unknown). */
  private roomDown = false
  /** LiveKit gave up on the room: the bridge replaces this session. */
  lost = false
  private people: RoomPerson[] = []
  private readonly chunker = new InputChunker()
  private readonly framer = new OutputFramer()
  private readonly sampler = new FrameSampler()
  /** The model is producing audio for a turn that has not ended. */
  private responding = false
  /**
   * The holder said something (Google transcribed words) and the reply has not ended: a reply may be on its way
   * before its first audio chunk, and Stop Speaking must fence it too.
   */
  private awaitingReply = false
  /**
   * When the holder's forwarded audio last carried sound since the model's turn ended (null: not since). Google may
   * answer it before it sends any transcript, so a stop fences that reply too.
   */
  private heardAt: number | null = null
  /** Stop Speaking or a pause mid-turn: until this time, the rest of that model turn is dropped, not played later. */
  private discardUntil = 0
  private playingUntil = 0
  private pumping = false
  private pauseApplied = false
  private wasSettling = false
  private absence: HolderAbsence | null = null
  private lastReport = 0
  private reportDirty = true
  private reporting = false
  private published = ''
  private readonly acked = new Set<string>()
  private readonly announced = new Set<string>()
  private readonly cancelled = new Set<string>()
  private stopTicking: (() => void) | null = null
  private joining = false
  private joinAttempts = 0
  private joinRetryAt: number | null = null

  constructor(assignment: MediaAssignment, deps: SessionDeps) {
    this.exchangeId = assignment.exchangeId
    this.assignment = assignment
    this.deps = deps
    this.state = new ExchangeState(toAssignment(assignment))
    // Unique across bridge restarts: tool-call idempotency keys include it (amendment A06).
    this.connection = Math.floor(deps.now())
  }

  /** Join the room first (so guests are seen before anything is heard), then connect Google. */
  async start(): Promise<void> {
    this.deps.log('session.start', {
      exchangeId: this.exchangeId,
      roomId: this.assignment.roomId,
      state: this.assignment.state,
    })
    this.stopTicking = (this.deps.every ?? everyInterval)(() => this.tick(), TICK_MS)
    this.applyPause()
    this.ackQuiesce()
    await this.join()
  }

  /**
   * Join the room with the latest assignment's token. A failure is retried with backoff, with each newer
   * assignment's fresh token; until then Sophia is unavailable, and says why.
   */
  private async join(): Promise<void> {
    if (this.closed || this.joining || this.room) return
    const token = this.assignment.roomToken
    if (!token) return this.joinFailed('The room service is not configured for Sophia')
    this.joining = true
    let room: RoomLink
    try {
      room = await this.deps.joinRoom(token, {
        people: (people) => this.onPeople(people),
        audio: (identity, samples, rate, channels) => this.onAudio(identity, samples, rate, channels),
        frame: (identity, source, frame, at) => this.onFrame(identity, source, frame, at),
        connection: (state, reason) => this.onRoomConnection(state, reason),
      })
    } catch (err: unknown) {
      return this.joinFailed(`Sophia could not join the room: ${message(err)}`)
    } finally {
      this.joining = false
    }
    if (this.isClosed()) return void room.close().catch(() => undefined)
    this.room = room
    this.joinAttempts = 0
    this.joinRetryAt = null
    this.state.provider = this.live ? this.state.provider : 'connecting'
    this.reason = null
    room.watch(this.assignment.looking)
    this.onPeople(room.people())
    this.deps.log('room.joined', { exchangeId: this.exchangeId, people: standings(this.people) })
    if (!this.live) await this.connect()
  }

  private joinFailed(reason: string): void {
    this.fail(reason)
    this.joinRetryAt = this.deps.now() + (JOIN_RETRY_MS[this.joinAttempts] ?? 30_000)
    this.joinAttempts += 1
  }

  private isClosed(): boolean {
    return this.closed
  }

  private fail(reason: string): void {
    this.state.provider = 'unavailable'
    this.reason = reason
    this.reportDirty = true
    this.deps.log('session.unavailable', { exchangeId: this.exchangeId, reason })
  }

  /** The API's newer view of this exchange. */
  update(next: MediaAssignment): void {
    const pending = this.pendingReply(this.deps.now())
    const before = this.assignment
    const change = this.state.update(toAssignment(next), this.deps.now())
    this.assignment = next
    if (change.handoff || change.stopSpeaking || change.lookChanged || before.state !== next.state) {
      this.deps.log('assignment.changed', { exchangeId: this.exchangeId, ...epochs(next), ...change })
    }
    if (change.handoff) this.handoff()
    if (change.stopSpeaking) this.silence(pending)
    if (change.lookChanged) {
      this.sampler.clear()
      this.room?.watch(next.looking)
    }
    this.applyPause()
    this.ackQuiesce()
    this.reportDirty = true
  }

  /** The exchange ended or moved away: leave the room and close Google. Work is untouched. */
  async close(): Promise<void> {
    this.deps.log('session.close', { exchangeId: this.exchangeId, lost: this.lost })
    this.closed = true
    this.stopTicking?.()
    this.connection += 1
    this.live?.close()
    this.live = null
    await this.room?.close().catch((err: unknown) => this.deps.log('room.close_failed', { error: message(err) }))
    this.room = null
  }

  /** What the bridge observes now: for the room's attributes, the API's presence and tests. */
  observed(): Observed {
    const now = this.deps.now()
    const s = this.state
    const output: OutputState = this.playingUntil > now ? 'playing' : this.responding ? 'responding' : 'idle'
    return {
      voice: s.provider,
      input: s.input(now),
      output,
      inputEpoch: s.assignment.inputEpoch,
      generation: s.currentGeneration(),
    }
  }

  // Room side ----------------------------------------------------------------------------------------------------

  private onPeople(people: RoomPerson[]): void {
    this.people = people
    const members = people.filter((p) => !isGuestLike(p)).map((p) => p.identity)
    this.state.setPresent(members, this.roomDown || people.some(isGuestLike))
    this.applyPause()
    this.checkHolder()
    this.reportDirty = true
  }

  private onRoomConnection(state: 'connected' | 'reconnecting' | 'disconnected', reason: string | null): void {
    this.deps.log('room.connection', { exchangeId: this.exchangeId, state, reason })
    // Until the room is back its presence is unknown: treat it as not member-only, locally (no report).
    this.roomDown = state !== 'connected'
    this.onPeople(this.room?.people() ?? [])
    if (state === 'disconnected' && !this.lost) {
      this.lost = true
      void this.close()
      this.deps.lost?.(this.exchangeId)
    }
  }

  private onAudio(identity: string, samples: Int16Array, rate: number, channels: number): void {
    const live = this.live
    if (!live || !this.state.mayForwardAudio(identity, this.deps.now())) return
    try {
      this.chunker.push(samples, rate, channels)
    } catch (err: unknown) {
      if (err instanceof FormatError) return this.deps.log('audio.refused', { error: err.message })
      throw err
    }
    for (let chunk = this.chunker.take(); chunk; chunk = this.chunker.take()) {
      live.sendAudio(chunk)
      this.state.forwarded()
      if (isAudible(chunk)) this.heardAt = this.deps.now()
    }
  }

  private onFrame(identity: string, source: VisualSource, frame: RgbaFrame, capturedAt: number): void {
    const epoch = this.state.assignment.observationEpoch
    if (!this.state.mayForwardFrame(identity, source, epoch)) return
    this.sampler.offer({ ...frame, capturedAt, observationEpoch: epoch })
  }

  /** Nothing of the old holder reaches Google after the epoch moved: end their stream, drop what is buffered. */
  private handoff(): void {
    this.chunker.clear()
    this.live?.sendAudioStreamEnd()
    this.absence = null
  }

  /**
   * Stop Speaking (the generation already moved): clear the source and drop the rest of the current turn. A reply
   * that may still be on its way is fenced; the log says why, since a fence set on sound alone can also drop the
   * next reply when nothing was pending (the stale reply playing after a stop would be worse).
   */
  private silence(pending: PendingReply | null): void {
    this.room?.clearPlayback()
    this.framer.clear()
    this.playingUntil = 0
    if (!pending) return
    this.discardUntil = this.deps.now() + STOPPED_REPLY_WAIT_MS
    this.deps.log('audio.reply_fenced', { exchangeId: this.exchangeId, because: pending })
  }

  /**
   * Whether a reply may be on its way, and why: the model is producing one, Google transcribed the holder's words,
   * or the holder's forwarded audio carried sound recently enough that a reply to it could still start.
   */
  private pendingReply(now: number): PendingReply | null {
    if (this.responding) return 'responding'
    if (this.awaitingReply) return 'transcript'
    return this.heardAt !== null && now - this.heardAt < STOPPED_REPLY_WAIT_MS ? 'sound' : null
  }

  /** Paused (by the API, or locally for a guest): input closed, output cleared, once per pause. */
  private applyPause(): void {
    const paused = this.state.input(this.deps.now()) === 'paused'
    if (!paused) {
      this.pauseApplied = false
      return
    }
    if (this.pauseApplied) return
    this.pauseApplied = true
    this.chunker.clear()
    this.sampler.clear()
    this.live?.sendAudioStreamEnd()
    this.state.bumpGeneration()
    this.silence(this.pendingReply(this.deps.now()))
  }

  /** A guest is waiting for their token: confirm input is closed and output cleared (case A12). */
  private ackQuiesce(): void {
    const requestId = this.assignment.quiesceRequestId
    if (!requestId || !this.pauseApplied || this.acked.has(requestId)) return
    this.acked.add(requestId)
    const ack = {
      requestId,
      bridgeInstanceId: this.deps.bridgeInstanceId,
      inputClosed: true,
      outputCleared: true,
    } as const
    this.deps.service.ackQuiesce(ack).catch((err: unknown) => {
      this.acked.delete(requestId)
      this.deps.log('quiesce.ack_failed', { requestId, error: message(err) })
    })
  }

  /** The holder left: pause at once; still gone after the grace, clear the floor by compare-and-set (S1-05A §7). */
  private checkHolder(): void {
    const actorId = this.assignment.inputActorId
    const inputEpoch = this.assignment.inputEpoch
    if (!this.room || !actorId || this.people.some((p) => p.identity === actorId)) {
      this.absence = null
      return
    }
    const now = this.deps.now()
    const same = this.absence?.actorId === actorId && this.absence.inputEpoch === inputEpoch
    if (!this.absence || !same) {
      this.absence = { actorId, inputEpoch, since: now, goneReported: false }
      this.holderEvent('left')
    } else if (!this.absence.goneReported && now - this.absence.since >= HOLDER_GRACE_MS) {
      this.absence.goneReported = true
      this.holderEvent('gone')
    }
  }

  private holderEvent(event: 'left' | 'gone'): void {
    const absence = this.absence
    if (!absence) return
    const body = { exchangeId: this.exchangeId, actorId: absence.actorId, inputEpoch: absence.inputEpoch, event }
    this.deps.service.holder(body).catch((err: unknown) => {
      if (event === 'gone' && this.absence === absence) absence.goneReported = false
      this.deps.log('holder.event_failed', { event, error: message(err) })
    })
  }

  // Provider side ------------------------------------------------------------------------------------------------

  private async connect(): Promise<void> {
    if (this.closed || this.connecting) return
    this.connecting = true
    this.connection += 1
    const connection = this.connection
    const resumed = this.handle !== null
    try {
      const link = await this.deps.connectLive(
        {
          apiKey: this.deps.apiKey,
          model: this.deps.model,
          systemInstruction: systemInstruction(this.everReady && !resumed),
          resumptionHandle: this.handle,
        },
        this.events(connection),
      )
      // close() and recover() move the connection on, so a stale or closed session never keeps the link.
      if (connection !== this.connection) link.close()
      else this.live = link
    } catch (err: unknown) {
      if (connection === this.connection) this.recover(`connect failed: ${message(err)}`)
    } finally {
      this.connecting = false
    }
  }

  private events(connection: number): LiveEvents {
    const current = () => connection === this.connection && !this.closed
    return {
      setupComplete: () => {
        if (current()) this.ready(connection)
      },
      toolCalls: (calls) => {
        if (current()) for (const call of calls) void this.runTool(call, connection)
      },
      toolCancellations: (ids) => {
        for (const id of ids) this.cancelled.add(`${connection}:${id}`)
      },
      interrupted: () => {
        if (current()) this.bargeIn()
      },
      audio: (data, mimeType) => {
        if (current()) this.audioOut(data, mimeType)
      },
      // Transcripts are not retained or published (S1-05A A05: only under a test's explicit scope).
      inputTranscript: (text) => {
        if (current() && text.trim()) this.awaitingReply = true
      },
      outputTranscript: () => undefined,
      generationComplete: () => undefined,
      turnComplete: () => {
        if (current()) this.turnComplete()
      },
      goAway: (timeLeft) => {
        if (current()) this.recover(`provider going away (${timeLeft ?? 'now'})`)
      },
      resumption: (handle) => {
        if (current() && handle) this.handle = handle
      },
      usage: (usage) => this.deps.log('provider.usage', { totalTokens: usage.totalTokenCount }),
      closed: (reason) => {
        if (current()) this.recover(reason)
      },
    }
  }

  private ready(connection: number): void {
    this.deps.log('provider.ready', { exchangeId: this.exchangeId, connection, resumed: this.handle !== null })
    this.state.provider = 'ready'
    this.readyConnection = connection
    this.everReady = true
    this.attempts = 0
    this.reason = null
    this.reportDirty = true
  }

  /** Stop stale output, forget the connection and schedule the next one (resumed if a handle is held). */
  private recover(reason: string): void {
    if (this.closed) return
    const failedBeforeReady = this.readyConnection !== this.connection
    this.connection += 1
    this.live?.close()
    this.live = null
    // A handle that failed twice in a row before the connection was ready is dropped: the next start is cold.
    if (failedBeforeReady && this.attempts >= 1) this.handle = null
    this.chunker.clear()
    this.state.bumpGeneration()
    this.silence(null)
    this.endTurn()
    const delay = RECONNECT_DELAYS_MS[this.attempts]
    this.attempts += 1
    this.state.provider = delay === undefined ? 'unavailable' : 'recovering'
    this.reason = delay === undefined ? `Sophia’s voice service is unavailable: ${reason}` : null
    this.reconnectAt = this.deps.now() + (delay ?? UNAVAILABLE_RETRY_MS)
    this.reportDirty = true
    this.deps.log('provider.recover', { exchangeId: this.exchangeId, reason, attempt: this.attempts })
  }

  private bargeIn(): void {
    this.state.bumpGeneration()
    this.silence(null)
    this.endTurn()
  }

  private turnComplete(): void {
    this.endTurn()
  }

  private endTurn(): void {
    this.state.turnEnded()
    this.responding = false
    this.awaitingReply = false
    this.heardAt = null
    this.discardUntil = 0
  }

  private audioOut(data: string, mimeType: string | undefined): void {
    const generation = this.state.currentGeneration()
    const now = this.deps.now()
    if (this.discardUntil > now) {
      // The stopped reply is still arriving: keep dropping it while it lasts.
      this.discardUntil = Math.max(this.discardUntil, now + STOPPED_TAIL_MS)
      return
    }
    if (!this.state.mayPlay(generation)) return
    let samples: Int16Array
    try {
      const rate = pcmRate(mimeType)
      if (rate !== OUTPUT_RATE) throw new FormatError(`output at ${rate} Hz; the room track is ${OUTPUT_RATE} Hz`)
      samples = base64ToPcm(data)
    } catch (err: unknown) {
      if (err instanceof FormatError) return this.deps.log('audio.output_refused', { error: err.message })
      throw err
    }
    this.responding = true
    this.framer.push(samples, generation)
    void this.pump()
  }

  /** Feed the AudioSource with backpressure; anything of an older generation is never played. */
  private async pump(): Promise<void> {
    const room = this.room
    if (this.pumping || !room) return
    this.pumping = true
    try {
      for (;;) {
        const generation = this.state.currentGeneration()
        const frame = this.state.mayPlay(generation) ? this.framer.next(generation) : undefined
        if (!frame) break
        await room.play(frame)
        this.playingUntil = this.deps.now() + PLAYING_TAIL_MS
      }
    } catch (err: unknown) {
      this.deps.log('audio.playback_failed', { error: message(err) })
    } finally {
      this.pumping = false
    }
  }

  private async runTool(call: FunctionCall, connection: number): Promise<void> {
    const id = call.id ?? ''
    const name = call.name ?? ''
    const response = await this.toolOutcome(id, name, call.args ?? {}, connection)
    // Never answer a call the provider cancelled, or one from a connection that has since been replaced.
    if (connection !== this.connection || this.cancelled.has(`${connection}:${id}`)) {
      return this.deps.log('tool.dropped', { exchangeId: this.exchangeId, name, connection })
    }
    this.live?.sendToolResponses([response])
    this.deps.log('tool.answered', { exchangeId: this.exchangeId, name, status: statusOf(response), connection })
  }

  private async toolOutcome(
    id: string,
    name: string,
    args: Record<string, unknown>,
    connection: number,
  ): Promise<FunctionResponse> {
    const call = { id, name }
    if (!CALL_ID.test(id) || !isToolName(name))
      return toolResponse(call, { status: 'error', output: { reason: 'Unknown tool' } })
    if (this.state.input(this.deps.now()) === 'paused') {
      return refusedResponse(call, 'The conversation is paused; ask again when it resumes.')
    }
    const who = this.state.attribution()
    if (!who)
      return refusedResponse(call, 'I couldn’t tell who asked that. Could the person holding the floor ask again?')
    try {
      const result = await this.deps.service.toolCall({
        exchangeId: this.exchangeId,
        connectionGeneration: connection,
        callId: id,
        name,
        args,
        inputEpoch: who.inputEpoch,
        actorId: who.actorId,
      })
      return toolResponse(call, result)
    } catch (err: unknown) {
      this.deps.log('tool.failed', { name, error: message(err) })
      return toolResponse(call, { status: 'error', output: { reason: 'The tool failed; nothing was changed.' } })
    }
  }

  // The tick ------------------------------------------------------------------------------------------------------

  /** Settles, frames, holder grace, reconnects, announcements and reports. */
  tick(): void {
    if (this.closed) return
    const now = this.deps.now()
    this.settled(now)
    this.applyPause()
    this.sendFrame(now)
    this.checkHolder()
    if (this.joinRetryAt !== null && now >= this.joinRetryAt) {
      this.joinRetryAt = null
      void this.join()
    }
    if (this.reconnectAt !== null && now >= this.reconnectAt) {
      this.reconnectAt = null
      void this.connect()
    }
    this.announce(now)
    this.publish(now)
  }

  /** A handoff that timed out while the old holder's turn was still speaking cancels that turn's output. */
  private settled(now: number): void {
    const settling = this.state.input(now) === 'settling'
    const pending = this.pendingReply(now)
    if (this.wasSettling && !settling && pending) {
      this.state.bumpGeneration()
      this.silence(pending)
    }
    this.wasSettling = settling
  }

  private sendFrame(now: number): void {
    const looking = this.state.assignment.looking
    const frame = this.sampler.take(now, this.state.assignment.observationEpoch)
    if (!frame || !looking || !this.live) return
    if (!this.state.mayForwardFrame(looking.participantIdentity, looking.source, frame.observationEpoch)) return
    this.live.sendFrame(toJpeg(frame))
  }

  /** A finished brief is announced once, when Sophia is idle and the room is member-only. */
  private announce(now: number): void {
    const live = this.live
    const input = this.state.input(now)
    const busy = this.responding || this.awaitingReply || this.playingUntil > now
    if (!live || this.state.provider !== 'ready' || busy) return
    if (input === 'paused' || input === 'settling') return
    const next = this.assignment.results.find((r) => !this.announced.has(`${r.taskId}:${r.resultRevision}`))
    if (!next) return
    this.announced.add(`${next.taskId}:${next.resultRevision}`)
    this.state.systemTurn()
    live.sendNotice(
      `[Sophia system notice] The brief you drafted is ready in the project (taskId ${next.taskId}). ` +
        'Tell the room in one short sentence. Read it only if someone asks (read_selected_source with that taskId).',
    )
    const event = { exchangeId: this.exchangeId, taskId: next.taskId, resultRevision: next.resultRevision }
    this.deps.service
      .announced(event)
      .catch((err: unknown) => this.deps.log('announce.record_failed', { error: message(err) }))
  }

  /** Room attributes when they change; the API's presence when it changed or every PRESENCE_EVERY_MS. */
  private publish(now: number): void {
    const o = this.observed()
    const attributes = {
      'sophia.voice': o.voice,
      'sophia.input': o.input,
      'sophia.output': o.output,
      'sophia.inputEpoch': String(o.inputEpoch),
    }
    const key = JSON.stringify(attributes)
    if (this.room && key !== this.published) {
      this.published = key
      this.room.setState(attributes).catch((err: unknown) => {
        this.published = ''
        this.deps.log('room.attributes_failed', { error: message(err) })
      })
    }
    const due = this.reportDirty || now - this.lastReport >= PRESENCE_EVERY_MS
    if (this.room && !this.roomDown && !this.reporting && due) this.report(now)
  }

  private report(now: number): void {
    this.reporting = true
    this.reportDirty = false
    this.lastReport = now
    const participants = this.people.map((p) => ({ identity: p.identity, standing: p.standing }))
    this.deps.service
      .presence({
        roomId: this.assignment.roomId,
        exchangeId: this.exchangeId,
        bridgeInstanceId: this.deps.bridgeInstanceId,
        voice: this.state.provider,
        reason: this.reason,
        participants,
      })
      .catch((err: unknown) => {
        this.reportDirty = true
        this.deps.log('presence.report_failed', { error: message(err) })
      })
      .finally(() => {
        this.reporting = false
      })
  }
}
