// Who else is in the room on its fixture page, and what Sophia's participant says (docs/plans/room-fixture-people.md):
// synthetic people, her attributes as the bridge sets them, and canvas streams for cameras and a shared screen. The
// query string picks them (`people`, `speaking`, `sophia`, `video`, `sound`); `window.fixture` changes them while the
// page is open. No one here is real, and nothing reaches a server.
import type { VideoFeed } from '../src/features/voice/livekit-room.ts'
import type { RoomParticipant } from '../src/features/voice/room-view.ts'
import type { SophiaSignal } from '../src/features/voice/sophia-view.ts'
import { DEMO } from './demo.ts'

const query = new URLSearchParams(window.location.search)

const NAMES = [
  'Marco',
  'Lucía',
  'Noor',
  'Tomás',
  'Inés',
  'Ana',
  'Diego',
  'Sara',
  'Iván',
  'Julia',
  'Pablo',
  'Elena',
] as const

/** The `n`th other person's actor id (1-based), as the API signs one into a token. */
export const personId = (n: number) => `00000000-0000-4000-8000-0000000000${(0xb0 + n).toString(16)}`

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
/** Who shows their screen (`video=screen`): the `screenBy`th other person, the first unless the page says. */
const screenBy = Math.max(1, Number(query.get('screenBy')) || 1)
/** How many others are in the room (`people`, at most twelve); in the demo, its team (Marco and Lucía) unless asked. */
export const count = Math.min(NAMES.length, Math.max(0, Number(query.get('people') ?? (DEMO ? 2 : 0)) || 0))

/** The `n` the page named, if it is one of the others (1…count), or the viewer too (0) when `viewer` allows it. */
export function oneOfUs(value: string | null, viewer: boolean): number | null {
  const n = value === null || value === '' ? Number.NaN : Number(value)
  return Number.isInteger(n) && n >= (viewer ? 0 : 1) && n <= count ? n : null
}

const first = oneOfUs(query.get('speaking'), true)
const now: { sophia: SophiaState | null; speaking: readonly number[] } = {
  sophia: isState(asked) ? asked : null,
  /** Who speak: 0 the viewer, `n` the `n`th other person; empty, no one. */
  speaking: first === null ? [] : [first],
}

/** Sophia's conversation paused (`paused=`): her bridge pauses what it hears, whatever else it was doing. */
let paused = ['guest', 'holder_left'].includes(query.get('paused') ?? '')

/** The page asked for Sophia's participant: her conversation is open, as `exchange=open` opens it. */
export const sophiaAsked = now.sophia !== null

let changed: () => void = () => undefined

/** What the others follow, by their place among them (`window.fixture.followers`): their `sophia.following`. */
const followingBy = new Map<number, string>()

/** These others follow `versionId`; everyone else follows nothing. */
export function setFollowers(people: readonly number[], versionId: string): void {
  followingBy.clear()
  for (const n of people) followingBy.set(n, versionId)
  changed()
}

/** The others still here, each with their place among the page's people. */
const here = () =>
  NAMES.slice(0, count)
    .map((name, i) => ({ name, i }))
    .filter(({ name }) => !left.has(name))

/** The room's connection hears of a change here as LiveKit's events tell it: it reads its participants again. */
export function onPeopleChange(fn: () => void): void {
  changed = fn
}

/** Those who left the room, by name (`window.fixture.leaves`). */
const left = new Set<string>()

/** Someone leaves the room, as LiveKit's participant leaving: gone from the people and their feeds. */
export function personLeaves(name: string): void {
  left.add(name)
  changed()
}

/**
 * Who an admin muted, took out of the call, or whose camera or screen they stopped (host-controls.md, host-more.md).
 * `muted=n`: the `n`th other person came in with their microphone off.
 */
const mutedAtFirst = oneOfUs(query.get('muted'), false)
const muted = new Set<string>(mutedAtFirst === null ? [] : [personId(mutedAtFirst)])
const removed = new Set<string>()
const cameraOff = new Set<string>()
const screenOff = new Set<string>()
const ACTED = { mute: muted, remove: removed, 'stop-camera': cameraOff, 'stop-screen': screenOff }

/** An admin's act lands, as LiveKit's server applies it: a microphone, camera or screen goes off, or the person leaves. */
export function hostActed(what: keyof typeof ACTED, identity: string): void {
  ACTED[what].add(identity)
  changed()
}

/** The `n`th other person turns their own microphone back on, as only they can after an admin's mute. */
export function unmutes(n: number): void {
  muted.delete(personId(n))
  changed()
}

/** The others in the room, as LiveKit lists remote participants. */
export function others(): RoomParticipant[] {
  return here()
    .map(({ name, i }) => person(name, i))
    .filter((p) => !removed.has(p.identity))
}

function person(name: string, i: number): RoomParticipant {
  return {
    identity: personId(i + 1),
    name,
    speaking: now.speaking.includes(i + 1),
    micOn: !muted.has(personId(i + 1)),
    cameraOn: video === 'camera' && !cameraOff.has(personId(i + 1)),
    // `video=screens`: the first two share at once (two-screens.md).
    screenOn:
      ((video === 'screen' && i === screenBy - 1) || (video === 'screens' && i < 2)) && !screenOff.has(personId(i + 1)),
    local: false,
    // `guest=1`: the last of the others came in as a guest.
    standing: query.has('guest') && i === count - 1 ? 'guest' : 'editor',
    following: followingBy.get(i + 1) ?? null,
    // They came in the order of NAMES, a minute apart.
    joinedAt: Date.UTC(2026, 9, 6, 15) + i * 60_000,
  }
}

/** A name for an actor id, as the room shows it: the viewer's own, an other's, or nobody's. */
export const nameOf = (actorId: string) => NAMES[NAMES.findIndex((_, i) => personId(i + 1) === actorId)] ?? actorId

export const viewerSpeaks = () => now.speaking.includes(0)
export function sophiaSignal(): SophiaSignal | null {
  if (!now.sophia) return null
  return paused ? { ...SIGNALS[now.sophia], input: 'paused' } : SIGNALS[now.sophia]
}
/**
 * `sound=blocked`: the browser blocked the call's sound from the start (autoplay), whoever speaks; `blockSound` blocks
 * it in a call already live, as LiveKit's AudioPlaybackStatusChanged says it (sound-blocked-others.md).
 */
let callSoundBlocked = query.get('sound') === 'blocked'
export const soundBlocked = () => callSoundBlocked || now.sophia === 'blocked'

export function blockSound(): void {
  callSoundBlocked = true
  changed()
}

/** The person allowed sound (Allow audio): as LiveKit's playback starts, every voice reaches this browser, hers too. */
export function allowSound(): void {
  callSoundBlocked = false
  if (now.sophia === 'blocked') now.sophia = 'speaking'
  changed()
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

export function setSpeaking(who: number | readonly number[] | null): void {
  now.speaking = who === null ? [] : typeof who === 'number' ? [who] : who
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
    if (wide && DEMO) {
      drawChart(g, canvas.width, canvas.height)
      return
    }
    g.fillText(wide ? `${label}’s screen (synthetic)` : label.charAt(0), canvas.width / 2, canvas.height / 2)
  }
  draw()
  // Kept for the page's life: one per person and source (at most thirteen), as `kept` holds them.
  window.setInterval(draw, 500)
  return canvas.captureStream(2)
}

/** The demo's shared screen: the pilot's weekly active teams, as Marco shows them (invented numbers). */
function drawChart(g: CanvasRenderingContext2D, width: number, height: number): void {
  const weeks = [14, 14, 12, 12]
  g.textAlign = 'left'
  g.font = '600 22px system-ui, sans-serif'
  g.fillText('Onboarding pilot · active teams by week', 40, 48)
  g.font = '15px system-ui, sans-serif'
  g.fillStyle = '#5b5866'
  g.fillText('14 teams · two regions · Sep 1–28', 40, 76)
  const base = height - 56
  const bar = 70
  weeks.forEach((n, i) => {
    const x = 70 + i * 140
    const h = (n / 14) * (base - 120)
    g.fillStyle = i < 2 ? '#8d79e8' : '#b9a8ff'
    g.fillRect(x, base - h, bar, h)
    g.fillStyle = '#17151f'
    g.font = '600 18px system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText(String(n), x + bar / 2, base - h - 14)
    g.font = '14px system-ui, sans-serif'
    g.fillStyle = '#5b5866'
    g.fillText(`Week ${String(i + 1)}`, x + bar / 2, base + 24)
  })
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

/** The viewer's own camera, once they turn it on: local, as LiveKit's own track is (room-basics.md). */
export function ownFeed(identity: string): VideoFeed {
  const key = `${identity}:camera`
  const known = kept.get(key)
  if (known) return known
  const media = stream('You', false)
  const made: VideoFeed = {
    key,
    identity,
    source: 'camera',
    local: true,
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

/**
 * The cameras and screens on (`video`, `screenBy`: `person`), of those still in the call: one an admin stopped, or
 * someone's they removed, is gone, as LiveKit unpublishes it (#369).
 */
export function feeds(): VideoFeed[] {
  return here().flatMap(({ name, i }) => {
    const p = person(name, i)
    if (removed.has(p.identity)) return []
    return [...(p.cameraOn ? [feed(i + 1, 'camera')] : []), ...(p.screenOn ? [feed(i + 1, 'screen')] : [])]
  })
}
