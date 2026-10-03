// Choosing a session's effort, for its owner: the session's own bar opens into a scale in its tool's look, from Faster
// to Smarter, over the levels the tool says it takes (Session.efforts; Claude Code's ultracode last). Sliding previews
// the look it will have (Claude's dots light up at ultracode, GPT's gradient sparkles at ultra). The safe choice is the
// default: it applies when the session next starts. Restarting now is offered only while it works, said plainly, and
// asked twice. Nothing changes in place: the change is a request, shown apart from what the session runs until its
// tool reports it (02_RUNTIME_AND_RESEARCH: a new configuration, never a hot switch).
import { useEffect, useId, useRef, useState } from 'react'
import { alive, effortLook, effortStyle } from './effort.ts'
import type { Session, Tool } from './resource.ts'

export type When = 'next' | 'now'
export interface EffortAsk {
  level: string
  when: When
}

/** A level as people say it: "Extra high", "Max", "Ultracode". */
export const levelName = (level: string) => effortLook(level).label

/** What the session runs now, as one of its levels: its mode when it has one (ultracode), else its effort. */
export const currentLevel = (s: Session) => s.mode ?? s.effort?.toLowerCase() ?? null

const STEP: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }

interface ScaleProps {
  levels: string[]
  at: number
  tool: Tool
  onMove: (at: number) => void
  onKey: (e: React.KeyboardEvent) => void
}

/** The scale itself: a slider in the tool's look, its knob on the chosen level, its look alive where the tool's is. */
function Scale({ levels, at, tool, onMove, onKey }: ScaleProps) {
  const track = useRef<HTMLSpanElement>(null)
  useEffect(() => track.current?.focus(), []) // opened to be moved: the keys are on it at once
  const style = effortStyle(tool)
  const word = levels[at] ?? ''
  const live = alive(style, effortLook(word), word === 'ultracode' ? 'ultracode' : null)
  const place = at / Math.max(1, levels.length - 1)
  const pick = (e: React.PointerEvent) => {
    const box = track.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const share = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    onMove(Math.round(share * (levels.length - 1)))
  }
  return (
    <span className="effort effort-scale" data-look={style} data-alive={live || undefined}>
      <span className="effort-end">Faster</span>
      <span
        ref={track}
        className="effort-track"
        role="slider"
        tabIndex={0}
        aria-label="Effort"
        aria-valuemin={0}
        aria-valuemax={levels.length - 1}
        aria-valuenow={at}
        aria-valuetext={levelName(word)}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => e.buttons === 1 && pick(e)}
      >
        <span className="effort-fill" style={{ width: `${place * 100}%` }} />
        <span className="effort-knob" style={{ left: `${place * 100}%` }} />
      </span>
      <span className="effort-end">Smarter</span>
    </span>
  )
}

interface Props {
  session: Session
  tool: Tool
  levels: string[]
  onSet: (ask: EffortAsk) => void
  onCancel: () => void
}

/** Restarting now: only while the session works, said plainly, and confirmed. */
function Restart({ level, onRestart }: { level: string; onRestart: () => void }) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button type="button" className="text-button effort-restart" onClick={() => setAsking(true)}>
        Restart now with {levelName(level)}…
      </button>
    )
  }
  return (
    <p className="effort-confirm" role="alert">
      It stops this session’s work and starts it again with {levelName(level)}.
      <button type="button" className="text-button" onClick={onRestart}>
        Restart
      </button>
      <button type="button" className="text-button" onClick={() => setAsking(false)}>
        Keep it running
      </button>
    </p>
  )
}

export function EffortPicker({ session, tool, levels, onSet, onCancel }: Props) {
  const now = currentLevel(session)
  const [at, setAt] = useState(() => Math.max(0, now ? levels.indexOf(now) : levels.indexOf('high')))
  const level = levels[at] ?? levels[0] ?? ''
  const same = level === now
  const works = session.assignment?.state === 'running' || session.assignment?.state === 'waiting'
  const id = useId()
  const onKey = (e: React.KeyboardEvent) => {
    const step = STEP[e.key]
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? levels.length - 1 : step === undefined ? null : at + step
    if (to !== null) {
      e.preventDefault()
      setAt(Math.min(levels.length - 1, Math.max(0, to)))
    } else if (e.key === 'Enter' && !same) {
      e.preventDefault()
      onSet({ level, when: 'next' })
    } else if (e.key === 'Escape') {
      e.stopPropagation() // the picker closes, not the sheet
      onCancel()
    }
  }
  return (
    <div className="effort-picker" role="group" aria-labelledby={id}>
      <p id={id} className="effort-picker-level" aria-live="polite">
        {levelName(level)}
        {same && <span className="effort-picker-now">now</span>}
      </p>
      <Scale levels={levels} at={at} tool={tool} onMove={setAt} onKey={onKey} />
      <p className="effort-picker-foot">
        <button type="button" className="pill" disabled={same} onClick={() => onSet({ level, when: 'next' })}>
          {same ? `Already ${levelName(level)}` : 'Set for its next run'}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </p>
      {works && !same && <Restart level={level} onRestart={() => onSet({ level, when: 'now' })} />}
    </div>
  )
}
