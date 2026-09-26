// Sophia in the room, as a person should read it (S1-05A §6.5): an explicit projection of what is actually
// observed, never of what the room merely allows. Pure, so the rules are unit-tested; React only renders it.
//
//   the snapshot     room.sophia: the exchange (open, paused and why) and the voice the bridge last reported
//   the room         the `sophia` participant's attributes (input, output) as the bridge set them, and
//                    whether her sound actually reaches this browser (her track subscribed, LiveKit hearing her,
//                    autoplay not blocked)
//
// A live LiveKit room is not evidence that Google hears anyone: the light listens only when the bridge says
// the holder's audio is admitted, and speaks only when her sound is reaching this person.
import type { SophiaPresence } from '@sophia/contracts'
import type { LightMode } from '../light/engine.ts'
import type { SophiaLineView } from './room-view.ts'

/** What this browser reads from the `sophia` participant in the room; null when she is not in it. */
export interface SophiaSignal {
  input: string | undefined
  output: string | undefined
  /** Her track is subscribed here and LiveKit detects her speaking. */
  audible: boolean
}

export interface SophiaContext {
  /** This person is in the room (live or reconnecting). */
  inCall: boolean
  /** The browser refused to start audio until the person interacts. */
  audioBlocked: boolean
  /** The floor holder's short name, or null when the floor is open. */
  holderName: string | null
  holderIsMe: boolean
  myMicOn: boolean
  /** Background tasks and goals in progress. */
  working: boolean
  /** Short names by identity ('you' for this person), for "Sophia sees Luis's screen". */
  nameOf: (identity: string) => string
}

export interface SophiaView extends SophiaLineView {
  light: LightMode
  exchange: SophiaPresence['exchange']
  /** Offer Stop Speaking: she is answering or speaking right now. */
  speaking: boolean
  /** The observation indicator: what Sophia is looking at, in words, or null. */
  looking: string | null
  /** Offer Allow audio: she is speaking but this browser blocked the sound. */
  needsAudio: boolean
}

const idle = (working: boolean): LightMode => (working ? 'work' : 'rest')

/** The observation indicator's words, from any view: what Sophia is looking at, or null. */
export function lookingText(presence: SophiaPresence | undefined, nameOf: (identity: string) => string): string | null {
  const look = presence?.looking
  if (!presence || !look || presence.exchange === 'none') return null
  const who = nameOf(look.participantIdentity)
  return `Sophia sees ${who === 'you' ? 'your' : `${who}’s`} ${look.source === 'screen' ? 'screen' : 'camera'}`
}

type Base = Omit<SophiaView, 'exchange' | 'looking'>

const view = (light: LightMode, label: string, note: string | null = null): Base => ({
  light,
  label,
  note,
  inConversation: true,
  speaking: false,
  needsAudio: false,
})

/** Paused, or the voice is not ready: nothing is heard, whatever the room looks like. */
function notHearing(presence: SophiaPresence, ctx: SophiaContext): Base | null {
  const rest = idle(ctx.working)
  if (presence.exchange === 'paused') {
    if (presence.pauseReason === 'guest')
      return view(rest, 'Sophia is paused while a guest is here', 'Resume when the room is members only')
    return view(
      rest,
      `Sophia paused: ${ctx.holderName ?? 'the speaker'} was not in the room`,
      'Resume to talk with her again',
    )
  }
  if (presence.voice === 'unavailable') {
    return view(rest, 'Sophia’s voice is unavailable', presence.reason ?? 'Work and discussion still work.')
  }
  if (presence.voice === 'recovering') return view(rest, 'Reconnecting to Sophia…', 'Work carries on meanwhile.')
  if (presence.voice !== 'ready') return view(rest, 'Sophia is joining…')
  return null
}

function speakingView(signal: SophiaSignal, ctx: SophiaContext): Base | null {
  if (signal.output === 'playing') {
    if (ctx.audioBlocked) {
      return {
        ...view(idle(ctx.working), 'Sophia is speaking, but this browser blocked the sound'),
        needsAudio: true,
        speaking: true,
      }
    }
    if (signal.audible) return { ...view('speak', 'Sophia is speaking'), speaking: true }
  }
  if (signal.output === 'playing' || signal.output === 'responding')
    return { ...view('think', 'Sophia is answering…'), speaking: true }
  return null
}

function inputView(signal: SophiaSignal, ctx: SophiaContext): Base {
  const holder = ctx.holderIsMe ? 'you' : (ctx.holderName ?? 'the speaker')
  if (signal.input === 'admitted') {
    const note = ctx.holderIsMe && !ctx.myMicOn ? 'Your microphone is off' : null
    return view('listen', `Sophia is listening to ${holder}`, note)
  }
  if (signal.input === 'settling') return view('think', `Handing over to ${holder}…`)
  if (signal.input === 'paused') return view(idle(ctx.working), 'Sophia is paused')
  if (!ctx.holderName) return view(idle(ctx.working), 'Sophia is here', 'Take the floor to talk with her')
  return view(idle(ctx.working), 'Sophia is here, not listening yet')
}

/** The whole projection. `presence` is the snapshot's; `signal` null when her participant is not in the room. */
export function sophiaView(
  presence: SophiaPresence | undefined,
  signal: SophiaSignal | null,
  ctx: SophiaContext,
): SophiaView {
  const exchange = presence?.exchange ?? 'none'
  const looking = lookingText(presence, ctx.nameOf)
  if (!presence || exchange === 'none') {
    return { ...view(idle(ctx.working), ''), inConversation: false, exchange, looking }
  }
  const base =
    notHearing(presence, ctx) ??
    (!ctx.inCall
      ? view(idle(ctx.working), 'Sophia is in the conversation', 'Join the room to hear her')
      : !signal
        ? view(idle(ctx.working), 'Sophia is joining…')
        : (speakingView(signal, ctx) ?? inputView(signal, ctx)))
  return { ...base, exchange, looking }
}
