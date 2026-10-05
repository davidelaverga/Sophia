// What the meeting left, on leaving (docs/plans/room-recap.md): leaving a call by one's own press, from the project
// (the dock, the mini dock, a sheet's call row), opens «This meeting», the A12 recap proposed in issue #105, built from
// committed records only. Copy recap puts it on the clipboard; an editor or admin closes the meeting for everyone, once
// per key (useAdmission). Shown only under the vision flag, where the fixture pages answer.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Membership, Snapshot } from '@sophia/contracts'
import { useAdmission } from '../../api/useAdmission.ts'
import { closeMeeting, getRecap, listMeetings, type MeetingRecap, type MeetingReceipt } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { canInvite } from '../access/useAccess.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { useCopy } from '../resources/copy.ts'
import { useKnownNames } from '../studio/StudioShell.tsx'
import { recapHead, recapSections, recapText, type NameOf, type RecapSection } from './recap-view.ts'
import type { ProjectRoom } from './useProjectRoom.ts'

/**
 * Which leave the recap is for: the room's count of calls left by the person's own press (a drop, another tab, being
 * taken out or another project's call never count), until it is put away.
 */
export function useLeftCall(room: Pick<ProjectRoom, 'leftByPress'>) {
  const [seen, setSeen] = useState(room.leftByPress)
  const [left, setLeft] = useState<number | null>(null)
  if (seen !== room.leftByPress) {
    setSeen(room.leftByPress)
    setLeft(room.leftByPress)
  }
  return { left, dismiss: () => setLeft(null) }
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
  identity: Identity
  roomId: string
  title: string
  me: string
  editor: boolean
  names: ReadonlyMap<string, string>
  onClose: () => void
}

const recapKey = (projectId: string) => ['vision', 'recap', projectId] as const

/**
 * The latest meeting's recap: the list says which meeting, its recap says what it left. Kept only while shown, so the
 * next leave reads its own and never shows the last one meanwhile.
 */
function useLatestRecap(projectId: string, token: string) {
  return useQuery({
    queryKey: recapKey(projectId),
    queryFn: async () => {
      const latest = (await listMeetings(token, projectId, 1)).meetings[0]
      return latest ? getRecap(token, projectId, latest.id) : null
    },
    gcTime: 0,
    retry: false,
  })
}

function RecapSheet({ projectId, identity, roomId, title, me, editor, names, onClose }: SheetProps) {
  const recap = useLatestRecap(projectId, identity.token)
  // In the sheet, the reader is "you"; in the copied text, which others read, the reader goes by their name.
  const shown: NameOf = (id) => (id === me ? 'you' : (names.get(id) ?? 'a member'))
  const copied: NameOf = (id) => names.get(id) ?? 'a member'
  const close = { projectId, identity, roomId }
  return (
    <Sheet id="recap-title" title="This meeting" onClose={onClose} returnTo={callAnchor}>
      {recap.isPending && <p className="sheet-lead">Putting the meeting together…</p>}
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
          text={recapText(title, recap.data, copied)}
          names={shown}
          editor={editor}
          close={close}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

/** Out of the call, the focus goes back to Join (the call's anchor on screen), since Leave is gone. */
const callAnchor = () =>
  [...document.querySelectorAll<HTMLElement>('[data-call-anchor]')].find((el) => el.offsetParent !== null) ?? null

type CloseTarget = { projectId: string; identity: Identity; roomId: string }

interface BodyProps {
  recap: MeetingRecap
  /** The recap as plain text, for the clipboard. */
  text: string
  names: NameOf
  editor: boolean
  close: CloseTarget
  onClose: () => void
}

function RecapBody({ recap, text, names, editor, close, onClose }: BodyProps) {
  const sections = recapSections(recap, names)
  const copy = useCopy(() => text)
  const fallback = useFallback(copy.state === 'failed')
  const closing = useCloseMeeting(close, recap.meetingId)
  const closed = recap.endedAt !== null || closing.state.status === 'done'
  return (
    <div className="recap">
      <p className="recap-head">{recapHead(recap)}</p>
      {sections.length === 0 && <p className="sheet-lead">Nothing was decided, made or kept in this meeting.</p>}
      {sections.map((s) => (
        <RecapPart key={s.title} section={s} recap={recap} onOpen={onClose} />
      ))}
      <div className="recap-acts">
        <button type="button" className="pill" onClick={copy.copy}>
          Copy recap
        </button>
        {editor && !closed && (
          <button
            type="button"
            className="pill"
            disabled={closing.state.status === 'sending'}
            onClick={() => void closing.send(undefined)}
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
      void queryClient.invalidateQueries({ queryKey: recapKey(close.projectId) })
    }
  })
}

const sectionId = (title: string) => `recap-${title.toLowerCase().replace(' ', '-')}`

/**
 * One section; what Sophia made opens in the viewer, and the sheet goes away for it. The focus goes to Join first, so
 * the viewer gives it back there when it closes: the Open pressed is gone by then.
 */
function RecapPart({ section, recap, onOpen }: { section: RecapSection; recap: MeetingRecap; onOpen: () => void }) {
  const viewer = useDocumentViewer()
  const id = sectionId(section.title)
  const madeOf = (key: string) =>
    section.title === 'Made' ? recap.made.find((m) => m.artifactVersionId === key) : undefined
  return (
    <section className="recap-section" aria-labelledby={id}>
      <h3 id={id}>{section.title}</h3>
      <ul>
        {section.lines.map((line) => {
          const made = viewer ? madeOf(line.key) : undefined
          return (
            <li key={line.key}>
              <span className="recap-line">{line.text}</span>
              <span className="recap-by">{line.by}</span>
              {made && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    callAnchor()?.focus()
                    onOpen()
                    viewer?.open({ artifactId: made.artifactId, versionId: made.artifactVersionId })
                  }}
                >
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
