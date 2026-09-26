// The bridge's model of one room exchange (S1-05A, architecture 06 §2–§4, §9, §12). Pure: it decides what may be
// forwarded to Google, what output may be played and to whom a model turn belongs; the adapters only act on it.
//
// Four lifecycles stay apart: the room (LiveKit), the exchange (assignment from the API), the provider connection
// and the audio output. Work is not here at all: nothing in this module can start, hold or stop a task.
//
// Epochs come from the API and only move forward:
//   input epoch       who may address Sophia (the floor). A change settles the current model turn first.
//   playback epoch    Stop Speaking. Output of an older generation is never played.
//   observation epoch Show Sophia this / Stop Looking. Frames of an older epoch are never sent.
// A joined room is not evidence that Google hears anyone: `input` is `admitted` only while the provider is ready,
// the exchange is open, the admitted holder is present and forwarding is not settling a handoff. A guest (or a
// participant whose standing the API did not sign) in the room pauses input and output here at once, before the
// API's pause arrives as a new assignment: the bridge never waits on a round trip to stop disclosing.

/** What the API says the exchange should be (a media assignment, A06). */
export interface Assignment {
  exchangeId: string
  projectId: string
  roomId: string
  state: 'open' | 'paused'
  pauseReason: 'guest' | 'holder_left' | null
  inputEpoch: number
  inputActorId: string | null
  playbackEpoch: number
  observationEpoch: number
  allowVision: boolean
  looking: { participantIdentity: string; source: 'screen' | 'camera' } | null
  roomRevision: number
}

export type ProviderState = 'connecting' | 'ready' | 'recovering' | 'unavailable'
export type InputState = 'closed' | 'admitted' | 'paused' | 'settling'

/** How long a handoff waits for the old holder's model turn to end before it cuts it off. */
export const SETTLE_MS = 1500

/** The speaker a model turn belongs to: the holder whose audio the turn answered. */
export interface Attribution {
  inputEpoch: number
  actorId: string
}

export class ExchangeState {
  assignment: Assignment
  provider: ProviderState = 'connecting'
  /** Identities present in the room right now (trusted: LiveKit participant identities). */
  private present = new Set<string>()
  /** Someone without member standing is in the room: nothing project-aware goes in or out. */
  private guestPresent = false
  /** The input epoch that is effective for forwarding; lags the assignment while a handoff settles. */
  private effectiveEpoch: number
  private effectiveActor: string | null
  private settleUntil = 0
  /** Local output generation: moves on Stop Speaking (playback epoch) and on provider barge-in. */
  private generation = 1
  /** Whose audio the current model turn answers; null before anyone spoke in this exchange. */
  private turn: Attribution | null = null
  private forwardedSinceTurn = false

  constructor(assignment: Assignment) {
    this.assignment = assignment
    this.effectiveEpoch = assignment.inputEpoch
    this.effectiveActor = assignment.inputActorId
  }

  /** Apply a newer assignment. Returns what changed so the session can act (clear output, settle, fence frames). */
  update(next: Assignment, now: number): { handoff: boolean; stopSpeaking: boolean; lookChanged: boolean } {
    const prev = this.assignment
    if (next.exchangeId !== prev.exchangeId) throw new Error('an assignment for another exchange')
    this.assignment = {
      ...next,
      inputEpoch: Math.max(prev.inputEpoch, next.inputEpoch),
      playbackEpoch: Math.max(prev.playbackEpoch, next.playbackEpoch),
      observationEpoch: Math.max(prev.observationEpoch, next.observationEpoch),
    }
    const handoff = this.assignment.inputEpoch > prev.inputEpoch
    const stopSpeaking = this.assignment.playbackEpoch > prev.playbackEpoch
    if (handoff) this.settleUntil = now + SETTLE_MS
    if (stopSpeaking) this.bumpGeneration()
    return { handoff, stopSpeaking, lookChanged: this.assignment.observationEpoch > prev.observationEpoch }
  }

  /**
   * The model turn ended (turnComplete or interrupted): a pending handoff takes effect now, and the turn's speaker
   * with it. A call that comes before the holder is heard again answers no one's audio: it is unattributed.
   */
  turnEnded(): void {
    this.connectionLost()
    this.turn = null
  }

  /**
   * The provider connection dropped mid-turn: a pending handoff takes effect now, but the turn's speaker stands,
   * since a resumed connection may repeat that turn's call (A14).
   */
  connectionLost(): void {
    this.settleUntil = 0
    this.forwardedSinceTurn = false
  }

  /** A turn the bridge asked for (a result notice), not a person: tool calls in it are unattributed. */
  systemTurn(): void {
    this.turn = null
    this.forwardedSinceTurn = false
  }

  /** Called on every tick and before forwarding: a settle that timed out takes effect. */
  private settle(now: number): void {
    if (this.effectiveEpoch === this.assignment.inputEpoch) return
    if (this.settleUntil > now) return
    this.effectiveEpoch = this.assignment.inputEpoch
    this.effectiveActor = this.assignment.inputActorId
    this.turn = null
    this.forwardedSinceTurn = false
  }

  setPresent(identities: Iterable<string>, guestPresent: boolean): void {
    this.present = new Set(identities)
    this.guestPresent = guestPresent
  }

  /** Open as far as the room is concerned: the API has not paused it and no guest is in the room. */
  private isOpen(): boolean {
    return this.assignment.state === 'open' && !this.guestPresent
  }

  input(now: number): InputState {
    this.settle(now)
    if (!this.isOpen()) return 'paused'
    if (this.effectiveEpoch !== this.assignment.inputEpoch) return 'settling'
    if (this.provider !== 'ready' || !this.effectiveActor || !this.present.has(this.effectiveActor)) return 'closed'
    return 'admitted'
  }

  /** May this participant's microphone audio go to Google now? Only the admitted holder's, never anyone else's. */
  mayForwardAudio(identity: string, now: number): boolean {
    return this.input(now) === 'admitted' && identity === this.effectiveActor
  }

  /** Record that holder audio was forwarded: the next model turn answers this epoch's holder. */
  forwarded(): void {
    if (!this.effectiveActor) return
    if (!this.forwardedSinceTurn || !this.turn)
      this.turn = { inputEpoch: this.effectiveEpoch, actorId: this.effectiveActor }
    this.forwardedSinceTurn = true
  }

  /** Whom a tool call belongs to: the holder of the turn it came from, or null (unattributed: ask, never act). */
  attribution(): Attribution | null {
    return this.turn
  }

  /** The output generation audio received now belongs to. */
  currentGeneration(): number {
    return this.generation
  }

  /** Provider barge-in or Stop Speaking: every queued or late chunk of the old generation is dropped. */
  bumpGeneration(): number {
    this.generation += 1
    return this.generation
  }

  mayPlay(generation: number): boolean {
    return generation === this.generation && this.isOpen()
  }

  /** May a frame from this participant's source be sent? Only the selected one, while vision is allowed. */
  mayForwardFrame(identity: string, source: 'screen' | 'camera', observationEpoch: number): boolean {
    const a = this.assignment
    return (
      this.isOpen() &&
      a.allowVision &&
      a.looking !== null &&
      a.looking.participantIdentity === identity &&
      a.looking.source === source &&
      observationEpoch === a.observationEpoch &&
      this.provider === 'ready'
    )
  }
}
