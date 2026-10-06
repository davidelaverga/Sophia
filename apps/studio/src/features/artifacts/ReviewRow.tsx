// Approve a version, or ask for changes (docs/plans/room-review.md): the report pane's review row, for the version on
// screen, through the proposed A16 (issue #105). Mounted per version, so nothing of one version's review (its key, an
// open ask, its words) reaches another's. Editors and admins approve or ask for changes, and after one they may still
// do the other; every member sees the latest review. One key per press (useAdmission); with no reply, only that same
// press is offered again. A press being answered keeps its focus. Only under the vision flag.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ArtifactVersion } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { listReviews, reviewVersion, type ReviewAsk, type VersionReview } from '../../api/vision.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { byTime, reviewSettled } from './review-view.ts'
import { useFeedRefetch } from './useFeedRefetch.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { canInvite, useMembership } from '../access/useAccess.ts'

interface Props {
  projectId: string
  identity: Identity
  version: ArtifactVersion
  /** This is the report's newest version: a change asked for here is the one Sophia is working on. */
  newest: boolean
  /** Where the project's feed is: a review is a record, so its reviews are read again as the feed moves. */
  cursor: string | undefined
  /** The version is on screen, read and checked: nothing is reviewed before it is (Codex on #124). */
  readable: boolean
}

/** The latest review of a version, in words: who, and what they said; «revising» only while that can be true. */
export function reviewWords(review: VersionReview | undefined, me: string, newest: boolean): string {
  if (!review) return 'Not reviewed yet.'
  const who = review.by === me ? 'you' : 'a member'
  if (review.verdict === 'approved') return `Approved by ${who}.`
  const asked = `Changes requested by ${who}: “${review.note ?? ''}”.`
  return newest ? `${asked} Sophia is revising.` : asked
}

function useReviews(props: Props) {
  const { identity, version } = props
  const queryClient = useQueryClient()
  const read = useQuery({
    queryKey: ['vision', 'reviews', version.id, identity.name],
    queryFn: ({ signal }) => listReviews(identity.token, version.artifactId, version.id, signal),
    retry: 1,
  })
  useFeedRefetch(props.cursor, read.refetch)
  const write = useAdmission<ReviewAsk, VersionReview>((key, ask) =>
    reviewVersion(identity.token, version.artifactId, version.id, key, ask),
  )
  /** A review recorded: into every read of this version's reviews, once (the feed may bring it too). */
  const recorded = (done: VersionReview) =>
    queryClient.setQueriesData<{ reviews: readonly VersionReview[] }>(
      { queryKey: ['vision', 'reviews', version.id, identity.name] },
      (was) => ({ reviews: byTime(was?.reviews ?? [], done, (r) => r.reviewId) }),
    )
  const all = read.data?.reviews ?? []
  return { all, latest: all[0], read, write, recorded }
}

type WriteState = ReturnType<typeof useReviews>['write']['state']

/** The row's words: a press that didn't go through says so; else the latest review. */
function rowWords(state: WriteState, fallback: string): string {
  if (state.status === 'unknown') return 'Not sent. Try again.'
  if (state.status === 'rejected') return state.error instanceof ApiError ? state.error.message : fallback
  return fallback
}

export function ReviewRow(props: Props) {
  const me = useMembership(props.projectId, props.identity.name, props.identity.token).data
  const { all, latest, read, write, recorded } = useReviews(props)
  const [asking, setAsking] = useState(false)
  const [draft, setDraft] = useState('')
  const said = useRef<HTMLSpanElement>(null)
  const slow = useSlow(write.state.status === 'sending')
  const { settled, mark } = useSettling({ all, write, me: me?.actorId }, () => {
    // Recorded, as its reply would have said: the ask closes and its words go, so no second Send can follow.
    setAsking(false)
    setDraft('')
  })
  useEffect(() => {
    if (settled > 0) said.current?.focus()
  }, [settled])
  if (!me) return null
  if (!read.data) return <ReviewsPending failed={read.isError} onRetry={() => void read.refetch()} />
  const send = async (ask: ReviewAsk) => {
    mark()
    const done = await write.send(ask)
    if (!done) return
    recorded(done)
    setAsking(false)
    setDraft('')
    said.current?.focus() // the press went with what it did: the row's words are where the reader is
  }
  return (
    <div className="review-row" role="group" aria-label="Review">
      <span ref={said} className="review-said" role="status" tabIndex={-1}>
        {rowWords(write.state, reviewWords(latest, me.actorId, props.newest))}
      </span>
      {slow && (
        <p className="wait-note" role="status">
          {SLOW_NOTE}
        </p>
      )}
      {canInvite(me) && props.readable && (
        <ReviewActs
          {...{ latest, asking, draft, setDraft, send }}
          version={props.version.versionNumber}
          state={write.state}
          onAsk={setAsking}
        />
      )}
    </div>
  )
}

/** Before the first read: being read (with the slow note after a while), or failed, with Try again. */
function ReviewsPending({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const slow = useSlow(!failed)
  return (
    <div className="review-row" role="group" aria-label="Review">
      {failed ? (
        <>
          <span className="review-said" role="alert">
            Reviews can’t be read now.
          </span>
          <button type="button" className="text-button" onClick={onRetry}>
            Try again
          </button>
        </>
      ) : (
        <span className="review-said" role="status">
          Reading reviews…
        </span>
      )}
      {slow && (
        <p className="wait-note" role="status">
          {SLOW_NOTE}
        </p>
      )}
    </div>
  )
}

/**
 * A press settled by the feed, as its reply would have: with no reply, by its own record (any review of mine new since
 * the press began with its verdict and words, whenever it came); refused, by any review new since the refusal was
 * shown. Returns how many presses the feed has settled (to give the focus to the row's words) and `mark`, called as a
 * new press begins.
 */
function useSettling(
  {
    all,
    write,
    me,
  }: { all: readonly VersionReview[]; write: ReturnType<typeof useReviews>['write']; me: string | undefined },
  onRecorded: () => void,
) {
  const ids = () => new Set(all.map((r) => r.reviewId))
  const [before, setBefore] = useState<ReadonlySet<string>>(() => new Set())
  const [atRefusal, setAtRefusal] = useState<ReadonlySet<string> | null>(null)
  const [settled, setSettled] = useState(0)
  const { status } = write.state
  if (status === 'rejected' && !atRefusal) setAtRefusal(ids())
  if (status !== 'rejected' && atRefusal) setAtRefusal(null)
  const since = status === 'rejected' ? (atRefusal ?? ids()) : before
  if (
    (status === 'unknown' || status === 'rejected') &&
    reviewSettled(
      status,
      write.state.args,
      all.filter((r) => !since.has(r.reviewId)),
      me,
    )
  ) {
    write.reset()
    if (status === 'unknown') {
      onRecorded()
      setSettled(settled + 1)
    }
  }
  // A new intent snapshots what is there; Try again keeps its press's.
  const mark = () => {
    if (status !== 'unknown') setBefore(ids())
  }
  return { settled, mark }
}

interface ActsProps {
  latest: VersionReview | undefined
  version: number | undefined
  state: WriteState
  asking: boolean
  draft: string
  setDraft: (note: string) => void
  onAsk: (asking: boolean) => void
  send: (ask: ReviewAsk) => Promise<void>
}

/** The press that had no reply, and while it is tried again: Try again stays, keeping its focus, until answered. */
function useLostPress(state: WriteState): ReviewAsk | null {
  const lost = useRef<ReviewAsk | null>(null)
  if (state.status === 'unknown') lost.current = state.args
  else if (state.status !== 'sending') lost.current = null
  const trying = state.status === 'sending' && state.args === lost.current
  return state.status === 'unknown' || trying ? state.args : null
}

const approveLabel = (version: number | undefined) => (version ? `Approve v${String(version)}` : 'Approve')

/**
 * What an editor may do: approve, unless it is approved; ask for changes, unless they are asked for. With no reply,
 * only that press again, as it was sent (its words held), so a different intent never resends the old one.
 */
function ReviewActs(props: ActsProps) {
  const { latest, version, state, asking, draft, setDraft, onAsk, send } = props
  const ask = useRef<HTMLButtonElement>(null)
  const sending = state.status === 'sending'
  const again = useLostPress(state)
  if (again) {
    return (
      <button
        type="button"
        className="pill"
        aria-disabled={sending || undefined}
        onClick={() => !sending && void send(again)}
      >
        {sending ? 'Sending…' : 'Try again'}
      </button>
    )
  }
  if (asking) {
    return (
      <ChangesAsk
        draft={draft}
        sending={sending}
        onDraft={setDraft}
        onSend={(note) => void send({ verdict: 'changes_requested', note })}
        onCancel={() => {
          onAsk(false)
          requestAnimationFrame(() => ask.current?.focus())
        }}
      />
    )
  }
  const approve = () => !sending && void send({ verdict: 'approved' })
  return (
    <span className="review-acts">
      {latest?.verdict !== 'approved' && (
        <button type="button" className="pill" aria-disabled={sending || undefined} onClick={approve}>
          {sending && state.args.verdict === 'approved' ? 'Approving…' : approveLabel(version)}
        </button>
      )}
      {latest?.verdict !== 'changes_requested' && (
        <button ref={ask} type="button" className="text-button" onClick={() => onAsk(true)}>
          Request changes
        </button>
      )}
    </span>
  )
}

interface AskProps {
  draft: string
  sending: boolean
  onDraft: (note: string) => void
  onSend: (note: string) => void
  onCancel: () => void
}

/** «What should change?»: words first, then Send; Cancel keeps the words for the next ask. */
function ChangesAsk({ draft, sending, onDraft, onSend, onCancel }: AskProps) {
  const [empty, setEmpty] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => field.current?.focus(), [])
  const send = () => {
    if (sending) return
    if (draft.trim() === '') setEmpty(true)
    else onSend(draft.trim())
  }
  return (
    <span className="review-ask">
      <textarea
        ref={field}
        className="review-note"
        aria-label="What should change?"
        aria-describedby={empty ? 'review-empty' : undefined}
        placeholder="What should change?"
        rows={2}
        maxLength={2000}
        value={draft}
        readOnly={sending}
        onChange={(e) => {
          setEmpty(false)
          onDraft(e.target.value)
        }}
      />
      {empty && (
        <span id="review-empty" className="review-empty" role="alert">
          Say what should change first.
        </span>
      )}
      <span className="review-acts">
        <button type="button" className="pill" aria-disabled={sending || undefined} onClick={send}>
          {sending ? 'Sending…' : 'Send'}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </span>
    </span>
  )
}
