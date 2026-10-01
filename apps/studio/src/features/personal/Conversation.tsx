// The conversation's rows (conversation-view.ts), rendered: day dividers that list the days, turns grouped by side with
// Sophia's dot, times on hover (a tap on touch), "Note this" on the person's own turns with its short form in their own
// words, Sophia's suggested note (keep it or let it go), and the wait for her reply.
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PersonalSuggestion, PersonalTurn } from '@sophia/contracts'
import { Icon } from '@sophia/ui'
import { usePopover } from '../../app/usePopover.ts'
import { daysOf, notePrefill, STARTERS, suggestionFor, type Row } from './conversation-view.ts'
import { focusConversation, focusSoon } from './focus.ts'

export interface ConversationActions {
  start: (text: string) => void
  decide: (suggestion: PersonalSuggestion, decision: 'keep' | 'dismiss') => void
  openNotes: () => void
  /** Resolves to whether it was kept. */
  keepNote: (text: string, turnId: string, suggestion: PersonalSuggestion | null) => Promise<boolean>
  retry: (turnId: string) => void
  /** The page of days before those shown (a long conversation). */
  readEarlier: () => void
}

const dayId = (key: string) => `c-${key}`

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
  // The row changes once the decision is written, and its buttons with it: the focus goes to the conversation first.
  const decide = (decision: 'keep' | 'dismiss') => {
    actions.decide(suggestion, decision)
    focusConversation()
  }
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
        <button className="text-button" type="button" onClick={() => decide('keep')}>
          Keep
        </button>
      </p>
    )
  }
  return (
    <div className="c3-suggest" role="group" aria-label="Sophia suggests a note">
      <span className="field-label">Keep a note?</span>
      <q>{suggestion.text}</q>
      <span className="acts">
        <button className="pill" type="button" onClick={() => decide('keep')}>
          Keep
        </button>
        <button className="ghost" type="button" onClick={() => decide('dismiss')}>
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
        <button className="ghost note-this" type="button" data-note-turn={row.turn.id} onClick={onNote}>
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
        <button key={t} className="pill" type="button" onClick={() => onStart(t)}>
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
      <button className="text-button" type="button" onClick={onRetry}>
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
  if (row.kind === 'starters') {
    // The starters go once one is sent: the focus goes to the conversation first.
    const start = (text: string) => {
      actions.start(text)
      focusConversation()
    }
    return <Starters onStart={start} />
  }
  if (row.kind === 'typing') return <Typing first={row.first} />
  if (row.kind === 'failed') {
    // Ask again goes as the wait begins: the focus goes to the conversation first.
    const retry = () => {
      actions.retry(row.turnId)
      focusConversation()
    }
    return <Failed onRetry={retry} />
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
  // A keep refused (notes full, a lost connection): the form opens again with its words.
  const keep = (text: string) => {
    close()
    void actions.keepNote(text, turn.id, suggestionFor(turns, turn.id)).then((kept) => {
      if (kept) return
      setRefused(text)
      setNoteAt(turn.id)
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
      setDay(days.length >= 2 && above ? above.textContent : null)
    }
    update()
    box.addEventListener('scroll', update, { passive: true })
    return () => box.removeEventListener('scroll', update)
  }, [list, rows])
  return day
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
  /** Earlier days than those shown exist (a long conversation). */
  more: boolean
  /** What a slow or failed read says, where the conversation would be (ReadNotes). */
  notice: React.ReactNode
  /** The notes cover it (a narrow screen): nothing in it can be reached or typed into until they close. */
  covered: boolean
  composer: React.ReactNode
  actions: ConversationActions
}

export function Conversation(props: ConversationProps) {
  const { rows, turns, list, earlier, setEarlier, notice, composer, actions, covered, more } = props
  const [noteAt, setNoteAt] = useState<string | null>(null)
  const day = useDayPill(list, rows)
  // The typing scope (shortcuts.ts): a letter typed on any of its controls, or with the focus on the conversation
  // itself, is text for the message bar, never a place's key.
  return (
    <div className={`c3-convo${day ? ' scrolled' : ''}`} data-typing-scope inert={covered}>
      <Earlier rows={rows} open={earlier} day={day} setOpen={setEarlier} more={more} onMore={actions.readEarlier} />
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
      </div>
      {composer}
    </div>
  )
}
