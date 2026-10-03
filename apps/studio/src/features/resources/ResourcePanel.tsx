// The project's Resources view (LFE-06): the enrolled tools as tiles to scan, found by a search and four filters as
// they grow to tens, with one line on top only while a request waits on an owner. A tile opens the resource's sheet,
// where everything else is. It goes in ProjectShell's `resources`. It shows; it doesn't steer, hold or stop
// (LFE-06.4), and nothing here calls a tool.
import { useEffect, useRef, useState } from 'react'
import { Tip, useSlidingThumb } from '@sophia/ui'
import { nextInRow } from '../../app/roving.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { useClock } from './clock.ts'
import { linkedId, showInAddress } from './link.ts'
import { moving } from './motion.ts'
import { ORDER_LABEL, ordered, ORDERS, placed, type Order } from './order.ts'
import { readPrefs, savePrefs } from './prefs.ts'
import { useUltra } from './ultra.ts'
import { ResourceSheet } from './ResourceSheet.tsx'
import { TileGrid } from './TileGrid.tsx'
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
  /** When the data was read: the view's clock starts here and moves on while the page is open (clock.ts). */
  now: Date
  /** The resources are not read yet: placeholders hold their places. */
  loading?: boolean
  /** Earlier readings of the accounts, for each window's history in a sheet; none when only the latest is kept. */
  history?: QuotaObservation[]
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
        const which = actions
          .filter((a) => a.resourceId === r.id && a.state === 'open')
          .map((a) => a.id)
          .join(' ')
        const who = r.owner.id === viewerId ? 'you' : r.owner.name
        return (
          <button key={r.id} type="button" className="attention-item" onClick={() => onOpen(r.id)}>
            <ToolLogo tool={r.tool} size="sm" />
            <span key={which} className="attention-label">
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
  const [custom, setCustom] = useState<string[]>(kept.custom)
  useEffect(() => savePrefs(viewerId, { filter, order, custom }), [viewerId, filter, order, custom])
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
    custom,
  )
  // A tile moved by hand takes its place in the whole order, hidden ones kept where they were, and the view is then
  // in the viewer's own order.
  const arrange = (id: string, target: string) =>
    moving(() => {
      setCustom(
        placed(
          ordered(resources, order, actions, custom).map((r) => r.id),
          id,
          target,
        ),
      )
      setOrder('custom')
    })
  return { query, setQuery, filter, setFilter, order, setOrder, counts, shown, arrange }
}

const observationOf = (observations: QuotaObservation[], r: Resource) =>
  observations.find((o) => o.entitlement_id === r.entitlementId)

/** The enrolled tools to browse: the search and filters over the tiles, or what to do when none is shown. */
type View = ReturnType<typeof useView>

function Browse(props: Props & { onOpen: (id: string) => void; view: View }) {
  const { resources, observations, actions, viewerId, now, onOpen, view } = props
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
        <TileGrid
          shown={view.shown}
          observations={observations}
          actions={actions}
          viewerId={viewerId}
          now={now}
          onOpen={onOpen}
          onArrange={view.arrange}
        />
      )}
    </>
  )
}

/** While the resources are read: tiles' shapes, still and quiet, in their places. */
function Placeholders() {
  return (
    <div className="resource-grid resource-placeholders" aria-busy="true">
      <p className="sr-only" role="status">
        Reading the resources…
      </p>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="resource-placeholder" aria-hidden style={{ '--i': i }}>
          <span />
          <span />
          <span />
        </span>
      ))}
    </div>
  )
}

/** What the view shows under its head: placeholders while reading, the empty note, or the tiles to browse. */
function Body(props: Props & { onOpen: (id: string) => void; view: View }) {
  if (props.loading) return <Placeholders />
  if (props.resources.length === 0) {
    return (
      <p className="view-note">No tool is enrolled for this project yet. An owner enrolls one from their own host.</p>
    )
  }
  return <Browse {...props} />
}

export function ResourcePanel(given: Props) {
  const now = useClock(given.now)
  const props = { ...given, now }
  const { resources, observations, actions, viewerId } = props
  // The address's resource is kept until the resources are read; it opens when it is among them.
  const [open, setOpen] = useState<string | null>(() => linkedId(window.location.hash))
  const selected = resources.find((r) => r.id === open)
  const show = (id: string | null) => {
    setOpen(id)
    showInAddress(id)
  }
  const view = useView(props)
  const ultra = useUltra()
  // The sheet steps through what the viewer is looking at: the shown tiles, in their order; all of them otherwise.
  const order = view.shown.some((r) => r.id === open) ? view.shown : resources
  const at = order.findIndex((r) => r.id === open)
  const step = (by: 1 | -1) => show(order[(at + by + order.length) % order.length]?.id ?? null)
  return (
    <section className="resources" aria-labelledby="resources-title" data-ultra={ultra || undefined}>
      <p className="sr-only" role="status">
        {ultra ? 'Ultracode, for everyone, for a moment.' : ''}
      </p>
      <header className="view-head">
        <h2 id="resources-title">Resources</h2>
        <span className="count">{props.loading ? '–' : resources.length}</span>
        {!props.loading && <span className="resources-summary">{summary(resources, actions)}</span>}
      </header>
      {!props.loading && <Attention resources={resources} actions={actions} viewerId={viewerId} onOpen={show} />}
      <Body {...props} onOpen={show} view={view} />
      {selected && !props.loading && (
        <ResourceSheet
          resource={selected}
          observation={observationOf(observations, selected)}
          earlier={(props.history ?? []).filter((o) => o.entitlement_id === selected.entitlementId)}
          actions={actions}
          viewerId={viewerId}
          now={now}
          onClose={() => show(null)}
          onStep={order.length > 1 ? step : undefined}
        />
      )}
    </section>
  )
}
