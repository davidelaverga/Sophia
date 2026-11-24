// What Sophia made, born in the room (docs/plans/room-made-object.md, made-fits.md): a result's notice brings one line
// under hers, words on the stage as hers and the captions are: the report's name, which opens it, its kind and
// version, Show everyone and Close. Its description and facts are the chat card's and the viewer's. The chat keeps its
// own card; this one is put away for this person once opened (here or anywhere) or closed. Until the task's record is
// read it says what the chat's card says, and Open waits.
import { useQuery } from '@tanstack/react-query'
import { TaskRefused } from '../artifacts/TaskRefused.tsx'
import { useOwnedTaskDetail } from '../artifacts/task-detail.ts'
import { ReportRefused } from '../artifacts/ReportRefused.tsx'
import { useOwnedVersions } from '../artifacts/report-versions.ts'
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Icon, Tip } from '@sophia/ui'
import { listReports } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { modalOnScreen, ShortcutScope } from '../../app/shortcuts.ts'
import { useCommands } from '../../app/useCommands.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { escapeStepsDown } from '../artifacts/report-view.ts'
import { noticeActions, noticeOpenRequest, noticeTitle, type ChatNoticeItem } from '../conversation/chat-view.ts'
import { madeHeading, madeKey, madeOnStage } from './made-view.ts'
import type { ShowRender } from './ShowEveryone.tsx'
import type { ProjectRoom } from './useProjectRoom.ts'

/** One key per notice in a set, kept as it grows; `add` stays the same function. */
function useKeys() {
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set())
  const add = useCallback(
    (notice: ChatNoticeItem) => setKeys((was) => (was.has(madeKey(notice)) ? was : new Set([...was, madeKey(notice)]))),
    [],
  )
  return [keys, add] as const
}

/**
 * The notice the stage shows, put away or not, and born once: kept where the room lives (ProjectBody), so neither
 * returns after a visit to another view, Chat opened and closed, or the lens switched.
 */
export function useStageMade(notices: readonly ChatNoticeItem[]) {
  const [away, putAway] = useKeys()
  const [born, wasBorn] = useKeys()
  const notice = madeOnStage(notices, away)
  return { notice, fresh: !!notice && !born.has(madeKey(notice)), wasBorn, putAway }
}

export type StageMadeState = ReturnType<typeof useStageMade>

/**
 * The object on the stage, or null: in the call, with Chat closed (its own card is there then), while a notice this
 * person hasn't put away is the newest. Keyed by the notice, so a revision is born again. Its key (O) is offered only
 * while no side panel is open: with one open, the keys belong to it.
 */
export function madeOnTheStage(
  made: StageMadeState,
  room: Pick<ProjectRoom, 'status' | 'participants'>,
  panel: { chatOpen: boolean; anyOpen: boolean },
  context: { projectId: string; identity: Identity; show?: ShowRender | undefined },
): ReactNode {
  const { notice } = made
  const inCall = room.status === 'live' || room.status === 'reconnecting'
  if (!notice || !inCall || panel.chatOpen) return null
  return (
    <StageMade
      key={madeKey(notice)}
      notice={notice}
      projectId={context.projectId}
      identity={context.identity}
      fresh={made.fresh}
      keys={!panel.anyOpen}
      onBorn={made.wasBorn}
      onPutAway={made.putAway}
      show={context.show}
    />
  )
}

interface Props {
  notice: ChatNoticeItem
  projectId: string
  identity: Identity
  /** First time in the room: it is born; back in sight, it is simply there. */
  fresh: boolean
  /** Its key may be offered: no side panel is open. */
  keys: boolean
  onBorn: (notice: ChatNoticeItem) => void
  onPutAway: (notice: ChatNoticeItem) => void
  /** «Show everyone», where it is offered (showRenderOf): shown, the object goes, as it does once opened. */
  show?: ShowRender | undefined
}

/** The task's record, its report's version (the one the record names) and its card on Knowledge. */
function useMadeRecord({ notice, projectId, identity }: Pick<Props, 'notice' | 'projectId' | 'identity'>) {
  // The task's own refusal (task-detail-read.ts) withholds its record: result facts, asker, report link.
  const {
    query: task,
    detail,
    refused: taskRefused,
  } = useOwnedTaskDetail({
    queryKey: ['native-task', projectId, notice.taskId, 'notice', notice.resultRevision, identity.name],
    projectId,
    taskId: notice.taskId,
    identity,
  })
  const artifactId = detail?.task.artifactId
  // The report's own refusal (report-read.ts) withholds what was read of it here too.
  const { versions, refused } = useOwnedVersions(
    ['report-versions', artifactId, identity.name],
    artifactId,
    identity,
    true,
  )
  // Knowledge's first page holds a report just made (newest first). Under Knowledge's own key, so a description
  // edited there is read again here; otherwise at most every half minute.
  const card = useQuery({
    queryKey: ['reports', 'card', projectId, artifactId, identity.name],
    queryFn: async () =>
      (await listReports(identity.token, { project: projectId })).reports.find((r) => r.artifactId === artifactId) ??
      null,
    enabled: !!artifactId,
    staleTime: 30_000,
  }).data
  const outputs = detail?.result?.outputs ?? []
  // Only the version the record names: a list cached before a revision would show the older one.
  const version = versions?.find((v) => v.id === outputs[0]?.artifactVersionId)
  // A read that failed is said, with a way to try again: never an Open that waits for ever. The task's own refusal is
  // not such a failure: it has its one recovery (MadeTaskRefused), never a second Try again or transient words too.
  const failed = task.isError && !detail && !taskRefused
  // The room shows what is current: a version since replaced isn't offered to everyone.
  const current = !!version && versions?.[0]?.id === version.id
  const record = { detail, artifactId, version, current, card, outputs, failed, retry: () => void task.refetch() }
  return { ...withheld(record, refused), taskRefused }
}

/** Refused (report-read.ts): the report's card and outputs are withheld too, not only its versions. */
function withheld<R extends { card: unknown; outputs: readonly unknown[] }>(record: R, refused: boolean) {
  return refused ? { ...record, card: undefined, outputs: [], refused } : { ...record, refused }
}

/** The Chat toggle of this stage, which holds the object's card: where the focus goes once the object is gone. */
const focusChatOf = (el: HTMLElement | null) =>
  el?.closest('.room-stage')?.querySelector<HTMLElement>('.panel-toggles [data-panel="chat"]')?.focus()

/**
 * Esc puts it away wherever the focus is, as long as nothing else owns the key: a field, a dialog, a panel (`enabled`
 * is false while one holds the keys) or a report on screen, whose own Esc steps down.
 */
function useEscapeAway(enabled: boolean, away: () => void) {
  const inSight = useContext(ShortcutScope)
  const latest = useRef(away)
  useEffect(() => {
    latest.current = away
  })
  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target instanceof HTMLElement ? e.target : null
      const owned = !!t && (t.isContentEditable || !!t.closest('[role="dialog"], input, textarea, select'))
      if (
        !escapeStepsDown({ defaultPrevented: e.defaultPrevented, repeat: e.repeat, owned }, inSight, modalOnScreen())
      ) {
        return
      }
      e.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, inSight])
}

/** Open, Close and their key: Open shows the report in the viewer; either puts the object away. */
function useMadeActions(
  props: Props,
  self: RefObject<HTMLDivElement | null>,
  record: Pick<ReturnType<typeof useMadeRecord>, 'artifactId' | 'outputs'>,
) {
  const { notice, keys, onPutAway } = props
  const { artifactId, outputs } = record
  const viewer = useDocumentViewer()
  const { primary } = noticeActions(outputs)
  const ready = Boolean(viewer && artifactId && primary)
  // Opened elsewhere (the chat's card, Knowledge): it is read, so it goes from the stage too.
  const shownElsewhere = !!artifactId && viewer?.shown === artifactId
  useEffect(() => {
    if (shownElsewhere) onPutAway(notice)
  }, [shownElsewhere, onPutAway, notice])
  const close = () => {
    focusChatOf(self.current)
    onPutAway(notice)
  }
  const open = () => {
    if (!viewer || !artifactId || !primary) return
    focusChatOf(self.current) // what the viewer gives the focus back to when it closes
    viewer.open(noticeOpenRequest(artifactId, primary))
    onPutAway(notice)
  }
  // O only while it does something: the report is ready, no report is on screen, no panel holds the keys.
  const key = keys && ready && !viewer?.shown
  useCommands([{ id: 'open-made', words: 'Open what Sophia made', group: 'room', key: 'o', run: open }], key)
  useEscapeAway(keys && !viewer?.shown, close)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    close()
  }
  return { ready, key, open, close, onKeyDown }
}

/**
 * Its place under Sophia's line, however tall the line is now (a note, a session, words wrapping on a phone): the
 * line's height is published as `--line-h`, measured before the first paint and again as it changes.
 */
function useUnderHerLine(self: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const stage = self.current?.closest<HTMLElement>('.room-stage')
    const line = stage?.querySelector<HTMLElement>('.sophia-line')
    if (!stage || !line) return undefined
    const publish = () => stage.style.setProperty('--line-h', `${String(Math.ceil(line.offsetHeight))}px`)
    publish()
    const sized = new ResizeObserver(publish)
    sized.observe(line)
    return () => {
      sized.disconnect()
      stage.style.removeProperty('--line-h')
    }
  }, [self])
}

/**
 * Its name is its Open (made-fits.md): the report's name and a chevron, said as «Open» and the name; its key in the
 * Studio's tip while the key works. Once a read failed, its name stands alone, with Try again.
 */
function OpenTitle(p: { title: string; ready: boolean; keyOn: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="made-open has-tip"
      onClick={p.onOpen}
      aria-disabled={!p.ready || undefined}
      aria-keyshortcuts={p.keyOn ? 'o' : undefined}
    >
      <span className="sr-only">Open </span>
      <span className="made-title">{p.title}</span>
      <span className="made-go" aria-hidden="true">
        <Icon name="forward" size={12} />
      </span>
      {p.keyOn && <Tip label="Open the report" keys="O" />}
    </button>
  )
}

/** A read that failed, on its own line under the object's: what happened, and Try again. */
function RetryRead({ onRetry }: { onRetry: () => void }) {
  return (
    <span className="made-retry">
      <span className="made-failed" role="status">
        It couldn’t be read just now.
      </span>
      <button type="button" className="text-button" onClick={onRetry}>
        Try again
      </button>
    </span>
  )
}

export function StageMade(props: Props) {
  const { notice, fresh, onBorn } = props
  const self = useRef<HTMLDivElement>(null)
  const record = useMadeRecord(props)
  const { version, card } = record
  const { ready, key, open, close, onKeyDown } = useMadeActions(props, self, record)
  useUnderHerLine(self)
  const [born] = useState(fresh)
  useEffect(() => onBorn(notice), [onBorn, notice])
  const heading = madeHeading(version, card?.title, noticeTitle(notice.taskKind))
  return (
    <div
      ref={self}
      className={`stage-made${born ? ' born' : ''}`}
      role="group"
      aria-label="Made by Sophia"
      onKeyDown={onKeyDown}
    >
      <span className="made-row">
        {record.failed ? (
          <span className="made-title">{heading.title}</span>
        ) : (
          <OpenTitle title={heading.title} ready={ready} keyOn={key} onOpen={open} />
        )}
        <span className="made-meta">{heading.meta}</span>
        <span className="made-acts">
          {props.show && version && record.current && props.show(version.id, () => props.onPutAway(notice), 'show')}
        </span>
        <button type="button" className="made-close has-tip" aria-label="Close" onClick={close}>
          <Icon name="close" />
          <Tip label="Close" keys={props.keys ? 'Esc' : undefined} align="end" />
        </button>
      </span>
      {record.failed && <RetryRead onRetry={record.retry} />}
      <MadeRefused artifactId={record.refused ? record.artifactId : undefined} identity={props.identity} />
      <MadeTaskRefused
        refused={record.taskRefused}
        projectId={props.projectId}
        taskId={notice.taskId}
        identity={props.identity}
      />
    </div>
  )
}

/** A refused report on the stage: only that it isn't available, with its Try again (ReportRefused). */
function MadeRefused({ artifactId, identity }: { artifactId: string | undefined; identity: Identity }) {
  return artifactId ? <ReportRefused artifactId={artifactId} identity={identity} /> : null
}

/** The task refused to this person: only that, with its Try again (TaskRefused). */
function MadeTaskRefused(p: { refused: boolean; projectId: string; taskId: string; identity: Identity }) {
  return p.refused ? <TaskRefused projectId={p.projectId} taskId={p.taskId} identity={p.identity} /> : null
}
