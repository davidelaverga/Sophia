// A session's effort as a small bar in its tool's own look (effort.ts): Claude Code's dotted scale, GPT's gradient,
// a plain bar for the others. It comes alive as the tool's own does: in Claude Code's ultracode the bar is full, its
// dots light up and a glint runs along them, and it says "Ultracode" alone (it is the setting, not a level beside
// one); GPT's gradient sparkles at ultra. Its level is said in words beside it and to a screen reader.
import { alive, EFFORT_TOP, effortLook, effortStyle } from './effort.ts'
import type { Tool } from './resource.ts'

interface Props {
  effort: string
  tool: Tool
  mode?: string | null | undefined
}

export function EffortMeter({ effort, tool, mode }: Props) {
  const look = effortLook(effort)
  const style = effortStyle(tool)
  const live = alive(style, look, mode)
  const ultracode = style === 'claude' && live
  const label = ultracode ? 'Ultracode' : look.label
  const rank = ultracode ? EFFORT_TOP : look.rank
  if (rank === null) return <span className="resource-effort">{label} effort</span>
  return (
    <span className="effort" data-look={style} data-alive={live || undefined}>
      <span
        className="effort-track"
        role="meter"
        aria-label="Effort"
        aria-valuemin={0}
        aria-valuemax={EFFORT_TOP}
        aria-valuenow={rank}
        aria-valuetext={label}
      >
        <span className="effort-fill" style={{ width: `${((rank + 1) / (EFFORT_TOP + 1)) * 100}%` }} />
      </span>
      <span className="effort-label" aria-hidden>
        {label}
      </span>
    </span>
  )
}
