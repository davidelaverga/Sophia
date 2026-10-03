// The project's Resources view (LFE-06): the enrolled tools as tiles to scan, found by a search and four filters as
// they grow to tens, with one line on top only while a request waits on an owner. A tile opens the resource's sheet,
// where everything else is. It goes in ProjectShell's `resources`. It shows; it doesn't steer, hold or stop
// (LFE-06.4), and nothing here calls a tool.
import { useEffect, useRef, useState } from 'react'
import { Tip, useSlidingThumb } from '@sophia/ui'
import { nextInRow } from '../../app/roving.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { linkedResource, showInAddress } from './link.ts'
import { glideName, moving } from './motion.ts'
import { ORDER_LABEL, ordered, ORDERS, type Order } from './order.ts'
import { readPrefs, savePrefs } from './prefs.ts'
import { ResourceSheet } from './ResourceSheet.tsx'
import { ResourceTile } from './ResourceTile.tsx'
import {
  FILTER_LABEL,
  FILTERS,
  inFilter,
  matches,
  plural,
  summary,
  TOOL,
  type Filter,
  type QuotaObservation,
  type RequiredAction,
  type Resource,
} from './resource.ts'
import { ToolLogo } from './ToolLogo.tsx'
import './resources.css'

interface Props {
  resources: Resource[]
  /** The latest observation per account; an account without one shows its capacity as unknown. */
  observations: QuotaObservation[]
  actions: RequiredAction[]
  /** Who is looking: only an action's owner is told how to answer it, and their own resource says "You". */
  viewerId: string
  now: Date
}

const openOn = (actions: RequiredAction[], id: string) =>
  actions.filter((a) => a.resourceId === id && a.state === 'open').length

/** One line, only while something waits: whose tool holds a request, each a way into its sheet. */
function Attention({
  resources,
  actions,
  viewerId,
  onOpen,
}: Pick<Props, 'resources' | 'actions' | 'viewerId'> & {
  onOpen: (id: string) => void
}) {
  const waiting = resources.filter((r) => openOn(actions, r.id) > 0)
  if (waiting.length === 0) return null
  return (
    <div className="resources-attention" role="status">
      <span className="attention-dot" aria-hidden />
      {waiting.map((r) => {
        const n = openOn(actions, r.id)
        const who = r.owner.id === viewerId ? 'you' : r.owner.name
        return (
          <button key={r.id} type="button" className="attention-item" onClick={() => onOpen(r.id)}>
            <ToolLogo tool={r.tool} size="sm" />
            <span className="attention-label">
              {plural(n, 'request')} {n === 1 ? 'waits' : 'wait'} on {who}
            </span>
            <span className="attention-tool">{TOOL[r.tool]}</span>
          </button>
        )
      })}
    </div>
  )
}

interface FiltersProps {
  filter: Filter
  counts: Record<Filter, number>
  onChange: (f: Filter) => void
}

function Filters({ filter, counts, onChange }: FiltersProps) {
  const tabs = useRef(new Map<Filter, HTMLButtonElement>())
  const thumb = useSlidingThumb<HTMLDivElement>(filter)
  const onKeyDown = (event: React.KeyboardEvent) => {
    const next = nextInRow(FILTERS, filter, event.key)
    if (!next) return
    event.preventDefault()
    onChange(next)
    tabs.current.get(next)?.focus()
  }
  return (
    <div ref={thumb} className="segmented resource-filters" role="tablist" aria-label="Show" onKeyDown={onKeyDown}>
      {FILTERS.map((f) => (
        <button
          key={f}
          ref={(el) => {
            if (el) tabs.current.set(f, el)
          }}
          type="button"
          role="tab"
          data-thumb={f}
          aria-selected={f === filter}
          aria-controls="resource-grid"
          tabIndex={f === filter ? 0 : -1}
          onClick={() => onChange(f)}
        >
          {FILTER_LABEL[f]}
          <span className="filter-count">{counts[f]}</span>
        </button>
      ))}
    </div>
  )
}

interface SearchProps {
  query: string
  onChange: (q: string) => void
}

/** The search, focused with "/" from anywhere on the view; Escape clears it, then leaves it. */
function Search({ query, onChange }: SearchProps) {
  const input = useRef<HTMLInputElement>(null)
  useShortcuts({ '/': () => input.current?.focus() })
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return
    if (query) onChange('')
    else input.current?.blur()
  }
  return (
    <div className="field quiet resource-search has-tip">
      <input
        ref={input}
        type="search"
        aria-label="Search resources"
        aria-keyshortcuts="/"
        placeholder="Search tools, owners, work…"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <Tip label="Search" keys="/" side="bottom" />
    </div>
  )
}

interface NoneProps {
  query: string
  filter: Filter
  onClear: () => void
  onAll: () => void
}

/** Nothing shown: said, with the way back to what is there. */
function None({ query, filter, onClear, onAll }: NoneProps) {
  return (
    <div className="resources-none">
      <p>{query ? `Nothing matches “${query}”` : `Nothing here under ${FILTER_LABEL[filter]}`}</p>
      {query && (
        <button type="button" className="text-button" onClick={onClear}>
          Clear search
        </button>
      )}
      {filter !== 'all' && (
        <button type="button" className="text-button" onClick={onAll}>
          Show all
        </button>
      )}
    </div>
  )
}

interface SortProps {
  order: Order
  onChange: (order: Order) => void
}

const isOrder = (value: string): value is Order => ORDERS.some((o) => o === value)

/** The tiles' order: by attention (what needs someone first), by owner or by tool. */
function Sort({ order, onChange }: SortProps) {
  return (
    <label className="field quiet resource-sort">
      <span className="resource-sort-label">Sort</span>
      <select
        value={order}
        onChange={(e) => {
          if (isOrder(e.target.value)) onChange(e.target.value)
        }}
      >
        {ORDERS.map((o) => (
          <option key={o} value={o}>
            {ORDER_LABEL[o]}
          </option>
        ))}
      </select>
    </label>
  )
}

function useView({ resources, actions, viewerId }: Props) {
  const [query, setQuery] = useState('')
  const [kept] = useState(() => readPrefs(viewerId))
  const [filter, setFilter] = useState<Filter>(kept.filter)
  const [order, setOrder] = useState<Order>(kept.order)
  useEffect(() => savePrefs(viewerId, { filter, order }), [viewerId, filter, order])
  const found = resources.filter((r) => matches(r, query))
  const count = (f: Filter) => found.filter((r) => inFilter(f, r, actions, viewerId)).length
  const counts: Record<Filter, number> = {
    all: count('all'),
    waiting: count('waiting'),
    online: count('online'),
    mine: count('mine'),
  }
  const shown = ordered(
    found.filter((r) => inFilter(filter, r, actions, viewerId)),
    order,
    actions,
  )
  return { query, setQuery, filter, setFilter, order, setOrder, counts, shown }
}

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

/** One tile in the Tab order (the last one focused); arrow keys, Home and End move across the grid. */
function useRoving(count: number) {
  const tiles = useRef<(HTMLButtonElement | null)[]>([])
  const [active, setActive] = useState(0)
  const current = Math.min(active, Math.max(0, count - 1))
  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const columns = getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').length
    const to = moveTo(e.key, current, count, columns)
    if (to === null) return
    e.preventDefault()
    setActive(to)
    tiles.current[to]?.focus()
  }
  return { tiles, current, setActive, onKeyDown }
}

const observationOf = (observations: QuotaObservation[], r: Resource) =>
  observations.find((o) => o.entitlement_id === r.entitlementId)

/** The enrolled tools to browse: the search and filters over the tiles, or what to do when none is shown. */
function Browse(props: Props & { onOpen: (id: string) => void }) {
  const { resources, observations, actions, viewerId, now, onOpen } = props
  const view = useView(props)
  const roving = useRoving(view.shown.length)
  return (
    <>
      <div className="resources-toolbar">
        <Search query={view.query} onChange={view.setQuery} />
        <Filters filter={view.filter} counts={view.counts} onChange={(f) => moving(() => view.setFilter(f))} />
        <Sort order={view.order} onChange={(o) => moving(() => view.setOrder(o))} />
      </div>
      <p className="sr-only" aria-live="polite">
        {view.shown.length} of {plural(resources.length, 'resource')} shown
      </p>
      {view.shown.length === 0 ? (
        <None
          query={view.query}
          filter={view.filter}
          onClear={() => moving(() => view.setQuery(''))}
          onAll={() => moving(() => view.setFilter('all'))}
        />
      ) : (
        <ul id="resource-grid" className="resource-grid" aria-label="Resources" onKeyDown={roving.onKeyDown}>
          {view.shown.map((r, i) => (
            // Each arrives a beat after the one before (the first eight), and glides when a filter moves it.
            <li key={r.id} style={{ '--i': Math.min(i, 8), viewTransitionName: glideName(r.id) }}>
              <ResourceTile
                resource={r}
                observation={observationOf(observations, r)}
                now={now}
                mine={r.owner.id === viewerId}
                waiting={openOn(actions, r.id)}
                onOpen={() => onOpen(r.id)}
                current={i === roving.current}
                onFocus={() => roving.setActive(i)}
                ref={(el) => {
                  roving.tiles.current[i] = el
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function ResourcePanel(props: Props) {
  const { resources, observations, actions, viewerId, now } = props
  const [open, setOpen] = useState<string | null>(() =>
    linkedResource(
      window.location.hash,
      resources.map((r) => r.id),
    ),
  )
  const selected = resources.find((r) => r.id === open)
  const show = (id: string | null) => {
    setOpen(id)
    showInAddress(id)
  }
  return (
    <section className="resources" aria-labelledby="resources-title">
      <header className="view-head">
        <h2 id="resources-title">Resources</h2>
        <span className="count">{resources.length}</span>
        <span className="resources-summary">{summary(resources, actions)}</span>
      </header>
      <Attention resources={resources} actions={actions} viewerId={viewerId} onOpen={show} />
      {resources.length === 0 ? (
        <p className="view-note">No tool is enrolled for this project yet. An owner enrolls one from their own host.</p>
      ) : (
        <Browse {...props} onOpen={show} />
      )}
      {selected && (
        <ResourceSheet
          resource={selected}
          observation={observationOf(observations, selected)}
          actions={actions}
          viewerId={viewerId}
          now={now}
          onClose={() => show(null)}
        />
      )}
    </section>
  )
}
