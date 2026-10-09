// The source-review pilot's entry under a goal (WBC-02 G5): Review sources. It offers what Sophia says may be reviewed
// (one to three report versions, at most 32 KiB of text in all), an allowance within the project's cap, and an
// optional purpose; proposing starts nothing: Sophia answers with a plan and a decision on the board, which the
// proposer takes there. Shown only where Sophia has enrolled the project; nothing is said where it hasn't.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Goal, SourceReviewAvailability, SourceReviewProposalRequest } from '@sophia/contracts'
import { proposeReview, recordedProposal, reviewAvailability } from '../../../api/work.ts'
import type { Identity } from '../../../app/dev-identity.ts'
import { EARLIER, outcomeOf, proposals, proposalViewer, type Asked, type Sent } from './review-proposal.ts'
import { ALLOWANCE_STEP, allowanceOk, kib, selectionOf } from './review-sources.ts'

interface Props {
  projectId: string
  identity: Identity
  goal: Goal
  /** The proposal is recorded: the board shows its decision. */
  onProposed: () => void
  /**
   * The board shows a plan proposed for this goal waiting on the viewer's own decision (a replacement beside the plan
   * in force): Sophia may hold the one kept here unanswered.
   */
  shown?: boolean
}

/** The allowance a review starts from: half a dollar, or the cap when it is lower. */
const startingAllowance = (a: SourceReviewAvailability) => Math.min(0.5, a.maxAllowanceUsd ?? 0.5)

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
 * Sophia's answer ends it. It is kept before it is sent (review-proposal.ts), per account, project and goal, so closing
 * the form, leaving Tasks and reloading the page all find it again, and an answer that arrives after this form has
 * gone still ends it, and only it: a newer proposal kept since for the goal stays (forget, by the key sent).
 */
function useProposal({ projectId, identity, goal, onProposed, shown = false }: Props) {
  const at = { viewer: proposalViewer(identity), project: projectId, goal: goal.id }
  const [sent, setSent] = useState<Sent>(() => {
    const kept = proposals.pending(at)
    return kept ? { state: 'unanswered', said: EARLIER, ...kept } : { state: 'idle' }
  })
  const propose = async (body: Omit<SourceReviewProposalRequest, 'goalId' | 'goalRevision'>) => {
    if (sent.state === 'sending') return
    const asked: Asked =
      sent.state === 'unanswered'
        ? { key: sent.key, request: sent.request }
        : { key: crypto.randomUUID(), request: { goalId: goal.id, goalRevision: goal.revision, ...body } }
    proposals.keep(at, asked)
    setSent({ state: 'sending', ...asked })
    try {
      await proposeReview(identity.token, projectId, asked.key, asked.request)
      proposals.forget(at, asked.key)
      setSent({ state: 'proposed' })
      onProposed()
    } catch (err: unknown) {
      const outcome = outcomeOf(err, asked)
      if (outcome.state === 'refused') proposals.forget(at, asked.key)
      setSent(outcome)
    }
  }
  useRecorded({ projectId, identity, goal, shown }, sent, setSent)
  /** A new form starts afresh, unless a proposal is still unanswered. */
  const reset = () => setSent((now) => (pending(now) ? now : { state: 'idle' }))
  return { sent, propose, reset }
}

/**
 * A proposal kept unanswered while the board shows one of the viewer's waiting on their decision for this goal: the
 * board's own decision, beside the plan in force, so nothing at this entry lets it go (Codex's automatic review of
 * a06db118, P2). Sophia is asked whether it recorded the one kept here, by its key and never by proposing again.
 * Recorded, it is answered, and only it goes; not found, or no answer, it stays as it was, so a different proposal
 * kept here is never let go for another's decision.
 */
function useRecorded(
  props: Pick<Props, 'projectId' | 'identity' | 'goal'> & { shown: boolean },
  sent: Sent,
  set: (s: Sent) => void,
) {
  const { projectId, identity, goal, shown } = props
  const asking = shown && sent.state === 'unanswered' ? sent.key : null
  const recorded = useQuery({
    queryKey: ['source-review-proposal', projectId, proposalViewer(identity), asking],
    queryFn: ({ signal }) => recordedProposal(identity.token, projectId, asking ?? '', signal),
    enabled: asking !== null,
    retry: false,
  })
  const viewer = proposalViewer(identity)
  const answered = recorded.data === undefined ? null : asking
  useEffect(() => {
    if (answered === null) return
    proposals.forget({ viewer, project: projectId, goal: goal.id }, answered)
    set({ state: 'proposed' })
  }, [answered, viewer, projectId, goal.id, set])
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
