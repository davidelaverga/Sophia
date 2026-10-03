// Several goals with their plans, one at a time: a rail of goals, each a small card with its status, its title and its
// plan in a few marks (PlanTab: who works on it, how many tasks, "for you"). A light bar slides under the one chosen.
// With more goals than fit, the rail moves: arrows at an end that has more, a wheel, a press-and-drag, or the arrow
// keys, which also bring the chosen one into view (rail.ts). Its edges fade where more waits.
import { useRef } from 'react'
import type { Goal } from '@sophia/contracts'
import { Icon, useSlidingThumb } from '@sophia/ui'
import { nextInRow } from '../../app/roving.ts'
import { useDrag, useEdges, useWheel } from './rail.ts'

interface Props {
  goals: readonly Goal[]
  /** Each goal's plan in a few marks, by goal id. */
  tabs: Readonly<Record<string, React.ReactNode>>
  chosen: string
  onChoose: (id: string) => void
}

/** An arrow at an end of the rail with more beyond it: it moves the rail by most of its width. */
function Turn({ rail, by }: { rail: React.RefObject<HTMLElement | null>; by: 1 | -1 }) {
  return (
    <button
      type="button"
      className="rail-turn"
      data-side={by > 0 ? 'after' : 'before'}
      aria-label={by > 0 ? 'More goals' : 'Earlier goals'}
      tabIndex={-1}
      onClick={() => {
        const el = rail.current
        el?.scrollBy({ left: by * el.clientWidth * 0.8, behavior: 'smooth' })
      }}
    >
      <Icon name={by > 0 ? 'forward' : 'back'} size={14} />
    </button>
  )
}

export function GoalTabs({ goals, tabs, chosen, onChoose }: Props) {
  const thumb = useSlidingThumb<HTMLDivElement>(chosen)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const edges = useEdges(thumb)
  useWheel(thumb)
  useDrag(thumb)
  const choose = (id: string) => {
    onChoose(id)
    buttons.current.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    const next = nextInRow(
      goals.map((g) => g.id),
      chosen,
      event.key,
    )
    if (!next) return
    event.preventDefault()
    choose(next)
    buttons.current.get(next)?.focus()
  }
  return (
    <div
      className="goal-rail-wrap"
      data-more-before={edges.before || undefined}
      data-more-after={edges.after || undefined}
    >
      {edges.before && <Turn rail={thumb} by={-1} />}
      <div ref={thumb} className="goal-rail" role="tablist" aria-label="Goals" onKeyDown={onKeyDown}>
        {goals.map((g, i) => (
          <button
            key={g.id}
            ref={(el) => {
              if (el) buttons.current.set(g.id, el)
            }}
            type="button"
            role="tab"
            className="goal-chip"
            style={{ '--i': i }}
            data-thumb={g.id}
            aria-selected={g.id === chosen}
            tabIndex={g.id === chosen ? 0 : -1}
            onClick={() => choose(g.id)}
          >
            <span className="goal-chip-title">
              <span className="goal-tab-dot" data-status={g.status} aria-hidden />
              <span className="goal-chip-name">{g.title}</span>
            </span>
            {tabs[g.id]}
          </button>
        ))}
      </div>
      {edges.after && <Turn rail={thumb} by={1} />}
    </div>
  )
}
