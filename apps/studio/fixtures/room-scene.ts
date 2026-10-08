// The demo's room, alive (docs/plans/room-alive.md): asked in, Sophia says where the project stands, from its own
// report, her words captioned as she says them; then Marco takes the floor and asks aloud, and she listens to him.
// Only the floor's holder is captioned (CX-0019), so he takes it before he speaks. Her presses cut the scene short: a
// line under way ends cut off, and nothing more is said. Every word is synthetic; the runtime writes the real ones.
import type { ChatCaption } from '@sophia/contracts/room-chat'
import { EXCHANGE } from './data.ts'
import { deliverCaption } from './fake-livekit.ts'
import { personId, setSophia, setSpeaking } from './fake-people.ts'

/** Her first words, as she says them: each piece of a caption is the words that came since the last. */
const HERS = [
  'I’m here.',
  ' Twelve of the fourteen pilot teams',
  ' are still active;',
  ' the two that left both changed their admin',
  ' in week three.',
  ' Where do you want to start?',
]
const MARCOS = ['With the two that left.', ' What would have kept them?']

/** How long a piece of a line takes to say, and the pauses before her line and between the two. */
const PIECE_MS = 420
const BEFORE_MS = 700
const BETWEEN_MS = 900

const timers: number[] = []
let said = 0
/** The lines being said now, by caption id: whose, and the pieces sent so far. */
const open = new Map<string, { who: string | null; sent: number }>()
/** Marco is speaking because the scene said so: only then does stopping it quiet him. */
let marcoSays = false

/** A caption id of this page's own, as the bridge gives each line one. */
function nextId(): string {
  said += 1
  return `00000000-0000-4000-8000-0000005c${said.toString(16).padStart(4, '0')}`
}

const packet = (
  id: string,
  who: string | null,
  sequence: number,
  state: ChatCaption['state'],
  text: string,
): ChatCaption => ({
  kind: 'caption',
  id,
  exchangeId: EXCHANGE,
  speaker: who === null ? 'sophia' : 'member',
  actorId: who,
  sequence,
  state,
  text,
})

const later = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms))
}

/** A line said piece by piece from `at` ms, then ended; `done` once it is. Returns when it ends. */
function line(pieces: readonly string[], who: string | null, at: number, done: () => void): number {
  const id = nextId()
  pieces.forEach((text, i) => {
    later(at + i * PIECE_MS, () => {
      open.set(id, { who, sent: i + 1 })
      deliverCaption(packet(id, who, i + 1, 'partial', text))
    })
  })
  const end = at + pieces.length * PIECE_MS
  later(end, () => {
    open.delete(id)
    deliverCaption(packet(id, who, pieces.length + 1, 'final', ''))
    done()
  })
  return end
}

/**
 * Asked in, in the demo: she speaks her first words; then Marco takes the floor (`takeFloor`, as the API passes it)
 * and asks aloud.
 */
export function sophiaArrives(takeFloor: (actorId: string) => void): void {
  stopScene()
  const marco = personId(1)
  later(BEFORE_MS, () => setSophia('speaking'))
  const hersEnd = line(HERS, null, BEFORE_MS, () => setSophia('listening'))
  later(hersEnd + BETWEEN_MS / 2, () => takeFloor(marco))
  later(hersEnd + BETWEEN_MS, () => {
    marcoSays = true
    setSpeaking(1)
  })
  line(MARCOS, marco, hersEnd + BETWEEN_MS, () => {
    marcoSays = false
    setSpeaking(null)
  })
}

/** Her presses: nothing more of the scene is said, and a line under way ends cut off where it was. */
export function stopScene(): void {
  for (const t of timers.splice(0)) window.clearTimeout(t)
  for (const [id, { who, sent }] of open) deliverCaption(packet(id, who, sent + 1, 'interrupted', ''))
  open.clear()
  if (marcoSays) setSpeaking(null)
  marcoSays = false
}
