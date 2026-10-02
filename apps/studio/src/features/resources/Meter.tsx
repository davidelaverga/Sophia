// How full a window is, drawn: only for a percentage the observation gave and that is known to apply. Anything else is
// an empty track with its words beside it, never a filled bar.
interface Props {
  /** The window's name, for the meter's label: "5-hour window". */
  label: string
  percent: number | null
  /** The value in words, read out instead of the bare number: "63% used". */
  value: string
}

/** Past this much of a window used, the fill warms: the tone only reinforces the number beside it. */
const HIGH = 80

export function Meter({ label, percent, value }: Props) {
  if (percent === null) return <div className="capacity-meter is-unknown" aria-hidden />
  const tone = percent >= HIGH ? ' is-high' : ''
  return (
    <div
      className={`capacity-meter${tone}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={value}
    >
      <span className="capacity-meter-fill" style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  )
}
