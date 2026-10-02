// One candidate up close: its picture, what it came from, and the choice. Choosing keeps every alternative and asks
// for nothing else: no new image, no edit (IMG-01).
import { useEffect, useRef } from 'react'
import type { Membership } from '@sophia/contracts'
import { Icon, Tag } from '@sophia/ui'
import { CandidateImage } from './CandidateImage.tsx'
import { choice, provenance, ROUTE, STATE, type Candidate, type Direction } from './direction.ts'
import type { SerialChoice } from './useSerialChoice.ts'
import { useVerifiedImage, type Shown, type VerifiedImages } from './useVerifiedImage.ts'

interface Props {
  direction: Direction
  candidate: Candidate
  n: number
  role: Membership['role'] | undefined
  /** The gallery's checks: an image its tile already read isn't read again. */
  images: VerifiedImages
  /** The gallery's one choice at a time. */
  serial: SerialChoice
  onBack: () => void
}

interface ChooseProps {
  direction: Direction
  candidate: Candidate
  role: Membership['role'] | undefined
  serial: SerialChoice
  /** Its bytes as checked: nothing is offered or refused while the check is under way. */
  shown: Shown | null
  /** The button goes once the choice holds: the focus needs somewhere to go. */
  onChosen: () => void
}

function ChooseButton({ direction, candidate, role, serial, shown, onChosen }: ChooseProps) {
  const can = choice(role, candidate, direction, shown?.kind === 'shown')
  if (direction.chosenId === candidate.id) return <Tag tone="teal">Chosen</Tag>
  if (shown?.kind === 'checking') return null
  if (!can.can) return <p className="direction-why">{can.why}</p>
  const mine = serial.choosing === candidate.id
  if (serial.choosing !== null && !mine) return <p className="direction-why">Another choice is being saved first.</p>
  const choose = async () => {
    if (await serial.choose(candidate.id)) onChosen()
  }
  const failed = serial.failed?.candidateId === candidate.id ? serial.failed.text : null
  return (
    <>
      <button type="button" className="pill primary" disabled={mine} onClick={() => void choose()}>
        {mine ? 'Choosing…' : 'Choose this one'}
      </button>
      {failed && (
        <p className="outcome" role="alert">
          {failed}
        </p>
      )}
    </>
  )
}

export function DirectionDetail(props: Props) {
  const { direction, candidate, n, images, onBack } = props
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => back.current?.focus({ preventScroll: true }), [])
  const state = STATE[candidate.state]
  const shown = useVerifiedImage(candidate.asset, images, true)
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
            {shown?.kind === 'unreadable' && (
              // Reads this image again, and only this one.
              <button
                type="button"
                className="pill"
                onClick={() => candidate.asset && void images.check(candidate.asset)}
              >
                Try again
              </button>
            )}
            <ChooseButton {...props} shown={shown} onChosen={() => back.current?.focus({ preventScroll: true })} />
          </div>
          <dl className="direction-facts">
            {provenance(candidate, direction).map(([term, value], i) => (
              <div key={`${term}-${i}`}>
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
