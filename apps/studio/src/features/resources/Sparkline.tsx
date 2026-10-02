// A window's readings over time, small: a line from its first reading to its latest, with the latest marked, in the
// colour its use has reached (usageTone). Two readings at least, or nothing is drawn. It says in words what it shows.
import type { Point } from './history.ts'
import { ago, usageTone } from './resource.ts'

interface Props {
  /** The window, for the words: "5-hour window". */
  name: string
  points: Point[]
  now: Date
}

const H = 24

export function Sparkline({ name, points, now }: Props) {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last || points.length < 2) return null
  const span = Math.max(1, last.at - first.at)
  const top = Math.max(100, ...points.map((p) => p.value))
  const x = (p: Point) => ((p.at - first.at) / span) * 100
  const y = (p: Point) => H - (p.value / top) * H
  const line = points.map((p) => `${x(p).toFixed(2)},${y(p).toFixed(2)}`).join(' ')
  const since = ago(new Date(first.at).toISOString(), now)
  const words = `${name}: ${first.value}% to ${last.value}% used, since ${since}`
  return (
    <figure className={`capacity-history is-${usageTone(last.value)}`} role="img" aria-label={words}>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
        <polygon className="capacity-history-area" points={`0,${H} ${line} 100,${H}`} />
        <polyline className="capacity-history-line" points={line} />
      </svg>
      <span className="capacity-history-now" style={{ left: `${x(last)}%`, top: `${(y(last) / H) * 100}%` }} />
      <figcaption aria-hidden>
        {points.length} readings · since {since}
      </figcaption>
    </figure>
  )
}
