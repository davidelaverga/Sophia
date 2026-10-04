// Personal's fixture page (e2e/personal.spec.ts): the Studio's own PersonalSpace, inside Places' frame, over a
// labelled simulated conversation that answers. The query string picks it: `talk=new` (nothing said yet: Sophia's
// introduction and the ways to start), else one from yesterday and today; `writing=1` (Sophia is writing her reply);
// `failed=1` (her last reply failed: Ask again); `suggestion=1` (she suggests a note); `notes=open` (the notes beside
// it), `notes=none` (none kept yet); `unavailable=1` (Sophia can't answer now). A message sent here is answered 900 ms later.
// `arrive=1`: yesterday's talk and her line of today, nothing said yet. The parts the API doesn't give yet:
// `memory=1`, `week=1`, `voice=1`, `ready=1` (a session in 10 min), or `all=1` (personal-extras.ts).
// `slow=1`: a message takes 1.5 s on its way, not 0.3, and her answer 2.5 s, not 0.9. `kept=sophia`: the note was Sophia's. `window.personalFixture.sent` lists what was sent; `pressed`, what those parts were asked.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { PersonalReceipt, PersonalSpace as Space, PersonalTurn } from '@sophia/contracts'
import { StrictMode, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Sending } from '../src/features/personal/conversation-view.ts'
import type { TalkLine } from '../src/features/personal/extras.ts'
import { PersonalSpace } from '../src/features/personal/PersonalSpace.tsx'
import type { PersonalWrites } from '../src/features/personal/usePersonal.ts'
import { projectsFor, useExtras } from './personal-extras.ts'
import '../src/app/theme.css'
import '../src/features/personal/personal.css'

declare global {
  interface Window {
    personalFixture?: { sent: string[]; pressed: string[] }
  }
}

const query = new URLSearchParams(window.location.search)
const sent: string[] = []
const pressed: string[] = []
window.personalFixture = { sent, pressed }
// `at=HH:MM`: the fixture's clock stands at that time today (her light follows the hour).
const NOW = ((at) => {
  const [, h, m] = /^(\d{1,2}):(\d{2})$/.exec(at ?? '')?.map(Number) ?? []
  const now = new Date()
  if (h !== undefined && m !== undefined && h < 24 && m < 60) now.setHours(h, m, 0, 0)
  return now
})(query.get('at'))
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const ahead = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()
const DAY = 24 * 60
// `away=N`: the earlier day's turns are N days back, not one (time away; where you began).
const BEFORE = Math.max(1, Number(query.get('away')) || 1) * DAY

let seq = 0
const turn = (
  author: PersonalTurn['author'],
  text: string,
  at: string,
  over: Partial<PersonalTurn> = {},
): PersonalTurn => {
  seq += 1
  return {
    id: `turn-${String(seq)}`,
    seq,
    author,
    text,
    createdAt: at,
    replyTo: null,
    reply: author === 'person' ? 'answered' : null,
    suggestion: null,
    ...over,
  }
}

function talk(): PersonalTurn[] {
  if (query.get('talk') === 'new') return []
  const turns = [
    turn('person', 'I have a pitch on Friday and I keep putting off the deck.', ago(BEFORE + 42)),
    turn('sophia', 'What part of it feels heaviest when you open the file?', ago(BEFORE + 41)),
    turn('person', 'The numbers. I’m not sure they hold.', ago(BEFORE + 40)),
    turn('sophia', 'Then start there, with one number you trust. The rest can lean on it.', ago(BEFORE + 39)),
    turn('person', 'The launch felt rushed and I keep replaying the meeting with the team.', ago(14)),
    turn(
      'sophia',
      'Work can take up a lot of room. Is this something to keep here, or to carry to your team later?',
      ago(13),
    ),
    turn(
      'person',
      'Keep it here for now. I promised a date I couldn’t keep, and Davide was quiet the whole time.',
      ago(6),
    ),
  ]
  if (query.has('arrive')) {
    return [...turns.slice(0, 4), turn('sophia', 'Morning, Luis. How are you arriving today?', ago(2))]
  }
  const last = turns.at(-1)
  if (!last) return turns
  if (query.has('writing')) return turns.map((t) => (t === last ? { ...t, reply: 'pending' } : t))
  if (query.has('failed')) return turns.map((t) => (t === last ? { ...t, reply: 'failed' } : t))
  const suggestion = query.has('suggestion')
    ? { id: 'suggestion-1', text: 'Say the date you can keep, before Thursday', state: 'open' as const }
    : null
  return [
    ...turns,
    turn('sophia', 'That sounds heavy. What would you say to him if it were just the two of you?', ago(5), {
      suggestion,
    }),
  ]
}

/** A voice this page can hear (dictation.ts): it listens, and hears nothing until it is stopped. */
class QuietRecognition extends EventTarget {
  lang = ''
  interimResults = false
  continuous = false
  processLocally = true
  static available = () => Promise.resolve('available')
  static install = () => Promise.resolve(true)
  start() {
    return undefined
  }
  stop() {
    this.dispatchEvent(new Event('end'))
  }
  abort() {
    return undefined
  }
}
Reflect.set(globalThis, 'SpeechRecognition', QuietRecognition)

const receipt = (operation: PersonalReceipt['operation']): PersonalReceipt => ({
  operation,
  revision: 1,
  turnId: null,
  seq: null,
  suggestionId: null,
  noteId: null,
  releaseId: null,
  projectId: null,
  erased: null,
})

/** The space as first read: the query string picks its turns and notes. */
const firstSpace = (): Space => ({
  companion: query.has('unavailable') ? 'unavailable' : 'rehearsal',
  revision: 1,
  turns: talk(),
  earlier: false,
  notes:
    query.get('notes') === 'none'
      ? []
      : [
          {
            id: 'note-1',
            text: 'Start the deck from one number I trust',
            keptBy: query.get('kept') === 'sophia' ? 'sophia' : 'person',
            fromTurnId: null,
            createdAt: ago(DAY),
          },
        ],
  releases: [],
  epoch: 1,
  days: 2,
})

/** What a live talk said, written as turns; a note kept from her look back. */
function writtenBy(setSpace: (next: (s: Space) => Space) => void) {
  return {
    talk: (lines: readonly TalkLine[]) =>
      setSpace((s) => ({
        ...s,
        // Her lines in a talk answer what was said before them: never read as a greeting.
        turns: [
          ...s.turns,
          ...lines.map((l, i) =>
            turn(l.who === 'you' ? 'person' : 'sophia', l.text, new Date().toISOString(), {
              replyTo: l.who === 'sophia' && i > 0 ? `talk-${String(i - 1)}` : null,
            }),
          ),
        ],
      })),
    keep: (text: string) =>
      setSpace((s) => ({
        ...s,
        notes: [
          ...s.notes,
          {
            id: `note-${String(s.notes.length + 1)}`,
            text,
            keptBy: 'sophia',
            fromTurnId: null,
            createdAt: new Date().toISOString(),
          },
        ],
      })),
  }
}

/** The space and its writes, as the API would keep them: a message is listed at once and answered 900 ms later. */
function useSimulated() {
  const [space, setSpace] = useState<Space>(firstSpace)
  const [sending, setSending] = useState<Sending | null>(null)
  const [busy, setBusy] = useState(false)
  const answer = useRef(0)
  const add = (t: PersonalTurn) => setSpace((s) => ({ ...s, revision: s.revision + 1, turns: [...s.turns, t] }))
  const writes: PersonalWrites = {
    sending,
    busy,
    welcoming: false,
    erasures: 0,
    readAgain: () => undefined,
    resume: () => Promise.resolve(receipt('resume')),
    send: async (text) => {
      sent.push(text)
      setBusy(true)
      setSending({ text, at: new Date(), epoch: 1 })
      await new Promise((r) => setTimeout(r, query.has('slow') ? 1500 : 300))
      add(turn('person', text, new Date().toISOString(), { reply: 'pending' }))
      setSending(null)
      setBusy(false)
      window.clearTimeout(answer.current)
      answer.current = window.setTimeout(
        () => {
          setSpace((s) => ({
            ...s,
            turns: s.turns.map((t) => (t.reply === 'pending' ? { ...t, reply: 'answered' } : t)),
          }))
          add(turn('sophia', 'I’m here. Tell me more about that.', new Date().toISOString()))
        },
        query.has('slow') ? 2500 : 900,
      )
      return receipt('send_turn')
    },
    retry: () => Promise.resolve(receipt('retry_turn')),
    decide: () => Promise.resolve(receipt('decide_suggestion')),
    // A note kept is in the notes as the API reads it back.
    keep: (text, turnId) => {
      const id = `note-${String(Date.now())}`
      setSpace((s) => ({
        ...s,
        notes: [...s.notes, { id, text, keptBy: 'person', fromTurnId: turnId, createdAt: new Date().toISOString() }],
      }))
      return Promise.resolve({ ...receipt('keep_note'), noteId: id })
    },
    forget: (id) => {
      setSpace((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }))
      return Promise.resolve(receipt('forget_note'))
    },
    carry: () => Promise.resolve(receipt('carry_note')),
    takeBack: () => Promise.resolve(receipt('take_back')),
    erase: () => Promise.resolve(receipt('erase')),
  }
  return { space, writes, wrote: writtenBy(setSpace) }
}

const idle = { state: 'ready' as const, failed: '', retry: () => undefined }

function Personal() {
  const { space, writes, wrote } = useSimulated()
  const extras = useExtras(query, pressed, ago, wrote)
  const projects = useMemo(() => projectsFor(query, ahead), [])
  const [notes, setNotes] = useState(query.get('notes') === 'open')
  const [earlier, setEarlier] = useState(false)
  const [locked, setLocked] = useState(false)
  return (
    <div className="places" data-place="personal">
      {/* The places' bar, as Places draws it above every place: a talk must cover it too. */}
      <header className="topbar places-bar">
        <button type="button" className="ghost">
          Home
        </button>
      </header>
      <button className="fixture-lock" type="button" onClick={() => setLocked((was) => !was)}>
        {locked ? 'Unlock (fixture)' : 'Lock (fixture)'}
      </button>
      <PersonalSpace
        hidden={locked}
        handed={null}
        onHanded={() => undefined}
        locked={locked}
        now={NOW}
        account="fixture"
        name="Luis"
        space={space}
        epoch={space.epoch}
        readBack={{ older: [], more: false, readMore: () => Promise.resolve() }}
        read={idle}
        projects={projects}
        projectsRead={idle}
        writes={writes}
        notes={{ open: notes, set: setNotes }}
        earlier={{ open: earlier, set: setEarlier }}
        edge={{ badge: 0, pulse: 0 }}
        toast={() => undefined}
        onCarried={() => undefined}
        onCross={() => undefined}
        onStartProject={() => undefined}
        extras={extras}
      />
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('personal.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — a conversation with Sophia, no account
    </p>
    <Personal />
  </StrictMode>,
)
