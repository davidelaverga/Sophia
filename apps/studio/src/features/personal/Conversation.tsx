// The conversation's rows (conversation-view.ts), rendered: day dividers that list the days, turns grouped by side, each
// side's first turn marked by its half of Umbral, times on hover (a tap on touch), "Note this" on the person's own turns with its short form in their own
// words, "Copy" on hers, Sophia's suggested note (keep it or let it go), and the wait for her reply.
import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { PersonalSuggestion, PersonalTurn } from '@sophia/contracts'
import { Icon } from '@sophia/ui'
import { onScreen } from '../../app/shortcuts.ts'
import { usePopover } from '../../app/usePopover.ts'
import { UMBRAL } from '../light/threshold.ts'
import type { Way } from './arrive.ts'
import { daysOf, notePrefill, suggestionFor, type Row } from './conversation-view.ts'
import type { Week } from './extras.ts'
import { FindLens, Marked, type Lens } from './Find.tsx'
import { focusConversation, focusIfDropped, focusSoon } from './focus.ts'
import { noteFlight } from './note-flight.ts'
import { WeekLook } from './WeekLook.tsx'

export interface ConversationActions {
  /**
   * Sends a way to start's words; resolves to whether they went on their way (not while another message is, here or in
   * another tab; offline, they wait in the field).
   */
  start: (text: string) => Promise<boolean>
  decide: (suggestion: PersonalSuggestion, decision: 'keep' | 'dismiss') => void
  openNotes: () => void
  /** Resolves to whether it was kept. */
  keepNote: (text: string, turnId: string, suggestion: PersonalSuggestion | null) => Promise<boolean>
  retry: (turnId: string) => void
  /** Whether the press for a suggestion or a turn asked again is being answered: it waits (presses.ts). */
  waits: (key: string) => boolean
  /** The page of days before those shown (a long conversation). */
  readEarlier: () => Promise<void>
}

const dayId = (key: string) => `c-${key}`

/** Each half of Umbral (threshold.ts), boxed tight: hers small and light, yours larger and warm, at one scale. */
const HALF = {
  sophia: { path: UMBRAL.her.path, box: '33 6.31 10.96 17.14' },
  you: { path: UMBRAL.you.path, box: '4.95 11.19 25.05 30.38' },
} as const

/** Who speaks: their half of the mark, beside the first of their turns. The conversation is the mark, in two voices. */
export function Who({ who }: { who: keyof typeof HALF }) {
  const half = HALF[who]
  return (
    <svg className="c3-who" data-who={who} viewBox={half.box} aria-hidden>
      <path d={half.path} />
    </svg>
  )
}

function NoteForm(props: {
  turn: PersonalTurn
  suggestion: PersonalSuggestion | null
  /** Words a refused keep had: the form opens with them instead of the prefill. */
  words: string | null
  onKeep: (text: string) => void
  onClose: () => void
}) {
  const { turn, suggestion, words, onKeep, onClose } = props
  const [text, setText] = useState(() => words ?? notePrefill(turn.text, suggestion))
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // Note this went as it opened, so the form takes the focus; reopened late, it takes it (and the view) from nobody.
    if (!focusIfDropped(input.current)) return
    input.current?.select()
    input.current?.closest('form')?.scrollIntoView({ block: 'nearest' })
  }, [])
  return (
    <form
      className="c3-noteform"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onKeep(text.trim())
      }}
    >
      <div className="field">
        <label className="sr-only" htmlFor="c-note-in">
          Note, in your words
        </label>
        <input
          ref={input}
          id="c-note-in"
          maxLength={90}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            e.preventDefault()
            onClose()
          }}
        />
        <button className="pill primary" type="submit" disabled={!text.trim()}>
          Keep
        </button>
      </div>
      <button className="ghost" type="button" onClick={onClose}>
        Cancel
      </button>
      {suggestion?.state === 'kept' && (
        <span className="use">Sophia’s suggestion for this is already in your notes.</span>
      )}
      {suggestion && suggestion.state !== 'kept' && (
        <span className="use">Prefilled with what Sophia suggested. Change it if you like.</span>
      )}
    </form>
  )
}

function Suggestion({ row, actions }: { row: Extract<Row, { kind: 'suggestion' }>; actions: ConversationActions }) {
  const { suggestion, shown } = row
  const [chose, setChose] = useState<'keep' | 'dismiss' | null>(null)
  const waiting = actions.waits(suggestion.id)
  // The row changes once the decision is written, and its buttons with it: the focus goes to the conversation first.
  // Until then both buttons wait, and a second press decides nothing.
  const decide = (decision: 'keep' | 'dismiss') => {
    if (waiting) return
    setChose(decision)
    actions.decide(suggestion, decision)
    focusConversation()
  }
  const keep = waiting && chose === 'keep' ? 'Keeping…' : 'Keep'
  if (shown === 'kept') {
    return (
      <p className="c3-kept">
        Kept ·{' '}
        <button className="text-button" type="button" onClick={actions.openNotes}>
          Notes
        </button>
      </p>
    )
  }
  if (shown === 'folded') {
    return (
      <p className="c3-kept">
        Sophia suggested a note: <q>{suggestion.text}</q> ·{' '}
        <button
          className="text-button"
          type="button"
          aria-disabled={waiting || undefined}
          onClick={() => decide('keep')}
        >
          {keep}
        </button>
      </p>
    )
  }
  return (
    <div className="c3-suggest" role="group" aria-label="Sophia suggests a note">
      <span className="field-label">Keep a note?</span>
      <q>{suggestion.text}</q>
      <span className="acts">
        <button className="pill" type="button" aria-disabled={waiting || undefined} onClick={() => decide('keep')}>
          {keep}
        </button>
        <button className="ghost" type="button" aria-disabled={waiting || undefined} onClick={() => decide('dismiss')}>
          No thanks
        </button>
      </span>
    </div>
  )
}

interface TurnProps {
  row: Extract<Row, { kind: 'turn' }>
  noting: boolean
  onNote: () => void
}

/** Her words, copied: it says so (or that the browser refused) for a moment, then offers it again. */
function Copy({ text }: { text: string }) {
  const button = useRef<HTMLButtonElement>(null)
  const [said, setSaid] = useState<string | null>(null)
  useEffect(() => {
    if (!said) return undefined
    const done = window.setTimeout(() => setSaid(null), 1600)
    return () => window.clearTimeout(done)
  }, [said])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      setSaid('Couldn’t copy')
      return
    }
    // A copy that settles once Personal is out of sight (the padlock shut, another place, signed out) is taken back, as
    // far as the browser lets a page write then: her words don't stay on the clipboard behind the privacy screen.
    if (button.current && onScreen(button.current)) setSaid('Copied')
    else await navigator.clipboard.writeText('').catch(() => undefined)
  }
  return (
    <button ref={button} className="ghost c3-copy" type="button" onClick={() => void copy()}>
      <span aria-live="polite">{said ?? 'Copy'}</span>
    </button>
  )
}

/** Touch and narrow screens have no hover: a tap on a message shows its time. */
const tapShowsTime = () => matchMedia('(hover: none), (max-width: 860px)').matches

/** What a turn offers beside its time: Note this on yours (not while its form is open), Copy on hers. */
function TurnAct({ row, noting, onNote }: TurnProps) {
  if (!row.turn) return null
  if (row.author !== 'person') return <Copy text={row.text} />
  if (noting) return null
  return (
    <button className="ghost note-this" type="button" data-note-turn={row.turn.id} onClick={onNote}>
      Note this
    </button>
  )
}

function Turn({ row, noting, onNote }: TurnProps) {
  const [showAt, setShowAt] = useState(false)
  const me = row.author === 'person'
  return (
    <div
      className={`msg ${me ? 'me' : 'sophia'} ${row.first ? 'first' : 'cont'}${showAt ? ' show-at' : ''}`}
      data-turn={row.turn?.id}
      onClick={(e) => {
        if (tapShowsTime() && !(e.target instanceof Element && e.target.closest('button'))) setShowAt(!showAt)
      }}
    >
      {row.first && <Who who={me ? 'you' : 'sophia'} />}
      <span className="sr-only">{me ? 'You' : 'Sophia'}: </span>
      <div className="body">
        <Marked rowKey={row.key} text={row.text} />
      </div>
      <span className="at">{row.at}</span>
      <TurnAct row={row} noting={noting} onNote={onNote} />
    </div>
  )
}

function Typing({ first }: { first: boolean }) {
  return (
    <div className={`msg sophia typing ${first ? 'first' : 'cont'}`}>
      {first && <Who who="sophia" />}
      <span className="sr-only">Sophia is writing</span>
      <div className="body" aria-hidden>
        Sophia is writing…
      </div>
    </div>
  )
}

/** Ways in, as rows: each a sentence, a quiet note beside it when it has one, and an arrow; a press sends its words. */
function Ways({ ways, label, onStart }: { ways: readonly Way[]; label: string; onStart: (words: string) => void }) {
  return (
    <div className="c3-starters" role="group" aria-label={label}>
      {ways.map((w) => (
        <button key={w.label} type="button" onClick={() => onStart(w.words)}>
          <span className="c3-way">{w.label}</span>
          {w.note && <span className="c3-way-note">{w.note}</span>}
          <span className="c3-go" aria-hidden>
            →
          </span>
        </button>
      ))}
    </div>
  )
}

interface RowProps {
  row: Row
  turns: readonly PersonalTurn[]
  noteAt: string | null
  setNoteAt: Dispatch<SetStateAction<string | null>>
  onDays: () => void
  actions: ConversationActions
}

function Intro({ text }: { text: string }) {
  return (
    <div className="msg sophia first">
      <Who who="sophia" />
      <span className="sr-only">Sophia: </span>
      <div className="body">{text}</div>
    </div>
  )
}

/** Ask again waits while it is asked ("Asking…"): a second press asks nothing. */
function Failed({ onRetry, waiting }: { onRetry: () => void; waiting: boolean }) {
  return (
    <p className="c3-failed">
      Sophia couldn’t answer this one.{' '}
      <button className="text-button" type="button" aria-disabled={waiting || undefined} onClick={onRetry}>
        {waiting ? 'Asking…' : 'Ask again'}
      </button>
    </p>
  )
}

function RowView({ row, turns, noteAt, setNoteAt, onDays, actions }: RowProps) {
  if (row.kind === 'turn') {
    return <TurnWithForm row={row} turns={turns} noteAt={noteAt} setNoteAt={setNoteAt} actions={actions} />
  }
  if (row.kind === 'day') {
    return (
      <button
        className="c3-day"
        type="button"
        id={dayId(row.key)}
        data-day={row.label}
        aria-haspopup="menu"
        onClick={onDays}
      >
        <span>
          {row.label}
          {row.note && (
            <span className="c3-day-note">
              <span aria-hidden> · </span>
              {row.note}
            </span>
          )}
        </span>
      </button>
    )
  }
  if (row.kind === 'intro') return <Intro text={row.text} />
  if (row.kind === 'starters' || row.kind === 'arrive') {
    // The ways go once one is sent: the focus goes to the conversation first.
    const start = (text: string) => {
      void actions.start(text)
      focusConversation()
    }
    const label = row.kind === 'starters' ? 'Ways to start' : 'How you arrive today'
    return <Ways ways={row.ways} label={label} onStart={start} />
  }
  if (row.kind === 'typing') return <Typing first={row.first} />
  if (row.kind === 'failed') {
    // Ask again goes as the wait begins: the focus goes to the conversation first.
    const retry = () => {
      actions.retry(row.turnId)
      focusConversation()
    }
    return <Failed onRetry={retry} waiting={actions.waits(row.turnId)} />
  }
  return <Suggestion row={row} actions={actions} />
}

function TurnWithForm(props: Omit<RowProps, 'row' | 'onDays'> & { row: Extract<Row, { kind: 'turn' }> }) {
  const { row, turns, noteAt, setNoteAt, actions } = props
  const [refused, setRefused] = useState<string | null>(null)
  const turn = row.turn
  if (!turn) return <Turn row={row} noting={false} onNote={() => undefined} />
  const noting = noteAt === turn.id
  // The form goes with its Keep, Cancel or Esc: the focus goes back to the turn's Note this, which comes back with it.
  const close = () => {
    setRefused(null)
    setNoteAt(null)
    focusSoon(`[data-note-turn="${turn.id}"]`)
  }
  // A keep refused (notes full, a lost connection): its words wait in its form, which opens again, unless another
  // turn's note is being written by then (that one stays; these come back when this form opens).
  const keep = (text: string) => {
    close()
    void actions.keepNote(text, turn.id, suggestionFor(turns, turn.id)).then((kept) => {
      if (kept) {
        noteFlight(document.querySelector(`.msg[data-turn="${turn.id}"]`))
        return
      }
      setRefused(text)
      setNoteAt((open) => open ?? turn.id)
    })
  }
  return (
    <>
      <Turn row={row} noting={noting} onNote={() => setNoteAt(turn.id)} />
      {noting && (
        <NoteForm
          turn={turn}
          suggestion={suggestionFor(turns, turn.id)}
          words={refused}
          onClose={close}
          onKeep={keep}
        />
      )}
    </>
  )
}

/** The pill names the day at the top of what you're reading, once its divider has scrolled away. */
function useDayPill(list: RefObject<HTMLDivElement | null>, rows: readonly Row[]) {
  const [day, setDay] = useState<string | null>(null)
  useEffect(() => {
    const box = list.current
    if (!box) return undefined
    const update = () => {
      const top = box.getBoundingClientRect().top
      const days = [...box.querySelectorAll<HTMLElement>('.c3-day')]
      const above = days.filter((d) => d.getBoundingClientRect().top < top).at(-1)
      // The day alone, as the days' menu names it: not the moment it carries.
      setDay(days.length >= 2 && above ? (above.dataset['day'] ?? null) : null)
    }
    update()
    box.addEventListener('scroll', update, { passive: true })
    return () => box.removeEventListener('scroll', update)
  }, [list, rows])
  return day
}

/** The day chosen from the days' menu: in sight, with the focus, so Tab and the keys go on from there. */
function goToDay(key: string) {
  const divider = document.getElementById(dayId(key))
  divider?.focus({ preventScroll: true })
  // Under less motion it is simply there.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  divider?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
}

/** The last page read back takes "Show earlier days" away: the focus it had goes to the menu's first day. */
function useFocusAfterMore(panel: RefObject<HTMLDivElement | null>, open: boolean, more: boolean) {
  useEffect(() => {
    if (open && !more && document.activeElement === document.body) {
      panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    }
  }, [open, more, panel])
}

/** The day at the top of what you're reading, and the list of days it opens (so do the days' own dividers). */
function Earlier(props: {
  rows: readonly Row[]
  open: boolean
  day: string | null
  setOpen: (open: boolean) => void
  /** Earlier days than those shown exist: the first item reads them back. */
  more: boolean
  onMore: () => void
}) {
  const { rows, open, day, setOpen, more, onMore } = props
  const menu = usePopover(open, () => setOpen(false))
  useFocusAfterMore(menu.panel, open, more)
  return (
    <div ref={menu.wrap} className="c3-daybar">
      {day && (
        <button
          ref={menu.opener}
          className="c3-daypill"
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span>{day}</span>
          <Icon name="chevron" size={12} />
        </button>
      )}
      {open && (
        <div
          ref={menu.panel}
          className="popover menu-list"
          role="menu"
          aria-label="Earlier days"
          onKeyDown={menu.onKeyDown}
        >
          {more && (
            <button role="menuitem" type="button" onClick={onMore}>
              <span>Show earlier days</span>
            </button>
          )}
          {daysOf(rows).map((d) => (
            <button
              key={d.key}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                goToDay(d.key)
              }}
            >
              <span>{d.label}</span>
              <span className="muted">{d.topics}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface ConversationProps {
  rows: readonly Row[]
  turns: readonly PersonalTurn[]
  /** The scrolling list; the space scrolls it to the latest turn. */
  list: RefObject<HTMLDivElement | null>
  earlier: boolean
  setEarlier: (open: boolean) => void
  /** Earlier days than those shown exist (a long conversation). */
  more: boolean
  /** What a slow or failed read says, where the conversation would be (ReadNotes). */
  notice: React.ReactNode
  /** The notes cover it (a narrow screen): nothing in it can be reached or typed into until they close. */
  covered: boolean
  composer: React.ReactNode
  actions: ConversationActions
  /** Her look back at your week, the newest thing in the conversation while it waits (extras.ts). */
  week?: Week | undefined
  /** Her reply that landed while you read further up, waiting at the end of what you see. */
  answered?: React.ReactNode
  /** What finding marks in the turns (Find), or null when nothing is looked for. */
  lens?: Lens | null
}

export function Conversation(props: ConversationProps) {
  const { rows, turns, list, earlier, setEarlier, notice, composer, actions, covered, more, week, answered } = props
  const lens = props.lens ?? null
  const [noteAt, setNoteAt] = useState<string | null>(null)
  const day = useDayPill(list, rows)
  // The typing scope (shortcuts.ts): a letter typed on any of its controls, or with the focus on the conversation
  // itself, is text for the message bar, never a place's key.
  return (
    <FindLens value={lens}>
      <div className={`c3-convo${day ? ' scrolled' : ''}`} data-typing-scope inert={covered}>
        <Earlier
          rows={rows}
          open={earlier}
          day={day}
          setOpen={setEarlier}
          more={more}
          onMore={() => void actions.readEarlier()}
        />
        <div ref={list} id="c-log" className="msgs" aria-label="Conversation with Sophia" tabIndex={-1}>
          {notice}
          {rows.map((row) => (
            <RowView
              key={row.key}
              row={row}
              turns={turns}
              noteAt={noteAt}
              setNoteAt={setNoteAt}
              onDays={() => setEarlier(true)}
              actions={actions}
            />
          ))}
          {week && <WeekLook week={week} onTalk={actions.start} />}
        </div>
        <div className="c3-answerbar">{answered}</div>
        {composer}
      </div>
    </FindLens>
  )
}
