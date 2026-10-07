// The source-review pilot's entry under a goal (WBC-02 G5): Review sources. It offers what Sophia says may be reviewed
// (one to three report versions, at most 32 KiB of text in all), an allowance within the project's cap, and an
// optional purpose; proposing starts nothing: Sophia answers with a plan and a decision on the board, which the
// proposer takes there. Shown only where Sophia has enrolled the project; nothing is said where it hasn't.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Goal, SourceReviewAvailability, SourceReviewProposalRequest } from '@sophia/contracts'
import { proposeReview, reviewAvailability } from '../../../api/work.ts'
import { ApiError } from '../../../api/client.ts'
import type { Identity } from '../../../app/dev-identity.ts'
import { kib, selectionOf } from './review-sources.ts'

interface Props {
  projectId: string
  identity: Identity
  goal: Goal
  /** The proposal is recorded: the board shows its decision. */
  onProposed: () => void
}

/** The allowance a review starts from: half a dollar, or the cap when it is lower. */
const startingAllowance = (a: SourceReviewAvailability) => Math.min(0.5, a.maxAllowanceUsd ?? 0.5)

type Sent =
  | { state: 'idle' }
  | { state: 'sending'; key: string }
  | { state: 'proposed' }
  | { state: 'refused'; said: string; key?: string }

/** What a failed proposal says; a reply that never came keeps its key, so asking again is the same proposal. */
function refusalOf(err: unknown, key: string): Sent {
  if (err instanceof ApiError && err.status > 0 && err.status < 500) return { state: 'refused', said: err.message }
  return { state: 'refused', said: 'No reply from Sophia. Propose again to check; it is the same proposal.', key }
}

function choose(chosen: readonly string[], id: string, max: number): string[] {
  if (chosen.includes(id)) return chosen.filter((c) => c !== id)
  return chosen.length < max ? [...chosen, id] : [...chosen]
}

interface FormProps extends Props {
  availability: SourceReviewAvailability
  onClose: () => void
}

/** The proposal, sent once per press, its key kept for a press after no reply (the same proposal again). */
function useProposal({ projectId, identity, goal, onProposed }: Props) {
  const [sent, setSent] = useState<Sent>({ state: 'idle' })
  const propose = async (body: Omit<SourceReviewProposalRequest, 'goalId' | 'goalRevision'>) => {
    const key = sent.state === 'refused' && sent.key ? sent.key : crypto.randomUUID()
    setSent({ state: 'sending', key })
    try {
      await proposeReview(identity.token, projectId, key, { goalId: goal.id, goalRevision: goal.revision, ...body })
      setSent({ state: 'proposed' })
      onProposed()
    } catch (err: unknown) {
      setSent(refusalOf(err, key))
    }
  }
  return { sent, propose }
}

function SourcesField({
  availability,
  chosen,
  onChoose,
}: {
  availability: SourceReviewAvailability
  chosen: readonly string[]
  onChoose: (id: string) => void
}) {
  return (
    <fieldset>
      <legend className="field-label">Sources to review (up to {availability.limits.maxSources})</legend>
      {availability.sources.length === 0 && <p className="view-note">No report version can be reviewed yet.</p>}
      {availability.sources.map((s) => (
        <label key={s.sourceId} className="review-source">
          <input type="checkbox" checked={chosen.includes(s.sourceId)} onChange={() => onChoose(s.sourceId)} />
          <span>{s.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

function TextField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="field">{children}</div>
    </>
  )
}

/** The chosen sources hold more text than a review reads: said where they are chosen, before anything is proposed. */
function TooMuch({ bytes, over, limit }: { bytes: number; over: boolean; limit: number }) {
  if (!over) return null
  return (
    <p className="form-error" role="status">
      These sources hold {kib(bytes)} of text; a review reads at most {kib(limit)}. Choose fewer or shorter sources.
    </p>
  )
}

/** What the reviewer may do, said before anything is proposed. */
function Bounds({ availability }: { availability: SourceReviewAvailability }) {
  return (
    <p className="view-note">
      Sophia's source reviewer reads only these sources, makes at most {availability.limits.maxModelRequests} model
      requests, and never searches the web. A finished review accepts nothing.
      {!availability.runtimeReady && ' No runtime carries the reviewer right now; the review starts when one does.'}
    </p>
  )
}

function ReviewForm(props: FormProps) {
  const { goal, availability, onClose } = props
  const [chosen, setChosen] = useState<string[]>([])
  const [allowance, setAllowance] = useState(() => startingAllowance(availability))
  const [purpose, setPurpose] = useState('')
  const { sent, propose } = useProposal(props)
  const max = availability.maxAllowanceUsd ?? 0
  const selection = selectionOf(availability.sources, chosen, availability.limits.maxInputBytes)
  const valid = chosen.length > 0 && !selection.over && allowance > 0 && allowance <= max
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void propose({ sourceIds: chosen, allowanceUsd: allowance, ...(purpose.trim() ? { purpose: purpose.trim() } : {}) })
  }
  if (sent.state === 'proposed') return <Proposed onClose={onClose} />
  return (
    <form className="sheet-form review-sources" onSubmit={submit} aria-label="Review sources">
      <SourcesField
        availability={availability}
        chosen={chosen}
        onChoose={(id) => setChosen(choose(chosen, id, availability.limits.maxSources))}
      />
      <TooMuch bytes={selection.bytes} over={selection.over} limit={availability.limits.maxInputBytes} />
      <TextField id={`review-allowance-${goal.id}`} label={`Allowance, USD (at most ${String(max)})`}>
        <input
          id={`review-allowance-${goal.id}`}
          type="number"
          min={0.01}
          max={max}
          step={0.01}
          value={allowance}
          aria-invalid={allowance > max || allowance <= 0}
          onChange={(e) => setAllowance(Number(e.target.value))}
        />
      </TextField>
      <TextField id={`review-purpose-${goal.id}`} label="Purpose (optional)">
        <input
          id={`review-purpose-${goal.id}`}
          maxLength={300}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </TextField>
      <Bounds availability={availability} />
      <div className="control-row">
        <button type="submit" className="pill primary" disabled={!valid || sent.state === 'sending'}>
          {sent.state === 'sending' ? 'Proposing…' : 'Propose review'}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
      {sent.state === 'refused' && (
        <p className="form-error" role="alert">
          {sent.said}
        </p>
      )}
    </form>
  )
}

function Proposed({ onClose }: { onClose: () => void }) {
  return (
    <p className="view-note" role="status">
      Proposed. Start it from its decision on the board; nothing runs until you do.{' '}
      <button type="button" className="text-button" onClick={onClose}>
        Close
      </button>
    </p>
  )
}

/** Review sources, under a goal, where Sophia offers it to the viewer. */
export function ReviewSources(props: Props) {
  const [open, setOpen] = useState(false)
  const availability = useQuery({
    queryKey: ['review-availability', props.projectId, props.identity.name],
    queryFn: ({ signal }) => reviewAvailability(props.identity.token, props.projectId, signal),
    staleTime: 30_000,
    retry: false,
  })
  const a = availability.data
  if (!a?.enabled) return null
  if (!open) {
    return (
      <button type="button" className="ghost review-sources-open" onClick={() => setOpen(true)}>
        Review sources
      </button>
    )
  }
  return <ReviewForm {...props} availability={a} onClose={() => setOpen(false)} />
}
