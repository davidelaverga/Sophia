// Who else is in the room on its fixture page, and what Sophia's participant says (docs/plans/room-fixture-people.md):
// synthetic people, her attributes as the bridge sets them, and canvas streams for cameras and a shared screen. The
// query string picks them (`people`, `speaking`, `sophia`, `video`); `window.fixture` changes them while the page is
// open. No one here is real, and nothing reaches a server.
import type { VideoFeed } from '../src/features/voice/livekit-room.ts'
import type { RoomParticipant } from '../src/features/voice/room-view.ts'
import type { SophiaSignal } from '../src/features/voice/sophia-view.ts'

const query = new URLSearchParams(window.location.search)

const NAMES = ['Marco', 'Lucía', 'Noor', 'Tomás', 'Inés'] as const

/** The `n`th other person's actor id (1-based), as the API signs one into a token. */
export const personId = (n: number) => `00000000-0000-4000-8000-0000000000b${String(n)}`

/**
 * Sophia as the page can ask for her: the attributes her bridge sets (`sophia.input`: closed, admitted, settling or
 * paused; `sophia.output`: idle, responding or playing; room-session.ts), and whether her sound reaches this browser.
 */
const SIGNALS = {
  here: { input: 'closed', output: 'idle', audible: false },
  listening: { input: 'admitted', output: 'idle', audible: false },
  settling: { input: 'settling', output: 'idle', audible: false },
  answering: { input: 'admitted', output: 'responding', audible: false },
  speaking: { input: 'admitted', output: 'playing', audible: true },
  blocked: { input: 'admitted', output: 'playing', audible: true },
} satisfies Record<string, SophiaSignal>

export type SophiaState = keyof typeof SIGNALS

const isState = (value: string | null): value is SophiaState => value !== null && Object.hasOwn(SIGNALS, value)

const asked = query.get('sophia')
const video = query.get('video')
/** How many others are in the room (`people`, at most five). */
export const count = Math.min(NAMES.length, Math.max(0, Number(query.get('people')) || 0))

/** The `n` the page named, if it is one of the others (1…count), or the viewer too (0) when `viewer` allows it. */
export function oneOfUs(value: string | null, viewer: boolean): number | null {
  const n = value === null || value === '' ? Number.NaN : Number(value)
  return Number.isInteger(n) && n >= (viewer ? 0 : 1) && n <= count ? n : null
}

const now = {
  sophia: isState(asked) ? asked : null,
  /** Who speaks: 0 the viewer, `n` the `n`th other person, null no one. */
  speaking: oneOfUs(query.get('speaking'), true),
}

/** Sophia's conversation paused (`paused=`): her bridge pauses what it hears, whatever else it was doing. */
let paused = ['guest', 'holder_left'].includes(query.get('paused') ?? '')

/** The page asked for Sophia's participant: her conversation is open, as `exchange=open` opens it. */
export const sophiaAsked = now.sophia !== null

let changed: () => void = () => undefined

/** The room's connection hears of a change here as LiveKit's events tell it: it reads its participants again. */
export function onPeopleChange(fn: () => void): void {
  changed = fn
}

/** The others in the room, as LiveKit lists remote participants. */
export function others(): RoomParticipant[] {
  return NAMES.slice(0, count).map((name, i) => ({
    identity: personId(i + 1),
    name,
    speaking: now.speaking === i + 1,
    micOn: true,
    cameraOn: video === 'camera',
    screenOn: video === 'screen' && i === 0,
    local: false,
    standing: 'editor',
  }))
}

/** A name for an actor id, as the room shows it: the viewer's own, an other's, or nobody's. */
export const nameOf = (actorId: string) => NAMES[NAMES.findIndex((_, i) => personId(i + 1) === actorId)] ?? actorId

export const viewerSpeaks = () => now.speaking === 0
export function sophiaSignal(): SophiaSignal | null {
  if (!now.sophia) return null
  return paused ? { ...SIGNALS[now.sophia], input: 'paused' } : SIGNALS[now.sophia]
}
export const soundBlocked = () => now.sophia === 'blocked'

/** The person allowed sound (Allow audio): as LiveKit's playback starts, her voice reaches this browser. */
export function allowSound(): void {
  if (now.sophia === 'blocked') setSophia('speaking')
}

/**
 * The pause is over (the floor reclaimed after its holder left): her bridge admits the new holder, who is here, and
 * listens to them.
 */
export function endPause(): void {
  paused = false
  if (now.sophia) now.sophia = 'listening'
  changed()
}

/** Sophia's participant says this now; null, she left the room. */
export function setSophia(state: SophiaState | null): void {
  now.sophia = state
  changed()
}

export function setSpeaking(who: number | null): void {
  now.speaking = who
  changed()
}

/** A synthetic picture for a feed: the person's initial on a quiet field, redrawn so the stream keeps frames. */
function stream(label: string, wide: boolean): MediaStream {
  const canvas = document.createElement('canvas')
  canvas.width = wide ? 640 : 320
  canvas.height = wide ? 360 : 200
  const g = canvas.getContext('2d')
  const draw = () => {
    if (!g) return
    g.fillStyle = wide ? '#e9e7f2' : '#1b1924'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = wide ? '#17151f' : '#f1dcc7'
    g.font = `600 ${wide ? 28 : 56}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(wide ? `${label}’s screen (synthetic)` : label.charAt(0), canvas.width / 2, canvas.height / 2)
  }
  draw()
  // Kept for the page's life: one per person and source (at most six), as `kept` holds them.
  window.setInterval(draw, 500)
  return canvas.captureStream(2)
}

/** One feed per person and source, kept: the stage attaches each once, as it does a LiveKit track. */
const kept = new Map<string, VideoFeed>()

function feed(n: number, source: 'camera' | 'screen'): VideoFeed {
  const key = `${personId(n)}:${source}`
  const known = kept.get(key)
  if (known) return known
  const media = stream(NAMES[n - 1] ?? '', source === 'screen')
  const made: VideoFeed = {
    key,
    identity: personId(n),
    source,
    local: false,
    attach: (el) => {
      el.srcObject = media
    },
    detach: (el) => {
      el.srcObject = null
    },
  }
  kept.set(key, made)
  return made
}

/** The cameras on (`video=camera`), or the first person's shared screen (`video=screen`). */
export function feeds(): VideoFeed[] {
  if (video === 'camera') return others().map((_, i) => feed(i + 1, 'camera'))
  if (video === 'screen' && count > 0) return [feed(1, 'screen')]
  return []
}
