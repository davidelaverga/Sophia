// Personal's fixture page (e2e/personal.spec.ts): the Studio's own PersonalSpace, inside Places' frame, over a
// labelled simulated conversation that answers. The query string picks it: `talk=new` (nothing said yet: Sophia's
// introduction and the ways to start), else one from yesterday and today; `writing=1` (Sophia is writing her reply);
// `failed=1` (her last reply failed: Ask again); `suggestion=1` (she suggests a note); `notes=open` (the notes beside
// it); `unavailable=1` (Sophia can't answer now). A message sent here is answered 900 ms later.
// `window.personalFixture.sent` lists what was sent.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { PersonalReceipt, PersonalSpace as Space, PersonalTurn } from '@sophia/contracts'
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Sending } from '../src/features/personal/conversation-view.ts'
import { PersonalSpace } from '../src/features/personal/PersonalSpace.tsx'
import type { PersonalWrites } from '../src/features/personal/usePersonal.ts'
import '../src/app/theme.css'
import '../src/features/personal/personal.css'

declare global {
  interface Window {
    personalFixture?: { sent: string[] }
  }
}

const query = new URLSearchParams(window.location.search)
const sent: string[] = []
window.personalFixture = { sent }
const NOW = new Date()
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const DAY = 24 * 60

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
    turn('person', 'I have a pitch on Friday and I keep putting off the deck.', ago(DAY + 42)),
    turn('sophia', 'What part of it feels heaviest when you open the file?', ago(DAY + 41)),
    turn('person', 'The numbers. I’m not sure they hold.', ago(DAY + 40)),
    turn('sophia', 'Then start there, with one number you trust. The rest can lean on it.', ago(DAY + 39)),
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

/** The space and its writes, as the API would keep them: a message is listed at once and answered 900 ms later. */
function useSimulated() {
  const [space, setSpace] = useState<Space>(() => ({
    companion: query.has('unavailable') ? 'unavailable' : 'rehearsal',
    revision: 1,
    turns: talk(),
    earlier: false,
    notes: [
      {
        id: 'note-1',
        text: 'Start the deck from one number I trust',
        keptBy: 'person',
        fromTurnId: null,
        createdAt: ago(DAY),
      },
    ],
    releases: [],
    epoch: 1,
    days: 2,
  }))
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
      await new Promise((r) => setTimeout(r, 300))
      add(turn('person', text, new Date().toISOString(), { reply: 'pending' }))
      setSending(null)
      setBusy(false)
      window.clearTimeout(answer.current)
      answer.current = window.setTimeout(() => {
        setSpace((s) => ({
          ...s,
          turns: s.turns.map((t) => (t.reply === 'pending' ? { ...t, reply: 'answered' } : t)),
        }))
        add(turn('sophia', 'I’m here. Tell me more about that.', new Date().toISOString()))
      }, 900)
      return receipt('send_turn')
    },
    retry: () => Promise.resolve(receipt('retry_turn')),
    decide: () => Promise.resolve(receipt('decide_suggestion')),
    keep: () => Promise.resolve(receipt('keep_note')),
    forget: () => Promise.resolve(receipt('forget_note')),
    carry: () => Promise.resolve(receipt('carry_note')),
    takeBack: () => Promise.resolve(receipt('take_back')),
    erase: () => Promise.resolve(receipt('erase')),
  }
  return { space, writes }
}

const idle = { state: 'ready' as const, failed: '', retry: () => undefined }

function Personal() {
  const { space, writes } = useSimulated()
  const [notes, setNotes] = useState(query.get('notes') === 'open')
  const [earlier, setEarlier] = useState(false)
  return (
    <div className="places" data-place="personal">
      <PersonalSpace
        hidden={false}
        handed={null}
        onHanded={() => undefined}
        locked={false}
        now={NOW}
        account="fixture"
        name="Luis"
        space={space}
        epoch={space.epoch}
        readBack={{ older: [], more: false, readMore: () => Promise.resolve() }}
        read={idle}
        projects={[]}
        projectsRead={idle}
        writes={writes}
        notes={{ open: notes, set: setNotes }}
        earlier={{ open: earlier, set: setEarlier }}
        edge={{ badge: 0, pulse: 0 }}
        toast={() => undefined}
        onCarried={() => undefined}
        onCross={() => undefined}
        onStartProject={() => undefined}
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
