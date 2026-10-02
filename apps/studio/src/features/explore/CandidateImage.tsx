// A candidate's picture, or what stands in its place in words: its state, or why its bytes aren't shown.
import type { Shown } from './useVerifiedImage.ts'
import { ROUTE, stateLine, type Candidate } from './direction.ts'

const NOT_SHOWN = {
  checking: 'Checking the image against its record…',
  mismatch: 'This image doesn’t match its record, so it isn’t shown.',
  unreadable: 'This image couldn’t be read.',
} as const

interface Props {
  candidate: Candidate
  /** Its place in the direction, for its name: "Candidate 2". */
  n: number
  /** Its bytes as checked (useVerifiedImage); null when it has none. */
  shown: Shown | null
}

export function CandidateImage({ candidate, n, shown }: Props) {
  if (!shown) {
    return (
      <div className="candidate-image empty">
        <p>{stateLine(candidate)}</p>
      </div>
    )
  }
  if (shown.kind !== 'shown') {
    return (
      <div className={`candidate-image empty ${shown.kind}`}>
        <p role={shown.kind === 'mismatch' ? 'alert' : undefined}>{NOT_SHOWN[shown.kind]}</p>
      </div>
    )
  }
  return (
    <div className="candidate-image">
      <img src={shown.url} alt={`Candidate ${n}, from ${ROUTE[candidate.route].label}`} />
    </div>
  )
}
