// A task's result in its sheet (WBC-01 G2): its current version and, while a newer attempt runs or failed, the last
// usable one, marked as earlier; what its review says, and of which version. Open result and Review candidate are
// offered when the board's view allows them, and reach a version through the page's result port by its exact
// identity (results.ts). This is not a renderer: what comes back is shown as plain text under the label its port
// gives (a fixture says it is one). No candidate means nothing to open, and a version the port can't read says so.
import { useRef, useState } from 'react'
import { actionOf, type PlanRow } from './plan.ts'
import { refOf, resultsOf, reviewSaid, versionSaid, type ReadResult, type ResultRef } from './results.ts'
import type { Candidate } from './board-view.ts'

type Opened =
  | { ref: ResultRef; purpose: 'read' | 'review'; state: 'reading' }
  | { ref: ResultRef; purpose: 'read' | 'review'; state: 'shown'; text: string; label: string }
  | { ref: ResultRef; purpose: 'read' | 'review'; state: 'unavailable' }

/** The version opened last, read through the port; a slower earlier read never replaces a later one. */
function useOpened(readResult: ReadResult | undefined) {
  const [opened, setOpened] = useState<Opened | null>(null)
  const latest = useRef(0)
  const open = (ref: ResultRef, purpose: 'read' | 'review') => {
    if (!readResult) return
    const n = ++latest.current
    setOpened({ ref, purpose, state: 'reading' })
    const settle = (next: Opened) => {
      if (n === latest.current) setOpened(next)
    }
    readResult(ref, purpose).then(
      (got) => settle(got ? { ref, purpose, state: 'shown', ...got } : { ref, purpose, state: 'unavailable' }),
      () => settle({ ref, purpose, state: 'unavailable' }),
    )
  }
  return { opened, open }
}

interface VersionProps {
  candidate: Candidate
  earlier: boolean
  /** Its current attempt is still at work or failed: the earlier version is what can be used now. */
  standsIn: boolean
  canOpen: boolean
  canReview: boolean
  onOpen: (purpose: 'read' | 'review') => void
}

function Version({ candidate, earlier, standsIn, canOpen, canReview, onOpen }: VersionProps) {
  return (
    <li className="task-result-version" data-earlier={earlier || undefined}>
      <span className="task-result-which">
        <span className="field-label">{earlier ? (standsIn ? 'Last usable' : 'Earlier') : 'Current'}</span>
        <span className="task-result-id">{versionSaid(candidate)}</span>
      </span>
      <span className="control-row">
        {canOpen && (
          <button type="button" className="ghost" onClick={() => onOpen('read')}>
            {earlier ? 'Open earlier result' : 'Open result'}
          </button>
        )}
        {canReview && !earlier && (
          <button type="button" className="ghost" onClick={() => onOpen('review')}>
            Review candidate
          </button>
        )}
      </span>
    </li>
  )
}

function OpenedText({ opened }: { opened: Opened }) {
  if (opened.state === 'reading') return <p className="task-result-note muted">Reading {opened.ref.version_id}…</p>
  if (opened.state === 'unavailable') {
    return (
      <p className="task-result-note">
        {opened.ref.version_id} can’t be read right now. Nothing else is shown in its place.
      </p>
    )
  }
  return (
    <figure className="task-result-text">
      <figcaption>
        {opened.purpose === 'review' ? 'Reviewing' : 'Reading'} {opened.ref.version_id} · {opened.label}
      </figcaption>
      <pre>{opened.text}</pre>
    </figure>
  )
}

/** What the view allows of a task's result: opening it, reviewing it, and why opening isn't allowed when it isn't. */
function allowedOf(row: PlanRow, readResult: ReadResult | undefined) {
  const openAction = actionOf(row, 'open_result')
  return {
    canOpen: !!readResult && openAction?.availability === 'allowed',
    canReview: !!readResult && actionOf(row, 'review_candidate')?.availability === 'allowed',
    refused: openAction && openAction.availability !== 'allowed' ? openAction.reason : null,
  }
}

export function TaskResult({ row, readResult }: { row: PlanRow; readResult?: ReadResult | undefined }) {
  const { opened, open } = useOpened(readResult)
  const { current, earlier } = resultsOf(row.view)
  const review = reviewSaid(row.view)
  if (!current && !earlier && !review) return null
  const { canOpen, canReview, refused } = allowedOf(row, readResult)
  const at = (c: Candidate) => (purpose: 'read' | 'review') => open(refOf(row.item.id, c), purpose)
  const versions = [
    current && { candidate: current, earlier: false, standsIn: false, canReview },
    earlier && { candidate: earlier, earlier: true, standsIn: !current, canReview: false },
  ].filter((v) => v !== null)
  return (
    <section className="sheet-section task-result">
      <h3>Result</h3>
      <ul className="task-result-versions">
        {versions.map((v) => (
          <Version key={v.candidate.version_id} {...v} canOpen={canOpen} onOpen={at(v.candidate)} />
        ))}
      </ul>
      {review && <p className="task-result-review">{review}</p>}
      {refused && <p className="act-note muted">{refused}</p>}
      {opened && <OpenedText opened={opened} />}
    </section>
  )
}
