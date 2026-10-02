// One candidate up close: its picture, what it came from, and the choice. Choosing keeps every alternative and asks
// for nothing else: no new image, no edit (IMG-01).
import { useEffect, useRef, useState } from 'react'
import type { Membership } from '@sophia/contracts'
import { Icon, Tag } from '@sophia/ui'
import { CandidateImage } from './CandidateImage.tsx'
import { choice, provenance, ROUTE, STATE, type Candidate, type Direction } from './direction.ts'
import { useVerifiedImage, type ReadBytes, type Shown } from './useVerifiedImage.ts'

export type Choose = (candidateId: string, expectedRevision: number) => Promise<void>

interface Props {
  direction: Direction
  candidate: Candidate
  n: number
  role: Membership['role'] | undefined
  read: ReadBytes
  onChoose: Choose
  onBack: () => void
}

interface ChooseProps extends Omit<Props, 'n' | 'read' | 'onBack'> {
  /** Its bytes as checked: nothing is offered or refused while the check is under way. */
  shown: Shown | null
  /** The button goes once the choice holds: the focus needs somewhere to go. */
  onChosen: () => void
}

function ChooseButton({ direction, candidate, role, onChoose, shown, onChosen }: ChooseProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const can = choice(role, candidate, direction, shown?.kind === 'shown')
  if (direction.chosenId === candidate.id) return <Tag tone="teal">Chosen</Tag>
  if (shown?.kind === 'checking') return null
  if (!can.can) return <p className="direction-why">{can.why}</p>
  const choose = async () => {
    setBusy(true)
    setError(null)
    try {
      await onChoose(candidate.id, direction.revision)
      onChosen()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The choice wasn’t confirmed. Nothing else was asked.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="pill primary" disabled={busy} onClick={() => void choose()}>
        {busy ? 'Choosing…' : 'Choose this one'}
      </button>
      {error && (
        <p className="outcome" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

export function DirectionDetail(props: Props) {
  const { direction, candidate, n, read, onBack } = props
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => back.current?.focus({ preventScroll: true }), [])
  const state = STATE[candidate.state]
  const shown = useVerifiedImage(candidate.asset, read)
  return (
    <section
      className="direction-detail"
      aria-labelledby="candidate-title"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onBack()
      }}
    >
      <header className="direction-detail-head">
        <button ref={back} type="button" className="round" aria-label="Back to the direction" onClick={onBack}>
          <Icon name="back" />
        </button>
        <h3 id="candidate-title">
          Candidate {n} · {ROUTE[candidate.route].label}
        </h3>
        <Tag tone={state.tone}>{state.label}</Tag>
      </header>
      <div className="direction-detail-body">
        <CandidateImage candidate={candidate} n={n} shown={shown} />
        <div className="direction-detail-side">
          <div className="direction-choice" role="status">
            <ChooseButton {...props} shown={shown} onChosen={() => back.current?.focus({ preventScroll: true })} />
          </div>
          <dl className="direction-facts">
            {provenance(candidate, direction).map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
