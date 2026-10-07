// What the meeting left, on leaving (docs/plans/room-recap.md): leaving a call by one's own press, from the project
// (the dock, the mini dock, a sheet's call row), opens «This meeting», the A12 recap proposed in issue #105, built from
// committed records only. Copy recap puts it on the clipboard; an editor or admin closes the meeting for everyone, once
// per key (useAdmission). Shown only under the vision flag, where the fixture pages answer.
import { AfterMeeting } from './AfterMeeting.tsx'
import {
  leaveRecap,
  namers,
  ongoing,
  recapHead,
  recapping,
  recapSections,
  recapText,
  type LeaveRecap,
  type RecapSection,
  type Recapping,
  type Records,
  type Sheets,
} from './recap-view.ts'
import { VISION } from '../../app/vision.ts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { Membership, Snapshot } from '@sophia/contracts'
import { useAdmission } from '../../api/useAdmission.ts'
import { closeMeeting, getRecap, listMeetings, type MeetingRecap, type MeetingReceipt } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { closeEveryDialog } from '../../app/useDialog.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { canInvite } from '../access/useAccess.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { useCopy } from '../resources/copy.ts'
import { useKnownNames } from '../studio/useKnownNames.ts'
import type { ProjectRoom } from './useProjectRoom.ts'

/**
 * Which leave the recap is for: the room's count of calls left by the person's own press (a drop, another tab, being
 * taken out or another project's call never count), until it is put away.
 */
export function useLeftCall(room: Pick<ProjectRoom, 'leftByPress'>) {
  const [seen, setSeen] = useState(room.leftByPress)
  const [recap, setRecap] = useState<LeaveRecap>({ left: null, waiting: null })
  // Left from the running meeting's own sheet (from Updates or Search), nothing opens: the person reads it already. A
  // sheet that can't tell yet makes the leave's recap wait until it can, or closes (Codex on #138).
  const sheets = useSyncExternalStore(watchSheets, sheetsNow)
  const leave = seen === room.leftByPress ? undefined : room.leftByPress
  if (leave !== undefined) setSeen(leave)
  const next = leaveRecap(recap, sheets, leave)
  if (next.left !== recap.left || next.waiting !== recap.waiting) setRecap(next)
  return { left: next.left, dismiss: () => setRecap((r) => ({ ...r, left: null })) }
}

interface Props {
  projectId: string
  identity: Identity
  room: ProjectRoom
  snapshot: Snapshot | undefined
  membership: Membership | undefined
}

/** The recap's sheet, opened on leaving. */
export function MeetingRecapOnLeave({ room, snapshot, membership, ...rest }: Props) {
  const { left, dismiss } = useLeftCall(room)
  const names = useKnownNames(room)
  if (left === null || !snapshot) return null
  return (
    <RecapSheet
      key={left}
      leave={left}
      {...rest}
      roomId={snapshot.room.id}
      title={snapshot.title}
      me={membership?.actorId ?? ''}
      editor={canInvite(membership)}
      names={names}
      onClose={dismiss}
    />
  )
}

interface SheetProps {
  projectId: string
  /** The meeting to recap (a row in Updates); the latest one when absent (on leaving). */
  meetingId?: string
  /** On leaving, which leave this is: each reads its own recap, never one an earlier leave is still waiting for. */
  leave?: number
  /**
   * Whether the meeting runs, as the opener knows it (Updates' list, Search's read); until its recap is read, this says
   * it. Undefined: the opener can't tell (yet).
   */
  running?: boolean | undefined
  identity: Identity
  roomId: string
  title: string
  me: string
  editor: boolean
  names: ReadonlyMap<string, string>
  onClose: () => void
}

/**
 * The sheets recapping a meeting now (recap-view's Sheets), told once a commit's effects have all run, so a sheet that
 * finds out is never seen as neither.
 */
let sheets: Sheets = { running: 0, unknown: 0 }
const watchers = new Set<() => void>()
let telling = false
function countSheet(which: Recapping, by: 1 | -1) {
  if (which === 'past') return
  sheets = { ...sheets, [which]: sheets[which] + by }
  if (telling) return
  telling = true
  queueMicrotask(() => {
    telling = false
    for (const watcher of watchers) watcher()
  })
}
const watchSheets = (watcher: () => void) => {
  watchers.add(watcher)
  return () => {
    watchers.delete(watcher)
  }
}
const sheetsNow = () => sheets

/** Every recap read of a project starts with this key: closing a meeting reads them all again. */
const recapKey = (projectId: string) => ['vision', 'recap', projectId] as const

/**
 * A meeting's recap, or the latest one's (the list says which meeting). Kept only while shown, and keyed by the leave,
 * so the next leave reads its own, even while an earlier leave's read still waits.
 */
function useRecap(projectId: string, token: string, which: { meetingId?: string; leave?: number }) {
  const { meetingId, leave } = which
  return useQuery({
    queryKey: [...recapKey(projectId), meetingId ?? `latest:${String(leave ?? 0)}`],
    queryFn: async () => {
      const id = meetingId ?? (await listMeetings(token, projectId, 1)).meetings[0]?.id
      return id ? getRecap(token, projectId, id) : null
    },
    gcTime: 0,
    retry: false,
  })
}

/** «This meeting»: a meeting's recap in a sheet, on leaving or from Updates. */
export function RecapSheet(props: SheetProps) {
  const { projectId, identity, roomId, title, me, editor, names, onClose } = props
  const recap = useRecap(projectId, identity.token, props)
  const close = { projectId, identity, roomId }
  const titleId = useId()
  // Leaving from the running meeting's sheet opens no second; from a past one's, the recap of the call left; and while
  // it can't tell yet, that recap waits until it can (Codex on #130 and #138).
  const which = recapping({ latest: props.meetingId === undefined, read: recap.data, running: props.running })
  useEffect(() => {
    countSheet(which, 1)
    return () => countSheet(which, -1)
  }, [which])
  return (
    <Sheet id={titleId} title="This meeting" onClose={onClose} returnTo={callAnchor}>
      <Waiting words="Putting the meeting together…" waiting={recap.isPending} />
      {recap.isError && recap.data === undefined && (
        <p className="sheet-lead" role="alert">
          The recap couldn’t be read.{' '}
          <button type="button" className="text-button" onClick={() => void recap.refetch()}>
            Try again
          </button>
        </p>
      )}
      {recap.isError && recap.data !== undefined && <p className="sheet-lead">This recap may be out of date.</p>}
      {recap.data === null && <p className="sheet-lead">There is no meeting to recap.</p>}
      {recap.data && (
        <RecapBody
          recap={recap.data}
          title={title}
          names={namers(me, names, recap.data.names)}
          editor={editor}
          close={close}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

/** Where the focus goes when what opened a sheet is gone: the call's anchor on screen (Join out of the call). */
export const callAnchor = () =>
  [...document.querySelectorAll<HTMLElement>('[data-call-anchor]')].find((el) => el.offsetParent !== null) ?? null

type CloseTarget = { projectId: string; identity: Identity; roomId: string }

interface BodyProps {
  recap: MeetingRecap
  title: string
  names: ReturnType<typeof namers>
  editor: boolean
  close: CloseTarget
  onClose: () => void
}

function RecapBody({ recap, title, names, editor, close, onClose }: BodyProps) {
  const sections = recapSections(recap, names.shown, recap.endedAt !== null)
  const text = recapText(title, recap, names.copied)
  const copy = useCopy(() => text)
  const fallback = useFallback(copy.state === 'failed')
  const closing = useCloseMeeting(close, recap.meetingId)
  const closed = recap.endedAt !== null || closing.state.status === 'done'
  return (
    <div className="recap">
      <p className="recap-head">{recapHead(recap)}</p>
      {sections.length === 0 && <p className="sheet-lead">Nothing was decided, made or kept in this meeting.</p>}
      {sections.map((s) => (
        <RecapPart key={s.title} section={s} records={recap} onOpen={onClose} />
      ))}
      {VISION && recap.endedAt !== null && (
        <AfterMeeting
          projectId={close.projectId}
          identity={close.identity}
          meetingId={recap.meetingId}
          endedAt={recap.endedAt}
          running={recap.work.filter((w) => ongoing(w.state)).map((w) => w.taskId)}
          anchor={callAnchor}
          onOpen={onClose}
        />
      )}
      <div className="recap-acts">
        <button type="button" className="pill" onClick={copy.copy}>
          Copy recap
        </button>
        {editor && !closed && (
          <button
            type="button"
            className="pill"
            aria-disabled={closing.state.status === 'sending' || undefined}
            onClick={() => closing.state.status !== 'sending' && void closing.send(undefined)}
          >
            {closing.state.status === 'unknown' ? 'Try closing again' : 'Close the meeting'}
          </button>
        )}
        <span className="recap-said" role="status">
          {saidOf(copy.state, closing.state, closed)}
        </span>
      </div>
      {fallback.shown && (
        <textarea
          ref={fallback.field}
          className="recap-text"
          readOnly
          value={text}
          aria-label="The recap, to copy"
          rows={6}
        />
      )}
    </div>
  )
}

/**
 * Once a copy was refused, the recap stays in a field to copy by hand until the sheet goes away, selected the first
 * time it shows: the words that pointed to it fade, the text doesn't.
 */
function useFallback(failed: boolean) {
  const [shown, setShown] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  if (failed && !shown) setShown(true)
  useEffect(() => {
    if (!shown) return
    field.current?.focus()
    field.current?.select()
  }, [shown])
  return { shown, field }
}

/** What the sheet says after a press: the copy's outcome for a moment, else the close's. */
function saidOf(
  copy: ReturnType<typeof useCopy>['state'],
  closing: ReturnType<typeof useCloseMeeting>['state'],
  closed: boolean,
): string {
  if (copy === 'copied') return 'Recap copied.'
  if (copy === 'failed') return 'Couldn’t copy. Select the text below instead.'
  if (closing.status === 'done') return 'Closed. Everyone’s recap is this one.'
  if (closed) return 'This meeting is closed.'
  if (closing.status === 'sending') return 'Closing…'
  if (closing.status === 'unknown') return 'Not confirmed.'
  if (closing.status === 'rejected') return closing.error.message
  return ''
}

/** Close the meeting for everyone (A12), one key per intent; closed, the recap is read again as final. */
function useCloseMeeting(close: CloseTarget, meetingId: string) {
  const queryClient = useQueryClient()
  return useAdmission<undefined, MeetingReceipt>(async (key) => {
    try {
      return await closeMeeting(close.identity.token, close.roomId, meetingId, key)
    } finally {
      // Updates' list and digest move with the feed: the close is a record, and its receipt names the cursor.
      void queryClient.invalidateQueries({ queryKey: recapKey(close.projectId) })
    }
  })
}

interface PartProps {
  section: RecapSection
  records: Records
  /** From a sheet: it goes away for what Open opens. */
  onOpen?: () => void
  /** Its heading's level: 3 in the sheet, 4 under Updates' own headings. */
  level?: 3 | 4
}

/**
 * One section of a recap or a digest. What Sophia made opens in the viewer. From a sheet (`onOpen`), the sheet goes
 * away for it, and the focus goes to Join first, so the viewer gives it back there: the Open pressed is gone by then.
 */
export function RecapPart({ section, records, onOpen, level = 3 }: PartProps) {
  const viewer = useDocumentViewer()
  const id = useId()
  const Heading = level === 3 ? 'h3' : 'h4'
  const madeOf = (key: string) =>
    section.title === 'Made' ? records.made.find((m) => m.artifactVersionId === key) : undefined
  const open = (made: Records['made'][number]) => {
    if (onOpen) {
      callAnchor()?.focus()
      onOpen()
      // Opened on leaving from another sheet's call row (Invite, a task): that one goes too, or the report sits under it.
      closeEveryDialog()
    }
    viewer?.open({ artifactId: made.artifactId, versionId: made.artifactVersionId })
  }
  return (
    <section className="recap-section" aria-labelledby={id}>
      <Heading id={id}>{section.title}</Heading>
      <ul>
        {section.lines.map((line) => {
          const made = viewer ? madeOf(line.key) : undefined
          return (
            <li key={line.key}>
              <span className="recap-line">{line.text}</span>
              <span className="recap-by">{line.by}</span>
              {made && (
                <button type="button" className="text-button" onClick={() => open(made)}>
                  Open
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
