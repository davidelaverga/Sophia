import type { ExploreDirection } from '../../api/managed-explore.ts'

function Workflow({ direction }: { direction: ExploreDirection }) {
  const steps = new Map(direction.steps.map((step) => [step.id, step]))
  return (
    <div className="explore-workflow" aria-label={`${direction.label} workflow`}>
      <div className="explore-lane-labels" aria-hidden>
        <span>Shore</span>
        <span>Vessel</span>
      </div>
      <ol className="explore-workflow-steps">
        {direction.steps.map((step, index) => (
          <li key={step.id} className="explore-workflow-step" style={{ gridRow: index + 1 }} data-lane={step.lane}>
            <span className="sr-only">{step.lane}</span>
            <strong>{step.label}</strong>
          </li>
        ))}
      </ol>
      <ul className="explore-workflow-edges" aria-label="Workflow connections">
        {direction.edges.map((edge) => (
          <li key={JSON.stringify([edge.from, edge.to])}>
            {steps.get(edge.from)?.label} <span aria-label="leads to">→</span> {steps.get(edge.to)?.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface Props {
  directions: readonly ExploreDirection[]
  selected: string | null
  disabled: boolean
  onSelect: (option: ExploreDirection) => void
}

export function DirectionOptions({ directions, selected, disabled, onSelect }: Props) {
  return (
    <section className="explore-directions" aria-label="Compare design directions">
      <h3>Design directions</h3>
      <div className="explore-direction-grid">
        {directions.map((direction) => (
          <article
            key={direction.id}
            className="explore-direction"
            data-selected={selected === direction.id || undefined}
          >
            <div className="explore-direction-head">
              <h4>{direction.label}</h4>
              {selected === direction.id && <span className="explore-selected">Selected</span>}
            </div>
            <Workflow direction={direction} />
            <dl className="explore-direction-facts">
              <dt>First to act</dt>
              <dd>{direction.firstActor}</dd>
              <dt>Next step</dt>
              <dd>{direction.nextStep}</dd>
              <dt>Why</dt>
              <dd>{direction.rationale}</dd>
              <dt>Trade-off</dt>
              <dd>{direction.tradeoff}</dd>
            </dl>
            <button
              className="pill"
              type="button"
              disabled={disabled || selected === direction.id}
              onClick={() => onSelect(direction)}
              aria-label={`Select ${direction.label}`}
            >
              {selected === direction.id ? 'Selected direction' : 'Select direction'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
