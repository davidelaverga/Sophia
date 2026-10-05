// What Sophia made, born in the room (docs/plans/room-made-object.md): a result's notice brings an object under her
// line, the report as Knowledge shows it (its title, its version, Sophia's description of it, who asked) with a few
// facts from its record, and Open and Close. The chat keeps its own card; this one is put away for this person once
// opened or closed. Until the task's record is read it says what the chat's card says, and Open waits.
import { useQuery } from '@tanstack/react-query'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
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

/** A name inside a sentence: "Asked by you", never "Asked by You". */
const inSentence = (name: string) => (name === 'You' ? 'you' : name)

/** The notice the stage shows, and putting it away: kept where the room lives (ProjectBody), past other views. */
export function useStageMade(notices: readonly ChatNoticeItem[]) {
  const [away, setAway] = useState<ReadonlySet<string>>(() => new Set())
  return {
    notice: madeOnStage(notices, away),
    putAway: (notice: ChatNoticeItem) => setAway((was) => new Set([...was, madeKey(notice)])),
  }
}

export type StageMadeState = ReturnType<typeof useStageMade>

/**
 * The object on the stage, or null: in the call, with Chat closed (its own card is there then), while a notice this
 * person hasn't put away is the newest. Keyed by the notice, so a revision is born again.
 */
export function madeOnTheStage(
  made: StageMadeState,
  room: Pick<ProjectRoom, 'status' | 'participants'>,
  chatOpen: boolean,
  context: { projectId: string; identity: Identity; who: RoomNames },
): ReactNode {
  const { notice } = made
  const inCall = room.status === 'live' || room.status === 'reconnecting'
  if (!notice || !inCall || chatOpen) return null
  const named = withMe(context.who, room.participants)
  return (
    <StageMade
      key={madeKey(notice)}
      notice={notice}
      projectId={context.projectId}
      identity={context.identity}
      askedBy={(actorId) => memberLabel(actorId, named)}
      onPutAway={() => made.putAway(notice)}
    />
  )
}

interface Props {
  notice: ChatNoticeItem
  projectId: string
  identity: Identity
  /** Who asked, named the chat's way (You, or theirs). */
  askedBy: (actorId: string) => string
  onPutAway: () => void
}

/** The task's record, its report's versions and its card on Knowledge, each read with this person's rights. */
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
  const card = useQuery({
    queryKey: ['report-card', projectId, artifactId, identity.name],
    queryFn: async () =>
      (await listReports(identity.token, { project: projectId })).reports.find((r) => r.artifactId === artifactId) ??
      null,
    enabled: !!artifactId,
  }).data
  const outputs = detail?.result?.outputs ?? []
  const version = versions?.find((v) => v.id === outputs[0]?.artifactVersionId) ?? versions?.[0]
  return { detail, artifactId, version, card, outputs }
}

/** The facts read from the record, then who asked; the limits marked. */
function MadeFacts({ facts, asked }: { facts: ReturnType<typeof factWords>; asked: string }) {
  return (
    <span className="made-facts">
      {facts.map((f) => (
        <span key={f.text} className="fact" data-limit={f.limit || undefined}>
          {f.text}
        </span>
      ))}
      <span className="made-asked">Asked by {asked}</span>
    </span>
  )
}

export function StageMade({ notice, projectId, identity, askedBy, onPutAway }: Props) {
  const viewer = useDocumentViewer()
  const { detail, artifactId, version, card, outputs } = useMadeRecord({ notice, projectId, identity })
  const { primary } = noticeActions(outputs)
  const ready = Boolean(viewer && artifactId && primary)
  const open = () => {
    if (!viewer || !artifactId || !primary) return
    viewer.open(noticeOpenRequest(artifactId, primary))
    onPutAway()
  }
  useShortcuts({ o: open })
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    onPutAway()
  }
  const heading = madeHeading(version, card?.title, noticeTitle(notice.taskKind))
  return (
    <div className="stage-made born" role="group" aria-label="Made by Sophia" onKeyDown={onKeyDown}>
      <span className="made-icon" aria-hidden="true">
        <Icon name="brief" />
      </span>
      <span className="made-head">
        <span className="made-title">{heading.title}</span>
        <span className="made-meta">{heading.meta}</span>
      </span>
      {card?.summary && <p className="made-summary">{card.summary}</p>}
      {detail?.result && (
        <MadeFacts
          facts={factWords(madeFacts(detail.result.markdown, outputs, version))}
          asked={inSentence(askedBy(detail.task.actorId))}
        />
      )}
      <span className="made-acts">
        <button type="button" className="pill primary" onClick={open} aria-disabled={!ready || undefined}>
          Open
          <kbd aria-hidden="true">O</kbd>
        </button>
      </span>
      <button type="button" className="round made-close" aria-label="Close" onClick={onPutAway}>
        <Icon name="close" />
      </button>
    </div>
  )
}
