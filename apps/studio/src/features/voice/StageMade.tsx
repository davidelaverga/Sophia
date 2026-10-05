// What Sophia made, born in the room (docs/plans/room-made-object.md): a result's notice brings an object under her
// line, the report as Knowledge shows it (its title, its version, its description and whose words those are, who
// asked) with a few facts from its record, and Open and Close. The chat keeps its own card; this one is put away for
// this person once opened (here or anywhere) or closed. Until the task's record is read it says what the chat's card
// says, and Open waits.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '@sophia/ui'
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

/** Where the focus goes once the object is gone: the Chat toggle, which holds its card. */
const focusChat = () => document.querySelector<HTMLElement>('.stage-corner .panel-toggles button')?.focus()

/** One key per notice in a set, kept as it grows. */
function useKeys() {
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set())
  const add = (notice: ChatNoticeItem) =>
    setKeys((was) => (was.has(madeKey(notice)) ? was : new Set([...was, madeKey(notice)])))
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
 * person hasn't put away is the newest. Keyed by the notice, so a revision is born again. Its key (O) works only while
 * no panel covers anything.
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
      onBorn={() => made.wasBorn(notice)}
      onPutAway={() => made.putAway(notice)}
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
  /** Its key may act: nothing covers the room. */
  keys: boolean
  onBorn: () => void
  onPutAway: () => void
}

/** The task's record, its report's version (the one the record names) and its card on Knowledge. */
function useMadeRecord({ notice, projectId, identity }: Pick<Props, 'notice' | 'projectId' | 'identity'>) {
  const detail = useQuery({
    queryKey: ['native-task', projectId, notice.taskId, 'notice', notice.resultRevision, identity.name],
    queryFn: () => getNativeTask(identity.token, projectId, notice.taskId),
  }).data
  const artifactId = detail?.task.artifactId
  const versions = useQuery({
    queryKey: ['report-versions', artifactId, identity.name],
    queryFn: () => listArtifactVersions(identity.token, artifactId ?? ''),
    enabled: !!artifactId,
  }).data
  // Knowledge's first page holds a report just made (newest first); read again at most every half minute.
  const card = useQuery({
    queryKey: ['report-card', projectId, artifactId, identity.name],
    queryFn: async () =>
      (await listReports(identity.token, { project: projectId })).reports.find((r) => r.artifactId === artifactId) ??
      null,
    enabled: !!artifactId,
    staleTime: 30_000,
  }).data
  const outputs = detail?.result?.outputs ?? []
  // Only the version the record names: a list cached before a revision would show the older one.
  const version = versions?.find((v) => v.id === outputs[0]?.artifactVersionId)
  return { detail, artifactId, version, card, outputs }
}

/** Open, Close and their keys: Open shows the report in the viewer; either puts the object away. */
function useMadeActions(props: Props, artifactId: string | undefined, outputs: Parameters<typeof noticeActions>[0]) {
  const { keys, onPutAway } = props
  const viewer = useDocumentViewer()
  const { primary } = noticeActions(outputs)
  const ready = Boolean(viewer && artifactId && primary)
  const shownElsewhere = !!artifactId && viewer?.shown === artifactId
  // Opened elsewhere (the chat's card, Knowledge): it is read, so it goes from the stage too.
  useEffect(() => {
    if (shownElsewhere) onPutAway()
  }, [shownElsewhere, onPutAway])
  const close = () => {
    focusChat()
    onPutAway()
  }
  const open = () => {
    if (!viewer || !artifactId || !primary) return
    focusChat() // what the viewer gives the focus back to when it closes
    viewer.open(noticeOpenRequest(artifactId, primary))
    onPutAway()
  }
  useShortcuts({ o: open }, keys && ready && !viewer?.shown)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    close()
  }
  return { ready, open, close, onKeyDown }
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

export function StageMade(props: Props) {
  const { notice, nameOf, fresh, onBorn } = props
  const { detail, artifactId, version, card, outputs } = useMadeRecord(props)
  const { ready, open, close, onKeyDown } = useMadeActions(props, artifactId, outputs)
  const [born] = useState(fresh)
  useEffect(() => onBorn(), [onBorn])
  const heading = madeHeading(version, card?.title, noticeTitle(notice.taskKind))
  return (
    <div className={`stage-made${born ? ' born' : ''}`} role="group" aria-label="Made by Sophia" onKeyDown={onKeyDown}>
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
        <button
          type="button"
          className="pill primary"
          onClick={open}
          aria-disabled={!ready || undefined}
          aria-keyshortcuts="o"
        >
          Open
          <kbd aria-hidden="true">O</kbd>
        </button>
      </span>
      <button type="button" className="round made-close" aria-label="Close" onClick={close}>
        <Icon name="close" />
      </button>
    </div>
  )
}
