// What needs you, on Home's right half under her light (docs/plans/home-needs-you.md): one index over the places a
// person would otherwise visit to learn nothing is waiting. Shown only when Home is given needs (the vision flag).
import { Icon } from '@sophia/ui'
import type { ComponentProps } from 'react'
import { followPointer } from '../resources/motion.ts'
import { moveInIndex } from './index-keys.ts'
import { NEED_WORDS, needNote, needsLabel, needsOrder, type Need, type NeedKind } from './needs-you.ts'

type IconName = ComponentProps<typeof Icon>['name']

/** The kind's glyph, where a project's row has its number. */
const GLYPH: Readonly<Record<NeedKind, IconName>> = {
  decision: 'decide',
  permission: 'hand',
  review: 'brief',
  guest: 'invite',
  reply: 'sophia',
}

interface Props {
  needs: readonly Need[]
  now: Date
  /** Opens where the need is. */
  onOpen: (need: Need) => void
}

function NeedRow({ need, index, now, onOpen }: { need: Need; index: number; now: Date; onOpen: () => void }) {
  const note = needNote(need, now)
  return (
    <li style={{ '--i': index }}>
      <button
        className="hw-row"
        type="button"
        data-tone={note.tone}
        data-kind={need.kind}
        onClick={onOpen}
        onPointerMove={followPointer}
      >
        <span className="hw-n hw-kind" aria-hidden>
          <Icon name={GLYPH[need.kind]} />
        </span>
        <span className="hw-t">{need.title}</span>
        <span className="hw-m">{note.text}</span>
        <span className="hw-go">
          <span className="hw-go-words">{NEED_WORDS[need.kind]}</span>
          <span aria-hidden>→</span>
        </span>
      </button>
    </li>
  )
}

/** The needs in the order of their urgency, each one press; none, one quiet line. */
export function NeedsYou({ needs, now, onOpen }: Props) {
  const rows = needsOrder(needs)
  return (
    <section className="hw-section hw-needs" aria-labelledby="hw-needs-h">
      <h3 id="hw-needs-h" className="hw-label">
        Needs you
      </h3>
      {rows.length === 0 ? (
        <p className="hw-quiet">{needsLabel(0)}</p>
      ) : (
        <ol className="hw-index" aria-label="Needs you" onKeyDown={moveInIndex}>
          {rows.map((need, i) => (
            <NeedRow key={need.id} need={need} index={i} now={now} onOpen={() => onOpen(need)} />
          ))}
        </ol>
      )}
    </section>
  )
}
