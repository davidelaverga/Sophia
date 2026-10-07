// «After the meeting» (docs/plans/room-return.md, Davide's chapter 5): under a closed meeting's recap, what its work
// made later, each with its time and a way to it. Read from its own route (a proposed A12 refinement), so the recap,
// the record at close, never changes. Only under the vision flag.
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { getAfter, type AfterUpdate } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { closeEveryDialog } from '../../app/useDialog.ts'
import { useDocumentViewer } from '../artifacts/DocumentViewer.tsx'
import { afterLine, pollAfter } from './recap-view.ts'
import { clock, sameDay, when } from '../../app/time-words.ts'

interface Props {
  projectId: string
  identity: Identity
  meetingId: string
  /** When the meeting closed: only what came after it is shown here, and its day is said when it differs. */
  endedAt: string
  /** The tasks still running at close: until something comes, the section says the work goes on. */
  running: readonly string[]
  /** Where the focus goes as the sheet gives way to a report. */
  anchor: () => HTMLElement | null
  onOpen: () => void
}

/** When it came: its time, and its day too when that isn't the meeting's (app/time-words.ts). */
const whenOf = (at: string, endedAt: string) => (sameDay(at, endedAt) ? clock(at) : when(at, Date.now()))

export function AfterMeeting({ projectId, identity, meetingId, endedAt, running, anchor, onOpen }: Props) {
  const id = useId()
  const [opened] = useState(() => Date.now())
  // Every task running at close, as the sheet opened on it: the first to finish leaves the others waited for.
  const [waited] = useState(running)
  const viewer = useDocumentViewer()
  const after = useQuery({
    queryKey: ['vision', 'after', projectId, identity.name, meetingId],
    queryFn: ({ signal }) => getAfter(identity.token, projectId, meetingId, signal),
    gcTime: 0,
    retry: 1,
    // While any of its work goes on, read again now and then (for ten minutes at most): the sheet may stay open as it
    // finishes, one task after another (Codex on #130).
    refetchInterval: (query) =>
      pollAfter(waited, query.state.data?.updates ?? [], endedAt, Date.now() - opened) ? 4000 : false,
  })
  // The boundary, kept here too: nothing from before the close is «after» it.
  const updates = (after.data?.updates ?? []).filter((u) => Date.parse(u.at) >= Date.parse(endedAt))
  // Only where there is something to say: work went on after the close, or something came of it.
  if (waited.length === 0 && updates.length === 0) return null
  const open = (u: AfterUpdate) => {
    if (!u.artifactId || !u.artifactVersionId) return
    anchor()?.focus()
    onOpen()
    closeEveryDialog()
    viewer?.open({ artifactId: u.artifactId, versionId: u.artifactVersionId })
  }
  return (
    <section className="recap-section recap-after" aria-labelledby={id}>
      <h3 id={id}>After the meeting</h3>
      {after.isPending && <p className="recap-by">Reading what came after…</p>}
      {after.isError && (
        <p className="recap-by" role="alert">
          What came after can’t be read now.{' '}
          <button type="button" className="text-button" onClick={() => void after.refetch()}>
            Try again
          </button>
        </p>
      )}
      {after.isSuccess && updates.length === 0 && (
        <p className="recap-by">Nothing yet. The work goes on after the meeting.</p>
      )}
      {updates.length > 0 && (
        <ul>
          {updates.map((u) => (
            <li key={`${u.at} ${u.kind} ${u.artifactVersionId ?? u.taskId ?? ''}`}>
              <span className="recap-line">{`${whenOf(u.at, endedAt)} · ${afterLine(u)}`}</span>
              {viewer && u.artifactId && u.artifactVersionId && (
                <button type="button" className="text-button" onClick={() => open(u)}>
                  Open
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
