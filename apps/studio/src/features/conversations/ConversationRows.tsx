// The list's rows (docs/plans/conversations-find.md, C4): the title filter, then «Open» and «Mine», kept for the
// project while the page lives; how many show when narrowed; nothing left says so, with Clear. Each row opens its
// conversation.
import { useId, useState } from 'react'
import type { ConversationSummary } from '../../api/vision.ts'
import { clock, dayOf, sameDay } from '../../app/time-words.ts'
import { pageMemory, useMemory } from '../work/planning/page-memory.ts'
import { contributorsLine, narrowed, openWords } from './conversation-list.ts'

/** «Open» and «Mine», per project, while the page lives: another view and back finds them as left. */
const shownBy = pageMemory<{ open: boolean; mine: boolean }>()
const NONE = { open: false, mine: false }

export function Rows(props: {
  projectId: string
  all: readonly ConversationSummary[]
  openId: string | undefined
  me: string
  onOpen: (id: string) => void
}) {
  const [typed, setTyped] = useState('')
  const by = useMemory(shownBy, props.projectId) ?? NONE
  const set = (next: Partial<typeof NONE>) => shownBy.set(props.projectId, { ...by, ...next })
  const shown = narrowed(props.all, { typed, ...by }, props.me)
  const narrowing = typed.trim() !== '' || by.open || by.mine
  const clear = () => {
    setTyped('')
    shownBy.set(props.projectId, NONE)
  }
  return (
    <>
      <input
        type="search"
        className="conv-filter"
        aria-label="Filter conversations"
        placeholder="Filter by title"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <div className="conv-show" role="group" aria-label="Show">
        <button type="button" aria-pressed={by.open} onClick={() => set({ open: !by.open })}>
          Open
        </button>
        <button type="button" aria-pressed={by.mine} onClick={() => set({ mine: !by.mine })}>
          Mine
        </button>
        {narrowing && shown.length > 0 && (
          <span className="conv-count">{`${String(shown.length)} of ${String(props.all.length)}`}</span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="conv-note">
          {by.open || by.mine ? 'No conversation matches.' : `No conversation’s title has «${typed.trim()}».`}{' '}
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

/**
 * A conversation as listed: named by its title, then when it last moved and Sophia's summary in a line, what is open as
 * an amber count. Who wrote there and what is open are said in words to a screen reader.
 */
function Row(props: { conversation: ConversationSummary; open: boolean; me: string; onOpen: (id: string) => void }) {
  const { conversation: c } = props
  const id = useId()
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
          {movedAt(c.lastAt, Date.now())}
        </span>
        <span id={`${id}-d`} className="conv-about">
          {c.summary && <span className="conv-gist">{c.summary}</span>}
          <span className="sr-only">{`${contributorsLine(c, props.me)}. ${openWords(c.openQuestions)}.`}</span>
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
