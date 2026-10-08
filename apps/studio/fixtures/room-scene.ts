// The demo's room, alive (docs/plans/room-alive.md): asked in, Sophia says where the project stands, from its own
// report, her words captioned as she says them; then Marco answers aloud, and she listens. Her presses cut it short:
// Stop speaking ends her line, End the whole scene. Every word is synthetic; the runtime writes the real ones.
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
/** Her line while she is saying it: its caption id and the pieces sent so far. */
let saying: { id: string; sent: number } | null = null
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
      if (who === null) saying = { id, sent: i + 1 }
      deliverCaption(packet(id, who, i + 1, 'partial', text))
    })
  })
  const end = at + pieces.length * PIECE_MS
  later(end, () => {
    deliverCaption(packet(id, who, pieces.length + 1, 'final', ''))
    done()
  })
  return end
}

/** Asked in, in the demo: she speaks her first words, then Marco answers aloud. */
export function sophiaArrives(): void {
  stopScene()
  const marco = personId(1)
  later(BEFORE_MS, () => setSophia('speaking'))
  const hersEnd = line(HERS, null, BEFORE_MS, () => {
    saying = null
    setSophia('listening')
  })
  later(hersEnd + BETWEEN_MS, () => {
    marcoSays = true
    setSpeaking(1)
  })
  line(MARCOS, marco, hersEnd + BETWEEN_MS, () => {
    marcoSays = false
    setSpeaking(null)
  })
}

/** Her presses: nothing more of the scene is said, and her line, if she was saying it, is cut where it was. */
export function stopScene(): void {
  for (const t of timers.splice(0)) window.clearTimeout(t)
  if (saying) deliverCaption(packet(saying.id, null, saying.sent + 1, 'interrupted', ''))
  saying = null
  if (marcoSays) setSpeaking(null)
  marcoSays = false
}
