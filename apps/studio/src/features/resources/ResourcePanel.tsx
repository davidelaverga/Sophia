// The project's Resources view (LFE-06): the enrolled tools as tiles to scan, found by a search and four filters as
// they grow to tens, with one line on top only while a request waits on an owner. A tile opens the resource's sheet,
// where everything else is. It goes in ProjectShell's `resources`. Its owner's acts (guidance, Hold, Stop) and effort
// requests go out through `onAct` and `onEffort`, to whoever the host passes; nothing here calls a tool.
import { useCallback, useEffect, useRef, useState } from 'react'
import { EmptyState, Search as SearchField, Segmented, Skeleton } from '@sophia/ui'
import { useCommands } from '../../app/useCommands.ts'
import { useClock } from './clock.ts'
import { linkedId, REQUEST, requestOf, showInAddress } from './link.ts'
import { moving } from './motion.ts'
import { ordered, placed, type Order } from './order.ts'
import { readPrefs, savePrefs } from './prefs.ts'
import { useUltra } from './ultra.ts'
import { useAddressed } from './useAddressed.ts'
import type { EffortAsk } from './change.ts'
import { ResourceSheet, type EffortControl, type TaskLinks } from './ResourceSheet.tsx'
import { glance, readSeen, whileAway, writeSeen, type Seen } from './away.ts'
import { AwayLine } from './AwayLine.tsx'
import { roomElsewhere } from './room.ts'
import { commandSpace } from './command-store.ts'
import { useActs, type SendCommand } from './SessionActs.tsx'
import { SortMenu } from './SortMenu.tsx'
import { TileGrid } from './TileGrid.tsx'
import {
  anyLive,
  CATALOG_SCOPE,
  FILTER_LABEL,
  FILTERS,
  inFilter,
  matches,
  observationOf,
  plural,
  summary,
  TOOL,
  type Filter,
  type QuotaObservation,
  type RequiredAction,
  type Resource,
} from './resource.ts'
import { ToolLogo } from './ToolLogo.tsx'
import type { PartialWhy } from './native-catalog.ts'
import { CATALOG_ENROLLMENT } from './status-words.ts'
import { clock } from '../../app/time-words.ts'
import './resources.css'

/**
 * Where the resources come from A51's catalog (INC01-DES-002): how far its pages were read, and the ways to read on. The
 * panel then keeps nothing in this browser (no last look, no kept filter or order), offers only the filters whose facts
 * it reports, and says what it doesn't report.
 */
export interface CatalogRead {
  status: 'complete' | 'more' | 'partial'
  /** A More read under way. */
  reading: boolean
  partial: PartialWhy | null
  /** When the last page read was observed: said with a partial read. */
  lastObservedAt: string | null
  onMore: () => void
  onRetry: () => void
}

interface Props {
  resources: Resource[]
  /** The latest observation per account; an account without one shows its capacity as unknown. */
  observations: QuotaObservation[]
  /** The requests waiting on owners; null where they aren't reported (the catalog): never "nothing waiting". */
  actions: RequiredAction[] | null
  /** Who is looking: only an action's owner is told how to answer it, and their own resource says "You". */
  viewerId: string
  /** When the data was read: the view's clock starts here and moves on while the page is open (clock.ts). */
  now: Date
  /** The resources are not read yet: placeholders hold their places. */
  loading?: boolean
  /** Earlier readings of the accounts, for each window's history in a sheet; none when only the latest is kept. */
  history?: QuotaObservation[]
  /**
   * Where an owner's choice of a session's effort goes (the runtime's launch configuration, SCM-01). Absent, no
   * effort can be chosen and the bars stay read-only. `level` null withdraws the request.
   */
  onEffort?: (sessionId: string, ask: EffortAsk | null, refused: () => void) => void
  /** The way to a session's task on the plan's board (LFE-07.1); absent, a session's task is only its title. */
  tasks?: TaskLinks
  /** Where an owner's guidance, Hold or Stop on a session goes (LFE-06.6); absent, none is offered. */
  onAct?: SendCommand
  /** The project the panel's commands are for; absent, none is offered (a command names its project exactly). */
  projectId?: string
  /** Where the viewer's last look is kept (LFE-06.7): the project's id, so two projects' never mix. */
  scope?: string
  /** Read from A51's catalog, how far (INC01-DES-002); absent for every other source. */
  catalog?: CatalogRead
}

/** The requests known to the panel's parts: none where they aren't reported, which no part then says as none. */
const known = (actions: Props['actions']): RequiredAction[] => actions ?? []

/** The panel's commands, for the project its scope names, in the space Tasks shares (command-store.ts). */
const usePanelActs = ({ onAct, projectId, viewerId }: Props) =>
  useActs(projectId ? onAct : undefined, projectId ?? '', commandSpace(projectId ?? '', viewerId))

/**
 * What changed since the viewer last looked (away.ts): a glance kept in this browser, the line it makes, and the tiles
 * that moved. A first visit, once the resources are read, remembers them as they are and says nothing.
 */
function useAway(props: Props) {
  const { resources, observations, viewerId, now, loading = false, scope = 'resources' } = props
  const actions = known(props.actions)
  // The catalog's view keeps nothing in this browser: no last look is read or written (INC01-DES-002).
  const keeps = !props.catalog
  // Kept for whose look, where: another scope or viewer reads its own.
  const at = `${scope}.${viewerId}`
  const [kept, setKept] = useState(() => ({ at, seen: keeps ? readSeen(scope, viewerId) : null }))
  const seen = !keeps ? null : kept.at === at ? kept.seen : readSeen(scope, viewerId)
  const keep = (glanced: Seen) => {
    if (keeps) setKept({ at, seen: writeSeen(scope, viewerId, glanced) })
  }
  const current = glance(resources, actions, observations, now)
  // Read, even with nothing enrolled yet: one enrolled later is then new here.
  const first = keeps && !seen && !loading
  useEffect(() => {
    if (first) setKept({ at, seen: writeSeen(scope, viewerId, glance(resources, actions, observations, now)) })
  }, [first, at, scope, viewerId, resources, actions, observations, now])
  const line =
    loading || !keeps ? null : whileAway({ resources, actions, observations, now: current, seen, at: now, viewerId })
  return {
    keeps,
    since: line?.ids ?? new Set<string>(),
    line: line ?? { phrases: [], more: 0 },
    markSeen: () => keep(current),
  }
}

const openOn = (actions: RequiredAction[], id: string) =>
  actions.filter((a) => a.resourceId === id && a.state === 'open').length

/** One line, only while something waits: whose tool holds a request, each a way into its sheet. */
function Attention({
  resources,
  actions,
  viewerId,
  onOpen,
}: Pick<Props, 'resources' | 'viewerId'> & {
  actions: RequiredAction[]
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
  /** The filters offered: all four, or only those whose facts are reported. */
  filters: readonly Filter[]
  /** Their counts are of the rows read so far, not the whole catalog (UX03). */
  loaded?: boolean
}

/**
 * The catalog's filters (INC01-DES-002): all, and the viewer's own. It reports no requests and no host online, so it
 * offers no Waiting or Online to count as none.
 */
const CATALOG_FILTERS: readonly Filter[] = ['all', 'mine']

function Filters({ filter, counts, onChange, filters, loaded = false }: FiltersProps) {
  return (
    <Segmented
      role="tablist"
      label={loaded ? 'Show loaded' : 'Show'}
      className="resource-filters"
      items={filters.map((f) => ({ id: f, label: FILTER_LABEL[f], count: counts[f], controls: 'resource-grid' }))}
      value={filter}
      onChange={onChange}
    />
  )
}

interface SearchProps {
  query: string
  onChange: (q: string) => void
  /** What it searches: the catalog's tools and owners only (UX03), or a richer source's work too. */
  scope?: 'catalog' | 'all'
}

/** The search, focused with "/" from anywhere on the view; Escape clears it, then leaves it. */
function Search({ query, onChange, scope = 'all' }: SearchProps) {
  const input = useRef<HTMLInputElement>(null)
  useCommands([
    {
      id: 'search-resources',
      words: 'Search the resources',
      group: 'view',
      key: '/',
      also: ['find'],
      run: () => input.current?.focus(),
    },
  ])
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return
    if (query) onChange('')
    else input.current?.blur()
  }
  return (
    <SearchField
      ref={input}
      className="resource-search"
      aria-label="Search resources"
      aria-keyshortcuts="/"
      placeholder={scope === 'catalog' ? 'Search tools or owners…' : 'Search tools, owners, work…'}
      value={query}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      tip={{ label: 'Search', keys: '/', side: 'bottom' }}
    />
  )
}

interface NoneProps {
  query: string
  filter: Filter
  onClear: () => void
  onAll: () => void
  /** The catalog, while rows remain unread (UX03): no match is said of what was loaded, with the way to read on. */
  unread?: CatalogRead | undefined
}

/** Nothing shown among the rows loaded, while more remain unread: said of those, with the next read (UX03). */
function NoneLoaded({ query, filter, read }: Pick<NoneProps, 'query' | 'filter'> & { read: CatalogRead }) {
  const what = query ? `Nothing loaded matches “${query}”.` : `Nothing loaded under ${FILTER_LABEL[filter]}.`
  return (
    <>
      <p>
        {what} {read.status === 'more' ? 'More resources aren’t read yet.' : 'The rest couldn’t be read.'}
      </p>
      <ReadOn read={read} />
    </>
  )
}

/** Nothing shown: said, with the way back to what is there, and, while rows remain unread, the way to read on. */
function None({ query, filter, onClear, onAll, unread: read }: NoneProps) {
  return (
    <div className="resources-none" data-none={read ? 'loaded' : 'all'}>
      {read ? (
        <NoneLoaded query={query} filter={filter} read={read} />
      ) : (
        <p>{query ? `Nothing matches “${query}”` : `Nothing here under ${FILTER_LABEL[filter]}`}</p>
      )}
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

/** What a view starts from where nothing of the viewer's is kept (the catalog): every resource, by attention. */
const FRESH = { filter: 'all' as Filter, order: 'attention' as Order, custom: [] as string[] }

function useView({ resources, viewerId, catalog, actions: given }: Props) {
  const actions = known(given)
  // The catalog's view keeps nothing in this browser: its filter and order aren't read or saved (INC01-DES-002).
  const keeps = !catalog
  const [query, setQuery] = useState('')
  const [kept] = useState(() => (keeps ? readPrefs(viewerId) : FRESH))
  const [filter, setFilter] = useState<Filter>(kept.filter)
  const [order, setOrder] = useState<Order>(kept.order)
  const [custom, setCustom] = useState<string[]>(kept.custom)
  useEffect(() => {
    if (keeps) savePrefs(viewerId, { filter, order, custom })
  }, [keeps, viewerId, filter, order, custom])
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

/** The enrolled tools to browse: the search and filters over the tiles, or what to do when none is shown. */
type View = ReturnType<typeof useView>

type Shown = Props & { onOpen: (id: string) => void; view: View; since: ReadonlySet<string> }

function Browse(props: Shown) {
  const { resources, observations, viewerId, now, onOpen, view, since } = props
  const actions = known(props.actions)
  const unread = props.catalog && props.catalog.status !== 'complete' ? props.catalog : undefined
  return (
    <>
      <div className="resources-toolbar">
        <Search query={view.query} onChange={view.setQuery} scope={props.catalog ? 'catalog' : 'all'} />
        <Filters
          filter={view.filter}
          counts={view.counts}
          onChange={(f) => moving(() => view.setFilter(f))}
          filters={props.catalog ? CATALOG_FILTERS : FILTERS}
          loaded={unread !== undefined}
        />
        <SortMenu order={view.order} onChange={(o) => moving(() => view.setOrder(o))} />
      </div>
      <p className="sr-only" aria-live="polite">
        {view.shown.length} of {plural(resources.length, unread ? 'loaded resource' : 'resource')} shown
      </p>
      {view.shown.length === 0 ? (
        <None
          query={view.query}
          filter={view.filter}
          onClear={() => moving(() => view.setQuery(''))}
          onAll={() => moving(() => view.setFilter('all'))}
          unread={unread}
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
          since={since}
        />
      )}
    </>
  )
}

/** While the resources are read: six tiles' shapes in their places (the kit's skeleton, in the tiles' own grid). */
function Placeholders() {
  return (
    <Skeleton kind="card" count={6} label="Reading the resources…" className="resource-grid resource-placeholders" />
  )
}

/** What the view shows under its head: placeholders while reading, the empty note, or the tiles to browse. */
/**
 * The catalog read, with no row shown, when it isn't complete (DES002-F01): a first page with none that says more
 * follows is never an empty catalog. Said as such, when it was read, with a new read to try.
 */
function Incomplete({ read }: { read: CatalogRead }) {
  const at = read.lastObservedAt
  return (
    <div className="resources-read" role="status" data-read="incomplete">
      <p>
        The resources couldn’t be read in full, so none is shown.
        {at && (
          <>
            {' '}
            Read at <time dateTime={at}>{clock(at)}</time>.
          </>
        )}
      </p>
      <button type="button" className="text-button" onClick={read.onRetry}>
        Try again
      </button>
    </div>
  )
}

/** Whether no row is shown because the catalog wasn't read in full: never an empty catalog then. */
const unread = ({ catalog, resources }: { catalog: CatalogRead | undefined; resources: Resource[] }) =>
  resources.length === 0 && catalog !== undefined && catalog.status !== 'complete'

function Body(props: Shown) {
  if (props.loading) return <Placeholders />
  if (props.catalog && unread({ catalog: props.catalog, resources: props.resources })) {
    return <Incomplete read={props.catalog} />
  }
  if (props.resources.length === 0) {
    // Only an observed complete empty catalog, or known data with none, says so; the catalog with how one comes to be
    // listed (UX04), as no enrollment is offered here.
    return props.catalog ? (
      <EmptyState>No tool is enrolled for this project yet. {CATALOG_ENROLLMENT}</EmptyState>
    ) : (
      <EmptyState>No tool is enrolled for this project yet. An owner enrolls one from their own host.</EmptyState>
    )
  }
  return <Browse {...props} />
}

/** Each session's requested effort, kept until withdrawn, and told on; none when nothing takes the request. */
function useEffort(onEffort: Props['onEffort']): EffortControl | undefined {
  const [asked, setAsked] = useState<Record<string, EffortAsk | undefined>>({})
  // Kept the same across renders: a session's line waits on it to let a done request go.
  const settle = useCallback((sessionId: string) => setAsked((a) => ({ ...a, [sessionId]: undefined })), [])
  if (!onEffort) return undefined
  return {
    asked,
    settle,
    set: (sessionId, ask) => {
      setAsked((a) => ({ ...a, [sessionId]: ask }))
      // Refused by its runtime: said so, if it is still the request shown.
      onEffort(sessionId, ask, () =>
        setAsked((a) => (a[sessionId] === ask ? { ...a, [sessionId]: { ...ask, refused: true } } : a)),
      )
    },
    undo: (sessionId) => {
      setAsked((a) => ({ ...a, [sessionId]: undefined }))
      onEffort(sessionId, null, () => undefined)
    },
  }
}

/** While a session reports live, the view's clock moves each second, so its age counts as a task tile's does. */
const SECOND = 1000

/** The view's clock: each second while any session reports live, else each minute. */
function useViewClock(given: Props): Date {
  const [fast, setFast] = useState(true)
  const now = useClock(given.now, fast ? SECOND : undefined)
  const live = given.resources.some((r) => anyLive(r, now))
  useEffect(() => setFast(live), [live])
  return now
}

/** The request's row, once the sheet has drawn it (a frame or a few after its resource opened): it takes the focus. */
function focusRequest(id: string, tries = 10): void {
  const row = document.querySelector<HTMLElement>(`[data-request="${CSS.escape(id)}"]`)
  if (row) row.focus()
  else if (tries > 0) requestAnimationFrame(() => focusRequest(id, tries - 1))
}

/**
 * A request named in the address (`#request-<id>`, from Home's «needs you», needs-api.md): its resource's sheet opens
 * and the request takes the focus, once per address; the address is the sheet's from then on. A request not among
 * those read opens nothing, and the address is kept for when it is.
 */
function useAddressedRequest(
  actions: readonly RequiredAction[],
  resources: readonly Resource[],
  setOpen: (id: string | null) => void,
) {
  const named = useAddressed(REQUEST)
  const handled = useRef(-1)
  useEffect(() => {
    if (handled.current === named.seq || !named.id) return
    // By the request and its resource when the address names both (Codex on #245).
    const { resourceId, requestId } = requestOf(named.id)
    const action = actions.find((a) => a.id === requestId && (resourceId === null || a.resourceId === resourceId))
    if (!action || !resources.some((r) => r.id === action.resourceId)) return
    handled.current = named.seq
    setOpen(action.resourceId)
    showInAddress(action.resourceId)
    requestAnimationFrame(() => focusRequest(action.id))
  }, [named, actions, resources, setOpen])
}

/** The catalog's way to read on, where rows remain unread: the next page, or a new read after one failed. */
function ReadOn({ read }: { read: CatalogRead }) {
  if (read.status === 'more') {
    return (
      <button type="button" className="text-button" onClick={read.onMore} disabled={read.reading}>
        {read.reading ? 'Reading more resources…' : 'More resources'}
      </button>
    )
  }
  return (
    <button type="button" className="text-button" onClick={read.onRetry}>
      Try again
    </button>
  )
}

/**
 * Under the catalog's head, before its toolbar and tiles (UX05): while rows remain unread, how many are loaded, and
 * either more to read, with More resources, or that the rest couldn't be read, when, with Try again. Said here once,
 * where a phone shows it first; nothing under the tiles repeats it. Nothing when every page was read.
 */
function CatalogCue({ read, loaded }: { read: CatalogRead; loaded: number }) {
  if (read.status === 'complete') return null
  const at = read.lastObservedAt
  return (
    <div
      className={read.status === 'partial' ? 'resources-cue resources-partial' : 'resources-cue'}
      role="status"
      data-read={read.status}
    >
      <p>
        <span className="resources-cue-count">{loaded} loaded</span>
        {' · '}
        {read.status === 'more'
          ? 'more not read yet'
          : read.partial === 'inconsistent'
            ? 'the rest couldn’t be read consistently.'
            : 'couldn’t read the rest.'}
        {read.status === 'partial' && at && (
          <>
            {' '}
            Shown as read at <time dateTime={at}>{clock(at)}</time>.
          </>
        )}
      </p>
      <ReadOn read={read} />
    </div>
  )
}

/** What the catalog is, under its head (UX01): said once, in the panel and in every read notice (ProjectResources). */
export function CatalogScope() {
  return <p className="resources-scope">{CATALOG_SCOPE}</p>
}

/**
 * The view's head: how many, and beside it what waits; for the catalog, how many are loaded while more remain unread
 * (UX03), and under it what the catalog is (UX01), at every width.
 */
function ViewHead({
  resources,
  actions,
  loading,
  catalog,
}: Pick<Props, 'resources'> & {
  actions: RequiredAction[]
  loading: boolean | undefined
  catalog: CatalogRead | undefined
}) {
  const count =
    loading || unread({ catalog, resources })
      ? '–'
      : catalog && catalog.status !== 'complete'
        ? `${resources.length} loaded`
        : resources.length
  return (
    <>
      <header className="view-head">
        <h2 id="resources-title">Resources</h2>
        <span className="count">{count}</span>
        {!loading && !catalog && <span className="resources-summary">{summary(resources, actions)}</span>}
      </header>
      {catalog && <CatalogScope />}
    </>
  )
}

/**
 * The lines under the head, once read: what waits on an owner, where requests are reported; what changed since the
 * viewer last looked, where a look is kept (never for the catalog, which keeps nothing in this browser).
 */
function Lines({
  resources,
  actions,
  viewerId,
  away,
  onOpen,
}: Pick<Props, 'resources' | 'actions' | 'viewerId'> & {
  away: ReturnType<typeof useAway>
  onOpen: (id: string | null) => void
}) {
  return (
    <>
      {actions !== null && <Attention resources={resources} actions={actions} viewerId={viewerId} onOpen={onOpen} />}
      {away.keeps && <AwayLine away={away.line} onSeen={away.markSeen} className="resources-away" />}
    </>
  )
}

export function ResourcePanel(given: Props) {
  const now = useViewClock(given)
  const props = { ...given, now }
  const { resources, observations, viewerId } = props
  const actions = known(props.actions)
  // The address's resource is kept until the resources are read; it opens when it is among them.
  const [open, setOpen] = useState<string | null>(() => linkedId(window.location.hash))
  useAddressedRequest(actions, resources, setOpen)
  const selected = resources.find((r) => r.id === open)
  const show = (id: string | null) => {
    setOpen(id)
    showInAddress(id)
  }
  const view = useView(props)
  const ultra = useUltra()
  const effort = useEffort(props.onEffort)
  // Each session's commands, kept here by their work and generation: still said after its row closes or the sheet turns.
  const acts = usePanelActs(props)
  const away = useAway(props)
  // The sheet steps through what the viewer is looking at: the shown tiles, in their order; all of them otherwise.
  const order = view.shown.some((r) => r.id === open) ? view.shown : resources
  const at = order.findIndex((r) => r.id === open)
  const step = (by: 1 | -1) => show(order[(at + by + order.length) % order.length]?.id ?? null)
  return (
    <section className="resources" aria-labelledby="resources-title" data-ultra={ultra || undefined}>
      <p className="sr-only" role="status">
        {ultra ? 'Ultracode, for everyone, for a moment.' : ''}
      </p>
      <ViewHead resources={resources} actions={actions} loading={props.loading} catalog={props.catalog} />
      {!props.loading && props.catalog && resources.length > 0 && (
        <CatalogCue read={props.catalog} loaded={resources.length} />
      )}
      {!props.loading && (
        <Lines resources={resources} actions={props.actions} viewerId={viewerId} away={away} onOpen={show} />
      )}
      <Body {...props} onOpen={show} view={view} since={away.since} />
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
          effort={effort}
          tasks={props.tasks}
          acts={acts}
          room={roomElsewhere(selected, resources, observations, now, viewerId)}
          onShow={show}
        />
      )}
    </section>
  )
}
