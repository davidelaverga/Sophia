// The list's rows (docs/plans/conversations-find.md, C4): the title filter, then «Open» and «Mine», kept for the
// project while the page lives; how many show when narrowed; nothing left says so, with Clear. Each row opens its
// conversation.
import { useId, useRef, useState } from 'react'
import type { ConversationSummary } from '../../api/conversations.ts'
import { clock, dayOf, sameDay } from '../../app/time-words.ts'
import { pageMemory, useMemory } from '../work/planning/page-memory.ts'
import { contributorsLine, gistOf, narrowed, questionWords } from './conversation-list.ts'

/** «Open» and «Mine», per project and reader, while the page lives: another view and back finds them as left. */
const shownBy = pageMemory<{ open: boolean; mine: boolean }>()
const NONE = { open: false, mine: false }

export function Rows(props: {
  projectId: string
  reader: string
  all: readonly ConversationSummary[]
  openId: string | undefined
  me: string
  onOpen: (id: string) => void
}) {
  const [typed, setTyped] = useState('')
  const search = useRef<HTMLInputElement>(null)
  // Keyed by who reads, known at once: a press made before the membership arrives is still there after it.
  const key = `${props.projectId}:${props.reader}`
  const by = useMemory(shownBy, key) ?? NONE
  const set = (next: Partial<typeof NONE>) => shownBy.set(key, { ...by, ...next })
  // «Mine» waits for who the reader is: until then it narrows nothing.
  const shown = narrowed(props.all, { typed, open: by.open, mine: by.mine && props.me !== '' }, props.me)
  const narrowing = typed.trim() !== '' || by.open || by.mine
  const none = by.open || by.mine ? 'No conversation matches.' : `No conversation’s title has «${typed.trim()}».`
  const clear = () => {
    setTyped('')
    shownBy.set(key, NONE)
    // Clear goes with the note it was in: the filter takes the focus.
    search.current?.focus()
  }
  return (
    <>
      <input
        ref={search}
        type="search"
        className="conv-filter"
        aria-label="Filter conversations"
        placeholder="Filter by title"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <ShowOnly
        by={by}
        onSet={set}
        said={!narrowing ? '' : shown.length > 0 ? `${String(shown.length)} of ${String(props.all.length)}` : none}
        counted={shown.length > 0}
      />
      {shown.length === 0 ? (
        <p className="conv-note">
          {none}{' '}
          <button type="button" className="text-button" onClick={clear}>
            Clear
          </button>
        </p>
      ) : (
        <ul className="conv-rows">
          {shown.map((c) => (
            <Row key={c.id} conversation={c} open={c.id === props.openId} me={props.me} onOpen={props.onOpen} />
          ))}
        </ul>
      )}
    </>
  )
}

/** «Open» and «Mine», and what a press left (how many, or none): a status, always in the page, so it is heard. */
function ShowOnly(props: {
  by: typeof NONE
  onSet: (next: Partial<typeof NONE>) => void
  said: string
  counted: boolean
}) {
  const { by, onSet } = props
  return (
    <div className="conv-show" role="group" aria-label="Show only">
      <button type="button" aria-pressed={by.open} onClick={() => onSet({ open: !by.open })}>
        Open
      </button>
      <button type="button" aria-pressed={by.mine} onClick={() => onSet({ mine: !by.mine })}>
        Mine
      </button>
      <span className={props.counted ? 'conv-count' : 'sr-only'} role="status">
        {props.said}
      </span>
    </div>
  )
}

/**
 * A conversation as listed: named by its title, then when it last moved and Sophia's summary in a line, what is open as
 * an amber count. Who wrote there and what is open are said in words to a screen reader.
 */
function Row(props: { conversation: ConversationSummary; open: boolean; me: string; onOpen: (id: string) => void }) {
  const { conversation: c } = props
  const id = useId()
  const moved = movedAt(c.lastAt, Date.now())
  const gist = gistOf(c, props.me)
  return (
    <li>
      <button
        type="button"
        className="conv-row"
        aria-pressed={props.open}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        onClick={() => props.onOpen(c.id)}
      >
        <span id={`${id}-t`} className="conv-title">
          {c.title}
        </span>
        <span className="conv-row-at" aria-hidden>
          {moved}
        </span>
        <span id={`${id}-d`} className="conv-about">
          {gist && <span className="conv-gist">{gist}</span>}
          <span className="sr-only">
            {`${contributorsLine(c, props.me)}. ${questionWords(c)}.${moved ? ` Last moved ${moved}.` : ''}`}
          </span>
          {c.openQuestions > 0 && (
            <span className="conv-open-flag" aria-hidden>
              {c.openQuestions}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

/** When a conversation last moved: the clock today, the day before. */
const movedAt = (at: string, now: number) => (sameDay(at, new Date(now)) ? clock(at) : dayOf(at, now))
