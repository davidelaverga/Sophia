// The tiles as a grid to move through and to arrange. Arrow keys, Home and End move the focus (one tile in the Tab
// order); a tile dragged onto another takes its place, and Alt with an arrow moves the focused tile the same way, so
// arranging never needs a pointer. Arranging puts the view in the viewer's own order (Custom). Two Claude Codes that
// end up side by side greet (buddies.ts).
import { useEffect, useRef, useState } from 'react'
import { useBuddies } from './buddies.ts'
import { glideName } from './motion.ts'
import { observationOf, TOOL, type QuotaObservation, type RequiredAction, type Resource } from './resource.ts'
import { ResourceTile } from './ResourceTile.tsx'

const STEP: Record<string, (columns: number) => number> = {
  ArrowRight: () => 1,
  ArrowLeft: () => -1,
  ArrowDown: (columns) => columns,
  ArrowUp: (columns) => -columns,
}

/** Which tile a key moves to, in a grid of `columns`: arrows by one or a row, Home and End to the ends. */
function moveTo(key: string, from: number, count: number, columns: number): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const step = STEP[key]?.(columns)
  if (step === undefined) return null
  const to = from + step
  return to >= 0 && to < count ? to : null
}

const openOn = (actions: RequiredAction[], id: string) =>
  actions.filter((a) => a.resourceId === id && a.state === 'open').length
const openIds = (actions: RequiredAction[], id: string) =>
  actions
    .filter((a) => a.resourceId === id && a.state === 'open')
    .map((a) => a.id)
    .join(' ')
const nameOf = (r: Resource) => `${r.owner.name} · ${TOOL[r.tool]}`

interface Props {
  shown: Resource[]
  observations: QuotaObservation[]
  actions: RequiredAction[]
  viewerId: string
  now: Date
  onOpen: (id: string) => void
  /** Moves a resource into another's place, in the viewer's own order. */
  onArrange: (id: string, target: string) => void
}

/** One tile in the Tab order; arrows move the focus, Alt and an arrow move the tile, which stays the Tab stop. */
function useKeys(shown: Resource[], onArrange: Props['onArrange']) {
  const tiles = useRef<(HTMLButtonElement | null)[]>([])
  const [active, setActive] = useState(0)
  const moving = useRef<string | null>(null)
  const current = Math.min(active, Math.max(0, shown.length - 1))
  useEffect(() => {
    const at = moving.current ? shown.findIndex((r) => r.id === moving.current) : -1
    if (at < 0) return
    moving.current = null
    // The moved tile keeps the focus by itself (the same element, in its new place); it becomes the Tab stop.
    setActive(at)
  }, [shown])
  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const columns = getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').length
    const to = moveTo(e.key, current, shown.length, columns)
    const from = shown[current]
    const target = to === null ? undefined : shown[to]
    if (to === null || !from || !target || to === current) return
    e.preventDefault()
    if (e.altKey) {
      moving.current = from.id
      onArrange(from.id, target.id)
      return
    }
    setActive(to)
    tiles.current[to]?.focus()
  }
  /** A tile moved another way (dragged): it becomes the Tab stop once in its new place. */
  const follow = (id: string) => {
    moving.current = id
  }
  return { tiles, current, setActive, onKeyDown, follow }
}

/** A tile dragged onto another: which is dragged, which it is over, and the handlers each tile takes. */
function useDrag(onArrange: Props['onArrange']) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const end = () => {
    setDragging(null)
    setOver(null)
  }
  const handlers = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', id)
      e.dataTransfer.effectAllowed = 'move'
      setDragging(id)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragging || dragging === id) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOver(id)
    },
    onDragLeave: () => setOver((o) => (o === id ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const moved = dragging ?? e.dataTransfer.getData('text/plain')
      end()
      if (moved && moved !== id) onArrange(moved, id)
    },
    onDragEnd: end,
  })
  return { dragging, over, handlers }
}

export function TileGrid(props: Props) {
  const { shown, observations, actions, viewerId, now, onOpen } = props
  const [said, setSaid] = useState('')
  const arrange = (id: string, target: string) => {
    const to = shown.findIndex((r) => r.id === target)
    const r = shown.find((x) => x.id === id)
    if (r) setSaid(`Moved ${nameOf(r)} to ${to + 1} of ${shown.length}`)
    props.onArrange(id, target)
  }
  const keys = useKeys(shown, arrange)
  const drag = useDrag((id, target) => {
    keys.follow(id)
    arrange(id, target)
  })
  const list = useRef<HTMLUListElement>(null)
  const buddies = useBuddies(list, shown.map((r) => r.id).join(' '))
  return (
    <>
      <p className="sr-only" role="status">
        {said}
      </p>
      <ul ref={list} id="resource-grid" className="resource-grid" aria-label="Resources" onKeyDown={keys.onKeyDown}>
        {shown.map((r, i) => (
          // Each arrives a beat after the one before (the first eight), and glides when it moves.
          <li
            key={r.id}
            style={{ '--i': Math.min(i, 8), viewTransitionName: glideName(r.id) }}
            data-dragging={drag.dragging === r.id || undefined}
            data-over={drag.over === r.id || undefined}
          >
            <ResourceTile
              resource={r}
              observation={observationOf(observations, r)}
              now={now}
              mine={r.owner.id === viewerId}
              waiting={openOn(actions, r.id)}
              waitingKey={openIds(actions, r.id)}
              onOpen={() => onOpen(r.id)}
              buddy={buddies.get(r.id)}
              current={i === keys.current}
              onFocus={() => keys.setActive(i)}
              drag={drag.handlers(r.id)}
              ref={(el) => {
                keys.tiles.current[i] = el
              }}
            />
          </li>
        ))}
      </ul>
    </>
  )
}
