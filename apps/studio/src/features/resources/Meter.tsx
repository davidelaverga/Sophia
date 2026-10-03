// How full a window is, drawn: only for a percentage the observation gave and that is known to apply. Anything else is
// an empty track with its words beside it, never a filled bar. The fill turns amber from 75 % used and red from 90 %
// (usageTone); the words beside it carry the number.
import { usageTone } from './resource.ts'

interface Props {
  /** The window's name, for the meter's label: "5-hour window". */
  label: string
  percent: number | null
  /** The value in words, read out instead of the bare number: "63% used". */
  value: string
  /** How much of the window had passed when it was read (0–1): a mark on the track, to read the fill against. */
  passed?: number | null | undefined
}

export function Meter({ label, percent, value, passed }: Props) {
  if (percent === null) return <div className="capacity-meter is-unknown" aria-hidden />
  const tone = usageTone(percent)
  const mark = passed ?? null
  // A spend limit can be passed: the range holds the value, and the fill stops at the end of the track.
  return (
    <div
      className={`capacity-meter${tone === 'ok' ? '' : ` is-${tone}`}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(100, percent)}
      aria-valuenow={percent}
      aria-valuetext={mark === null ? value : `${value} · ${Math.round(mark * 100)}% of the window passed`}
    >
      <span className="capacity-meter-fill" style={{ width: `${Math.min(100, percent)}%` }} />
      {mark !== null && <span className="capacity-meter-pace" style={{ left: `${mark * 100}%` }} />}
    </div>
  )
}
