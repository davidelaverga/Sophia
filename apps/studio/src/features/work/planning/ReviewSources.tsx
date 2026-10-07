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
import { ALLOWANCE_STEP, allowanceOk, kib, selectionOf } from './review-sources.ts'

interface Props {
  projectId: string
  identity: Identity
  goal: Goal
  /** The proposal is recorded: the board shows its decision. */
  onProposed: () => void
}

/** The allowance a review starts from: half a dollar, or the cap when it is lower. */
const startingAllowance = (a: SourceReviewAvailability) => Math.min(0.5, a.maxAllowanceUsd ?? 0.5)

/** One proposal as sent: its key and its whole request, kept together until Sophia answers it. */
interface Asked {
  readonly key: string
  readonly request: SourceReviewProposalRequest
}

type Sent =
  | { state: 'idle' }
  | ({ state: 'sending' } & Asked)
  | { state: 'proposed' }
  | { state: 'refused'; said: string }
  | ({ state: 'unanswered'; said: string } & Asked)

/**
 * What a failed proposal says. A reply that never came keeps its key and the request as it was sent: asking again sends
 * exactly that, so Sophia answers it as the same proposal, never as a different body under its key (Codex on #107).
 */
function outcomeOf(err: unknown, asked: Asked): Sent {
  if (err instanceof ApiError && err.status > 0 && err.status < 500) return { state: 'refused', said: err.message }
  return {
    state: 'unanswered',
    said: 'No reply from Sophia. Propose again to check; it is the same proposal.',
    ...asked,
  }
}

/** Whether a proposal is in flight or unanswered: its fields are kept as it was sent until Sophia answers it. */
const pending = (sent: Sent): sent is Extract<Sent, Asked> => sent.state === 'sending' || sent.state === 'unanswered'

function choose(chosen: readonly string[], id: string, max: number): string[] {
  if (chosen.includes(id)) return chosen.filter((c) => c !== id)
  return chosen.length < max ? [...chosen, id] : [...chosen]
}

type Proposal = ReturnType<typeof useProposal>

interface FormProps extends Props {
  availability: SourceReviewAvailability
  proposal: Proposal
  onClose: () => void
}

/**
 * The proposal, sent once per press. After no reply, a press sends the same key and the same request again; only
 * Sophia's answer ends it. It is held beside the form, so closing and reopening the form keeps it too.
 */
function useProposal({ projectId, identity, goal, onProposed }: Props) {
  const [sent, setSent] = useState<Sent>({ state: 'idle' })
  const propose = async (body: Omit<SourceReviewProposalRequest, 'goalId' | 'goalRevision'>) => {
    if (sent.state === 'sending') return
    const asked: Asked =
      sent.state === 'unanswered'
        ? { key: sent.key, request: sent.request }
        : { key: crypto.randomUUID(), request: { goalId: goal.id, goalRevision: goal.revision, ...body } }
    setSent({ state: 'sending', ...asked })
    try {
      await proposeReview(identity.token, projectId, asked.key, asked.request)
      setSent({ state: 'proposed' })
      onProposed()
    } catch (err: unknown) {
      setSent(outcomeOf(err, asked))
    }
  }
  /** A new form starts afresh, unless a proposal is still unanswered. */
  const reset = () => setSent((now) => (pending(now) ? now : { state: 'idle' }))
  return { sent, propose, reset }
}

function SourcesField({
  availability,
  chosen,
  onChoose,
  frozen,
}: {
  availability: SourceReviewAvailability
  chosen: readonly string[]
  onChoose: (id: string) => void
  frozen: boolean
}) {
  return (
    <fieldset>
      <legend className="field-label">Sources to review (up to {availability.limits.maxSources})</legend>
      {availability.sources.length === 0 && <p className="view-note">No report version can be reviewed yet.</p>}
      {availability.sources.map((s) => (
        <label key={s.sourceId} className="review-source">
          <input
            type="checkbox"
            checked={chosen.includes(s.sourceId)}
            disabled={frozen}
            onChange={() => onChoose(s.sourceId)}
          />
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
  const { goal, availability, proposal, onClose } = props
  const { sent, propose } = proposal
  // A proposal still unanswered is shown as it was sent, and cannot be changed until Sophia answers it.
  const kept = pending(sent) ? sent.request : null
  const [chosen, setChosen] = useState<string[]>(() => [...(kept?.sourceIds ?? [])])
  const [allowance, setAllowance] = useState(() => kept?.allowanceUsd ?? startingAllowance(availability))
  const [purpose, setPurpose] = useState(() => kept?.purpose ?? '')
  const frozen = kept !== null
  const max = availability.maxAllowanceUsd ?? 0
  const selection = selectionOf(availability.sources, chosen, availability.limits.maxInputBytes)
  const valid = frozen || (chosen.length > 0 && !selection.over && allowanceOk(allowance, max))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    void propose({ sourceIds: chosen, allowanceUsd: allowance, ...(purpose.trim() ? { purpose: purpose.trim() } : {}) })
  }
  if (sent.state === 'proposed') return <Proposed onClose={onClose} />
  return (
    <form className="sheet-form review-sources" onSubmit={submit} aria-label="Review sources">
      <SourcesField
        availability={availability}
        chosen={chosen}
        frozen={frozen}
        onChoose={(id) => setChosen(choose(chosen, id, availability.limits.maxSources))}
      />
      <TooMuch bytes={selection.bytes} over={selection.over} limit={availability.limits.maxInputBytes} />
      <TextField id={`review-allowance-${goal.id}`} label={`Allowance, USD (at most ${String(max)})`}>
        <input
          id={`review-allowance-${goal.id}`}
          type="number"
          min={ALLOWANCE_STEP}
          max={max}
          step={ALLOWANCE_STEP}
          value={allowance}
          readOnly={frozen}
          aria-invalid={!allowanceOk(allowance, max)}
          onChange={(e) => setAllowance(Number(e.target.value))}
        />
      </TextField>
      <TextField id={`review-purpose-${goal.id}`} label="Purpose (optional)">
        <input
          id={`review-purpose-${goal.id}`}
          maxLength={300}
          value={purpose}
          readOnly={frozen}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </TextField>
      <Bounds availability={availability} />
      <SendRow sent={sent} valid={valid} onClose={onClose} />
    </form>
  )
}

/** Propose, or propose again what went unanswered; and what Sophia said to the last press. */
function SendRow({ sent, valid, onClose }: { sent: Sent; valid: boolean; onClose: () => void }) {
  return (
    <>
      <div className="control-row">
        <button type="submit" className="pill primary" disabled={!valid || sent.state === 'sending'}>
          {sent.state === 'sending' ? 'Proposing…' : sent.state === 'unanswered' ? 'Propose again' : 'Propose review'}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
      {(sent.state === 'refused' || sent.state === 'unanswered') && (
        <p className="form-error" role="alert">
          {sent.said}
        </p>
      )}
    </>
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
  const proposal = useProposal(props)
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
      <button
        type="button"
        className="ghost review-sources-open"
        onClick={() => {
          proposal.reset()
          setOpen(true)
        }}
      >
        Review sources
      </button>
    )
  }
  return <ReviewForm {...props} availability={a} proposal={proposal} onClose={() => setOpen(false)} />
}
