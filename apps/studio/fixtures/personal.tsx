// Personal's fixture page (e2e/personal.spec.ts): the Studio's own PersonalSpace, inside Places' frame, over a
// labelled simulated conversation that answers. The query string picks it: `talk=new` (nothing said yet: Sophia's
// introduction and the ways to start), else one from yesterday and today; `writing=1` (Sophia is writing her reply);
// `failed=1` (her last reply failed: Ask again); `suggestion=1` (she suggests a note); `notes=open` (the notes beside
// it), `notes=none` (none kept yet); `unavailable=1` (Sophia can't answer now). A message sent here is answered 900 ms later.
// `arrive=1`: yesterday's talk and her line of today, nothing said yet. The parts the API doesn't give yet:
// `memory=1` (`=old`: one learned last year), `week=1`, `voice=1`, `ready=1` (a session in 10 min), or `all=1` (personal-extras.ts).
// `spaceAfter=ms`, `epochAfter=ms`: the space, or its epoch, read that much later; `readSlow=1`: earlier days take
// 1.5 s. `slow=1`: a message takes 1.5 s on its way, not 0.3, and her answer 2.5 s, not 0.9. `kept=sophia`: the note was Sophia's. `holdReply=1`: her answer waits for `window.personalFixture.answer()`. `window.personalFixture.sent` lists what was sent; `pressed`, what those parts were asked.
import { ApiError } from '../src/api/client.ts'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { PersonalReceipt, PersonalSpace as Space, PersonalTurn } from '@sophia/contracts'
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Sending } from '../src/features/personal/conversation-view.ts'
import type { TalkLine } from '../src/features/personal/extras.ts'
import { useSharedRead } from '../src/features/personal/shared-read.ts'
import { PersonalSpace } from '../src/features/personal/PersonalSpace.tsx'
import type { PersonalWrites } from '../src/features/personal/usePersonal.ts'
import { projectsFor, useExtras } from './personal-extras.ts'
import { useEscape } from '../src/features/personal/useEscape.ts'
import { DEMO, DEMO_LABEL } from './demo.ts'
import { companionReply } from './personal-replies.ts'
import '../src/app/theme.css'
import '../src/features/personal/personal.css'

declare global {
  interface Window {
    personalFixture?: {
      sent: string[]
      pressed: string[]
      answer?: () => void
      carried: string[]
      takenBack: string[]
      /** The account leaves (signing out): Personal goes from the page, as App's leaveSession takes it. */
      signOut?: () => void
      /** Personal left for another place, and come back to: the notes' Escape layer goes and opens again, as Places'. */
      away?: () => void
      back?: () => void
    }
  }
}

const query = new URLSearchParams(window.location.search)
const sent: string[] = []
const pressed: string[] = []
const carried: string[] = []
const takenBack: string[] = []
window.personalFixture = { sent, pressed, carried, takenBack }
/** `carryFails=N`: the Nth carry fails, once (a package stops there); `carryLost=N`: it lands, its reply lost. */
let carries = 0
/** The fixture's account, signed in until `signOut` (the writes' `here`). */
const account = { present: true }
/** `takeBackFails=N`: the Nth take-back fails, once; `takeBackLost=N`: it lands, its reply lost. */
let takes = 0
/** Each release taken back, and the key it was taken back under: asked again, the API answers by that key. */
const takeKeys = new Map<string, string | undefined>()
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
// `longReply=1`: her answer runs to several lines.
const LONG_REPLY =
  'I’m here. It sounds like the meeting stayed with you longer than the work did. Before we get to what you could ' +
  'say to him, tell me what you noticed in yourself when he went quiet: was it worry about the date, or about how ' +
  'he sees you now? We can take either one first, slowly.'
// `away=N`: the earlier day's turns are N days back, not one (time away; where you began).
const BEFORE = Math.max(1, Number(query.get('away')) || 1) * DAY
/** Her answer to a message sent here. */
const REPLY = query.has('longReply') ? LONG_REPLY : 'I’m here. Tell me more about that.'

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
  // `heard=words`: what it heard, said as it stops.
  stop() {
    const heard = query.get('heard')
    if (heard) this.dispatchEvent(Object.assign(new Event('result'), { results: [[{ transcript: heard }]] }))
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
          // `many=1`: three notes, a finding, Sophia's suggestion and an unfinished thought (personal-carry checks).
          ...(query.has('many')
            ? [
                {
                  id: 'note-2',
                  text: 'Ask finance for the March close',
                  keptBy: 'sophia' as const,
                  fromTurnId: null,
                  createdAt: ago(DAY),
                },
                {
                  id: 'note-3',
                  text: 'Unfinished: whether the pilot needs a second region',
                  keptBy: 'person' as const,
                  fromTurnId: null,
                  createdAt: ago(DAY),
                },
              ]
            : []),
        ],
  releases: [],
  epoch: 1,
  days: 2,
})

/**
 * Carried and taken back as the API records them, each once (personal-carry checks): a carried note leaves the notes,
 * as the space reads only kept ones. `carryFails=N`: the Nth carry fails; `takeBackFails=1`: the first take-back does.
 */
function carryWritesFor(setSpace: (next: (s: Space) => Space) => void): Pick<PersonalWrites, 'carry' | 'takeBack'> {
  return {
    carry: (noteId, projectId) => {
      carries += 1
      if (carries === Number(query.get('carryFails'))) return Promise.reject(new TypeError('Failed to fetch'))
      carried.push(`${noteId}>${projectId}`)
      setSpace((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== noteId) }))
      if (carries === Number(query.get('carryLost'))) {
        return Promise.reject(new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key'))
      }
      const done = { ...receipt('carry_note'), releaseId: `release-${noteId}`, projectId }
      // `carrySlow=1`: each carry's reply takes 1.5 s.
      return query.has('carrySlow') ? new Promise((r) => setTimeout(() => r(done), 1500)) : Promise.resolve(done)
    },
    takeBack: (releaseId, key) => {
      takes += 1
      if (takes === Number(query.get('takeBackFails'))) return Promise.reject(new TypeError('Failed to fetch'))
      // `takenElsewhere=1`: Work (or another tab) took it back first, under its own key.
      if (query.has('takenElsewhere')) takeKeys.set(releaseId, 'elsewhere')
      if (takeKeys.has(releaseId)) {
        // Asked again: under the same key, the answer it had; under another, the release is gone.
        if (key !== undefined && takeKeys.get(releaseId) === key) return Promise.resolve(receipt('take_back'))
        return Promise.reject(new ApiError(404, 'not_found', 'That isn’t there any more.', 'never'))
      }
      takenBack.push(releaseId)
      takeKeys.set(releaseId, key)
      if (takes === Number(query.get('takeBackLost'))) {
        return Promise.reject(new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key'))
      }
      return Promise.resolve(receipt('take_back'))
    },
  }
}

/** What a live talk said, written as turns; a note kept from her look back. */
function writtenBy(setSpace: (next: (s: Space) => Space) => void) {
  return {
    talk: (lines: readonly TalkLine[]) => {
      // Her lines in a talk answer what was said before them: never read as a greeting. Made once, outside the update.
      const said = lines.map((l, i) =>
        turn(l.who === 'you' ? 'person' : 'sophia', l.text, new Date().toISOString(), {
          replyTo: l.who === 'sophia' && i > 0 ? `talk-${String(i - 1)}` : null,
        }),
      )
      setSpace((s) => ({ ...s, turns: [...s.turns, ...said] }))
    },
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

/**
 * The space once Sophia answered `text`: the message answered, her words after it. The demo's Sophia answers with what
 * you told her before this (personal-replies.ts); the checks keep one line.
 */
function answered(s: Space, text: string, hers: PersonalTurn): Space {
  const turns = s.turns.map((t) => (t.reply === 'pending' ? { ...t, reply: 'answered' as const } : t))
  // What came before the message answered; were it gone meanwhile, everything kept.
  const asked = turns.findLastIndex((t) => t.author === 'person' && t.text === text)
  const before = asked < 0 ? turns : turns.slice(0, asked)
  const words = DEMO ? companionReply(text, before) : REPLY
  return { ...s, revision: s.revision + 1, turns: [...turns, { ...hers, text: words }] }
}

/** The space and its writes, as the API would keep them: a message is listed at once and answered 900 ms later. */
function useSimulated() {
  const [space, setSpace] = useState<Space>(firstSpace)
  const [sending, setSending] = useState<Sending | null>(null)
  const [busy, setBusy] = useState(false)
  const answer = useRef(0)
  const add = (t: PersonalTurn) => setSpace((s) => ({ ...s, revision: s.revision + 1, turns: [...s.turns, t] }))
  const writes: PersonalWrites = {
    here: () => account.present,
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
      // `sendFails=1`: the message doesn't go (a lost connection); its words come back to the field.
      if (query.has('sendFails')) {
        setSending(null)
        setBusy(false)
        throw new Error('not sent (fixture)')
      }
      add(turn('person', text, new Date().toISOString(), { reply: 'pending' }))
      setSending(null)
      setBusy(false)
      const reply = () => {
        // Her turn made once, outside the update (which React may run twice); its words filled in there.
        const hers = turn('sophia', '', new Date().toISOString())
        setSpace((s) => answered(s, text, hers))
      }
      window.clearTimeout(answer.current)
      if (query.has('holdReply') && window.personalFixture) window.personalFixture.answer = reply
      else answer.current = window.setTimeout(reply, query.has('slow') ? 2500 : 900)
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
    ...carryWritesFor(setSpace),
    erase: () => Promise.resolve(receipt('erase')),
  }
  return { space, writes, wrote: writtenBy(setSpace) }
}

const idle = { state: 'ready' as const, failed: '', retry: () => undefined }

/**
 * `earlier=1`: a day three weeks back waits to be read back (Look further back, the days' menu); else the whole
 * conversation is read.
 */
function useReadBack() {
  const [older, setOlder] = useState<PersonalTurn[]>([])
  const more = query.has('earlier') && older.length === 0
  // `readSlow=1`: the earlier page takes 1.5 s to come.
  const read = async () => {
    if (query.has('readSlow')) await new Promise((r) => setTimeout(r, 1500))
    setOlder([
      turn('person', 'I made a promise to myself to rest on Sundays.', ago(21 * DAY + 30), { seq: -2 }),
      turn('sophia', 'What would rest look like, this Sunday?', ago(21 * DAY + 29), { seq: -1 }),
    ])
  }
  const shared = useSharedRead(read)
  return { older, more, readMore: shared.run, reading: shared.reading }
}

/** Whether something the page reads has come: at once, or `param=ms` later. */
function useLater(param: string): boolean {
  const [come, setCome] = useState(!query.has(param))
  useEffect(() => {
    if (come) return undefined
    const later = window.setTimeout(() => setCome(true), Number(query.get(param)))
    return () => window.clearTimeout(later)
  }, [come, param])
  return come
}

/** Words handed from Home, as `handed=` and `handedAfter=` say. */
function useHanded() {
  // `handed=words`: words said to Sophia from Home, handed to the composer to send; `handedAfter=ms`: handed that
  // much later, not at once.
  const [handed, setHanded] = useState<{ words: string; id: number } | null>(() => {
    const words = query.get('handed')
    return words && !query.has('handedAfter') ? { words, id: 1 } : null
  })
  useEffect(() => {
    const words = query.get('handed')
    if (!words || !query.has('handedAfter')) return undefined
    const later = window.setTimeout(() => setHanded({ words, id: 1 }), Number(query.get('handedAfter')))
    return () => window.clearTimeout(later)
  }, [])
  return [handed, setHanded] as const
}

/**
 * Personal as Places holds it: Escape closes the notes, unless a layer holds it above them (the package mid-step);
 * `window.personalFixture.away/back` leave Personal and come back (its notes' layer goes, then opens again), and
 * `signOut` takes the account away. Whether the account is still signed in.
 */
function useFixturePlace(notes: boolean, setNotes: (open: boolean) => void): boolean {
  const [here, setHere] = useState(true)
  useEscape(notes && here, () => setNotes(false))
  const [signedIn, setSignedIn] = useState(true)
  useEffect(() => {
    if (!window.personalFixture) return
    window.personalFixture.signOut = () => {
      account.present = false
      setSignedIn(false)
    }
    window.personalFixture.away = () => setHere(false)
    window.personalFixture.back = () => setHere(true)
  }, [])
  return signedIn
}

function Personal() {
  const { space, writes, wrote } = useSimulated()
  const readBack = useReadBack()
  const extras = useExtras(query, pressed, ago, wrote)
  const projects = useMemo(() => projectsFor(query, ahead), [])
  const [notes, setNotes] = useState(query.get('notes') === 'open')
  const signedIn = useFixturePlace(notes, setNotes)
  const [earlier, setEarlier] = useState(false)
  const [locked, setLocked] = useState(false)
  const epochKnown = useLater('epochAfter')
  const spaceRead = useLater('spaceAfter')
  const [handed, setHanded] = useHanded()
  return (
    <div className="places" data-place="personal">
      {/* The places' bar, as Places draws it above every place: a talk must cover it too. */}
      <header className="topbar places-bar">
        <button type="button" className="ghost">
          Home
        </button>
      </header>
      {/* The check's own control: not part of a demo's recording. */}
      {!DEMO && (
        <button className="fixture-lock" type="button" onClick={() => setLocked((was) => !was)}>
          {locked ? 'Unlock (fixture)' : 'Lock (fixture)'}
        </button>
      )}
      {signedIn && (
        <PersonalSpace
          hidden={locked}
          handed={handed}
          onHanded={() => setHanded(null)}
          locked={locked}
          now={NOW}
          account="fixture"
          name="Luis"
          space={spaceRead ? space : undefined}
          // As Places knows it: from the space once read, or earlier from the projects (epochAfter).
          epoch={spaceRead || epochKnown ? space.epoch : undefined}
          readBack={readBack}
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
      )}
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('personal.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note" data-demo={DEMO || undefined}>
      {DEMO ? DEMO_LABEL : 'Simulated — a conversation with Sophia, no account'}
    </p>
    <Personal />
  </StrictMode>,
)
