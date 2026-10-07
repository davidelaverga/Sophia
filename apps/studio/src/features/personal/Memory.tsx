// What she remembers of you (docs/plans/personal-twenty.md), at the top of the notes: a few short things she keeps to
// know you, each said with when she learned it, each yours to correct or to have her forget. Shown only once the API
// gives them (extras.ts).
import { useEffect, useRef, useState } from 'react'
import { dayLabel } from './conversation-view.ts'
import type { Memory as Props, PersonalMemory } from './extras.ts'
import { useCapped } from './useCapped.ts'
import { useNow } from '../../app/use-now.ts'

/** The most characters a corrected memory holds. */
const MEMORY_MOST = 140

function Correcting({
  item,
  onSave,
  onCancel,
}: {
  item: PersonalMemory
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(item.text)
  const capping = useCapped(MEMORY_MOST, text, setText)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.select(), [])
  return (
    <form
      className="c3-mem-edit"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onSave(text.trim())
      }}
    >
      <label className="sr-only" htmlFor={`c-mem-${item.id}`}>
        What she should remember instead
      </label>
      <input
        ref={field}
        id={`c-mem-${item.id}`}
        // 140 characters, the limit proposed for the memory API (maxLength would count UTF-16 units).
        value={text}
        {...capping}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault()
          onCancel()
        }}
      />
      <button className="ghost" type="submit" disabled={!text.trim()}>
        Save
      </button>
      <button className="ghost" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

/** After a change, the focus goes on: to this memory's Correct, the next one's, or the heading when none is left. */
function focusMemory(id: string | null) {
  requestAnimationFrame(() => {
    const at = id ? document.querySelector<HTMLElement>(`[data-memory="${id}"] .c3-mem-correct`) : null
    ;(at ?? document.getElementById('c-memory-h'))?.focus({ preventScroll: true })
  })
}

export function Memory({ items, forget, correct }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const now = new Date(useNow())
  if (items.length === 0) return null
  const after = (id: string) => items[items.findIndex((m) => m.id === id) + 1]?.id ?? null
  return (
    <section className="c3-memory" aria-labelledby="c-memory-h">
      <h3 id="c-memory-h" className="c3-label" tabIndex={-1}>
        She remembers
      </h3>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="c3-mem" data-memory={item.id}>
            {editing === item.id ? (
              <Correcting
                item={item}
                onSave={(text) => {
                  if (text !== item.text) correct(item.id, text)
                  setEditing(null)
                  focusMemory(item.id)
                }}
                onCancel={() => {
                  setEditing(null)
                  focusMemory(item.id)
                }}
              />
            ) : (
              <>
                <p id={`c-mem-t-${item.id}`}>{item.text}</p>
                <span className="c3-mem-at">{dayLabel(new Date(item.learnedAt), now)}</span>
                <span className="c3-mem-acts">
                  <button
                    className="ghost c3-mem-correct"
                    type="button"
                    aria-describedby={`c-mem-t-${item.id}`}
                    onClick={() => setEditing(item.id)}
                  >
                    Correct
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    aria-describedby={`c-mem-t-${item.id}`}
                    onClick={() => {
                      focusMemory(after(item.id))
                      forget(item.id)
                    }}
                  >
                    Forget
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="c3-mem-note">She uses these to know you. Nothing here leaves this space.</p>
    </section>
  )
}
