// What Sophia made, born in the room (docs/plans/room-made-object.md): a result's notice brings an object under her
// line, the report as Knowledge shows it (its title, its version, its description and whose words those are, who
// asked) with a few facts from its record, and Open and Close. The chat keeps its own card; this one is put away for
// this person once opened (here or anywhere) or closed. Until the task's record is read it says what the chat's card
// says, and Open waits.
import { useQuery } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Icon, Tip } from '@sophia/ui'
import { listArtifactVersions, listReports } from '../../api/artifacts.ts'
import { getNativeTask } from '../../api/conversation.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { noticeActions, noticeOpenRequest, noticeTitle, type ChatNoticeItem } from '../conversation/chat-view.ts'
import { factWords, madeFacts, madeHeading, madeKey, madeOnStage } from './made-view.ts'
import { memberLabel, withMe, type RoomNames } from './StageCaptions.tsx'
import type { ProjectRoom } from './useProjectRoom.ts'

/** A name inside a sentence: "Asked by you", "Asked by a member". */
const inSentence = (name: string) => (name === 'You' || name === 'A member' ? name.toLowerCase() : name)

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
  context: { projectId: string; identity: Identity; who: RoomNames },
): ReactNode {
  const { notice } = made
  const inCall = room.status === 'live' || room.status === 'reconnecting'
  if (!notice || !inCall || panel.chatOpen) return null
  const named = withMe(context.who, room.participants)
  return (
    <StageMade
      key={madeKey(notice)}
      notice={notice}
      projectId={context.projectId}
      identity={context.identity}
      nameOf={(actorId) => inSentence(memberLabel(actorId, named))}
      fresh={made.fresh}
      keys={!panel.anyOpen}
      onBorn={made.wasBorn}
      onPutAway={made.putAway}
    />
  )
}

interface Props {
  notice: ChatNoticeItem
  projectId: string
  identity: Identity
  /** A member named as a sentence names them ("you", "a member", or theirs). */
  nameOf: (actorId: string) => string
  /** First time in the room: it is born; back in sight, it is simply there. */
  fresh: boolean
  /** Its key may be offered: no side panel is open. */
  keys: boolean
  onBorn: (notice: ChatNoticeItem) => void
  onPutAway: (notice: ChatNoticeItem) => void
}

/** The task's record, its report's version (the one the record names) and its card on Knowledge. */
function useMadeRecord({ notice, projectId, identity }: Pick<Props, 'notice' | 'projectId' | 'identity'>) {
  const task = useQuery({
    queryKey: ['native-task', projectId, notice.taskId, 'notice', notice.resultRevision, identity.name],
    queryFn: () => getNativeTask(identity.token, projectId, notice.taskId),
  })
  const detail = task.data
  const artifactId = detail?.task.artifactId
  const versions = useQuery({
    queryKey: ['report-versions', artifactId, identity.name],
    queryFn: () => listArtifactVersions(identity.token, artifactId ?? ''),
    enabled: !!artifactId,
  }).data
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
  // A read that failed is said, with a way to try again: never an Open that waits for ever.
  const failed = task.isError && !detail
  return { detail, artifactId, version, card, outputs, failed, retry: () => void task.refetch() }
}

/** The Chat toggle of this stage, which holds the object's card: where the focus goes once the object is gone. */
const focusChatOf = (el: HTMLElement | null) =>
  el?.closest('.room-stage')?.querySelector<HTMLElement>('.panel-toggles [data-panel="chat"]')?.focus()

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
  useShortcuts({ o: open }, key)
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

/** The facts read from the record, then who asked; the limits marked. */
function MadeFacts({ facts, asked }: { facts: ReturnType<typeof factWords>; asked: string }) {
  return (
    <span className="made-facts">
      {facts.map((f) => (
        <span key={f.text} className="made-fact" data-limit={f.limit || undefined}>
          {f.text}
        </span>
      ))}
      <span className="made-asked">Asked by {asked}</span>
    </span>
  )
}

/** Its description, Sophia's unless a member edited it: then whose words they are comes first, as Knowledge says. */
function MadeSummary({ summary, by }: { summary: string; by: string | null }) {
  return (
    <p className="made-summary">
      {by && <span className="made-by">Edited by {by} · </span>}
      {summary}
    </p>
  )
}

/** Open, its key in the Studio's tip while the key works; once a read failed, Try again instead. */
function OpenButton({ ready, keyOn, onOpen }: { ready: boolean; keyOn: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="pill primary has-tip"
      onClick={onOpen}
      aria-disabled={!ready || undefined}
      aria-keyshortcuts={keyOn ? 'o' : undefined}
    >
      Open
      {keyOn && <Tip label="Open the report" keys="O" />}
    </button>
  )
}

function RetryRead({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <span className="made-failed" role="status">
        It couldn’t be read just now.
      </span>
      <button type="button" className="pill" onClick={onRetry}>
        Try again
      </button>
    </>
  )
}

export function StageMade(props: Props) {
  const { notice, nameOf, fresh, onBorn } = props
  const self = useRef<HTMLDivElement>(null)
  const record = useMadeRecord(props)
  const { detail, version, card, outputs } = record
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
      <span className="made-icon" aria-hidden="true">
        <Icon name="brief" />
      </span>
      <span className="made-head">
        <span className="made-title">{heading.title}</span>
        <span className="made-meta">{heading.meta}</span>
      </span>
      {card?.summary && (
        <MadeSummary summary={card.summary} by={card.summaryAuthorId ? nameOf(card.summaryAuthorId) : null} />
      )}
      {detail?.result && (
        <MadeFacts
          facts={factWords(madeFacts(detail.result.markdown, outputs, version))}
          asked={nameOf(detail.task.actorId)}
        />
      )}
      <span className="made-acts">
        {record.failed ? <RetryRead onRetry={record.retry} /> : <OpenButton ready={ready} keyOn={key} onOpen={open} />}
      </span>
      <button type="button" className="round made-close" aria-label="Close" onClick={close}>
        <Icon name="close" />
      </button>
    </div>
  )
}
