// The conversation's rows (conversation-view.ts), rendered: day dividers that list the days, turns grouped by side with
// Sophia's dot, times on hover (a tap on touch), "Note this" on the person's own turns with its short form in their own
// words, Sophia's suggested note (keep it or let it go), and the wait for her reply.
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PersonalSuggestion, PersonalTurn } from '@sophia/contracts'
import { Chevron } from './icons.tsx'
import { daysOf, notePrefill, STARTERS, suggestionFor, type Row } from './conversation-view.ts'

export interface ConversationActions {
  start: (text: string) => void
  decide: (suggestion: PersonalSuggestion, decision: 'keep' | 'dismiss') => void
  openNotes: () => void
  keepNote: (text: string, turnId: string, suggestion: PersonalSuggestion | null) => void
  retry: (turnId: string) => void
}

const dayId = (key: string) => `c-${key}`

function NoteForm(props: {
  turn: PersonalTurn
  suggestion: PersonalSuggestion | null
  onKeep: (text: string) => void
  onClose: () => void
}) {
  const { turn, suggestion, onKeep, onClose } = props
  const [text, setText] = useState(() => notePrefill(turn.text, suggestion))
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus({ preventScroll: true })
    input.current?.select()
    input.current?.closest('form')?.scrollIntoView({ block: 'nearest' })
  }, [])
  return (
    <form
      className="c3-noteform"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onKeep(text.trim())
        else onClose()
      }}
    >
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
      <button className="btn" type="submit">
        Keep
      </button>
      <button className="btn ghost" type="button" onClick={onClose}>
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
  if (shown === 'kept') {
    return (
      <p className="c3-kept">
        Kept ·{' '}
        <button className="link" type="button" onClick={actions.openNotes}>
          Notes
        </button>
      </p>
    )
  }
  if (shown === 'folded') {
    return (
      <p className="c3-kept">
        Sophia suggested a note: <q>{suggestion.text}</q> ·{' '}
        <button className="link" type="button" onClick={() => actions.decide(suggestion, 'keep')}>
          Keep
        </button>
      </p>
    )
  }
  return (
    <div className="c3-suggest" role="group" aria-label="Sophia suggests a note">
      <span className="caps">Keep a note?</span>
      <q>{suggestion.text}</q>
      <span className="acts">
        <button className="btn" type="button" onClick={() => actions.decide(suggestion, 'keep')}>
          Keep
        </button>
        <button className="btn ghost" type="button" onClick={() => actions.decide(suggestion, 'dismiss')}>
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

/** Touch and narrow screens have no hover: a tap on a message shows its time. */
const tapShowsTime = () => matchMedia('(hover: none), (max-width: 860px)').matches

function Turn({ row, noting, onNote }: TurnProps) {
  const [showAt, setShowAt] = useState(false)
  const me = row.author === 'person'
  return (
    <div
      className={`msg ${me ? 'me' : 'sophia'} ${row.first ? 'first' : 'cont'}${showAt ? ' show-at' : ''}`}
      onClick={(e) => {
        if (tapShowsTime() && !(e.target instanceof Element && e.target.closest('button'))) setShowAt(!showAt)
      }}
    >
      {!me && row.first && <span className="s-dot" aria-hidden />}
      <span className="sr-only">{me ? 'You' : 'Sophia'}: </span>
      <div className="body">{row.text}</div>
      <span className="at">{row.at}</span>
      {me && row.turn && !noting && (
        <button className="btn ghost note-this" type="button" onClick={onNote}>
          Note this
        </button>
      )}
    </div>
  )
}

function Typing({ first }: { first: boolean }) {
  return (
    <div className={`msg sophia typing ${first ? 'first' : 'cont'}`}>
      {first && <span className="s-dot" aria-hidden />}
      <span className="sr-only">Sophia is writing</span>
      <div className="body" />
    </div>
  )
}

function Starters({ onStart }: { onStart: (text: string) => void }) {
  return (
    <div className="c3-starters" role="group" aria-label="Ways to start">
      {STARTERS.map((t) => (
        <button key={t} className="btn" type="button" onClick={() => onStart(t)}>
          {t}
        </button>
      ))}
    </div>
  )
}

interface RowProps {
  row: Row
  turns: readonly PersonalTurn[]
  noteAt: string | null
  setNoteAt: (turnId: string | null) => void
  onDays: () => void
  actions: ConversationActions
}

function Intro({ text }: { text: string }) {
  return (
    <div className="msg sophia first">
      <span className="s-dot" aria-hidden />
      <span className="sr-only">Sophia: </span>
      <div className="body">{text}</div>
    </div>
  )
}

function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="c3-failed">
      Sophia couldn’t answer this one.{' '}
      <button className="link" type="button" onClick={onRetry}>
        Ask again
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
      <button className="c3-day" type="button" id={dayId(row.key)} aria-haspopup="menu" onClick={onDays}>
        {row.label}
      </button>
    )
  }
  if (row.kind === 'intro') return <Intro text={row.text} />
  if (row.kind === 'starters') return <Starters onStart={actions.start} />
  if (row.kind === 'typing') return <Typing first={row.first} />
  if (row.kind === 'failed') return <Failed onRetry={() => actions.retry(row.turnId)} />
  return <Suggestion row={row} actions={actions} />
}

function TurnWithForm(props: Omit<RowProps, 'row' | 'onDays'> & { row: Extract<Row, { kind: 'turn' }> }) {
  const { row, turns, noteAt, setNoteAt, actions } = props
  const turn = row.turn
  if (!turn) return <Turn row={row} noting={false} onNote={() => undefined} />
  const noting = noteAt === turn.id
  return (
    <>
      <Turn row={row} noting={noting} onNote={() => setNoteAt(turn.id)} />
      {noting && (
        <NoteForm
          turn={turn}
          suggestion={suggestionFor(turns, turn.id)}
          onClose={() => setNoteAt(null)}
          onKeep={(text) => {
            setNoteAt(null)
            actions.keepNote(text, turn.id, suggestionFor(turns, turn.id))
          }}
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
      setDay(days.length >= 2 && above ? above.textContent : null)
    }
    update()
    box.addEventListener('scroll', update, { passive: true })
    return () => box.removeEventListener('scroll', update)
  }, [list, rows])
  return day
}

function Earlier(props: { rows: readonly Row[]; open: boolean; day: string | null; setOpen: (open: boolean) => void }) {
  const { rows, open, day, setOpen } = props
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])
  return (
    <div className="acct c3-daybar">
      {day && (
        <button
          className="c3-daypill"
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(!open)
          }}
        >
          <span>{day}</span>
          <Chevron />
        </button>
      )}
      {open && (
        <div ref={menu} className="menu" role="menu" aria-label="Earlier days">
          {daysOf(rows).map((d) => (
            <button
              key={d.key}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                document.getElementById(dayId(d.key))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  composer: React.ReactNode
  actions: ConversationActions
}

export function Conversation(props: ConversationProps) {
  const { rows, turns, list, earlier, setEarlier, composer, actions } = props
  const [noteAt, setNoteAt] = useState<string | null>(null)
  const day = useDayPill(list, rows)
  return (
    <div className={`c3-convo${day ? ' scrolled' : ''}`}>
      <Earlier rows={rows} open={earlier} day={day} setOpen={setEarlier} />
      <div ref={list} className="msgs" aria-label="Conversation with Sophia">
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
      </div>
      {composer}
    </div>
  )
}
