// Acting on a task from its sheet, without leaving it (LFE-06.4, 07.3): guidance to the session doing it, Hold, Stop.
// Each is offered only where the session's tool supports it (the resource's controls) and only to its owner; Stop asks
// first, as the app does before cutting work off. What happens is said step by step as it is observed (07_STUDIO_
// VOICE_AND_ARTIFACTS: recorded → queued → delivered), never "applied": delivered isn't seen acting on it yet.
import { useState } from 'react'
import { ConfirmButton } from '@sophia/ui'
import type { PlanRow } from './plan.ts'

export type ActKind = 'guidance' | 'hold' | 'stop'
export type ActStep = 'recorded' | 'queued' | 'delivered' | 'refused'
/** Sends an act; `report` is called with each step as it is observed. */
export type Act = (row: PlanRow, act: { kind: ActKind; text?: string }, report: (step: ActStep) => void) => void

const STEPS: readonly ActStep[] = ['recorded', 'queued', 'delivered']
const STEP_WORD: Record<ActStep, string> = {
  recorded: 'Recorded',
  queued: 'Queued',
  delivered: 'Delivered',
  refused: 'Not accepted',
}
const DONE: Record<ActKind, string> = {
  guidance: 'Delivered to its session. Not seen acting on it yet.',
  hold: 'It holds at its next safe point.',
  stop: 'Its session was asked to stop.',
}

/** Where an act is: three dots filling as each step is observed, and what that step means. */
function Steps({ kind, at }: { kind: ActKind; at: ActStep }) {
  const reached = STEPS.indexOf(at)
  return (
    <div className="act-steps" role="status" data-at={at}>
      <ol aria-hidden>
        {STEPS.map((s, i) => (
          <li key={s} data-reached={i <= reached || undefined}>
            {STEP_WORD[s]}
          </li>
        ))}
      </ol>
      <p>
        {at === 'delivered' ? DONE[kind] : at === 'refused' ? 'Not accepted. Nothing was sent.' : `${STEP_WORD[at]}…`}
      </p>
    </div>
  )
}

interface Props {
  row: PlanRow
  viewerId: string | null
  onAct?: Act | undefined
}

export function TaskActions({ row, viewerId, onAct }: Props) {
  const [text, setText] = useState('')
  const [sent, setSent] = useState<{ kind: ActKind; at: ActStep } | null>(null)
  const resource = row.doer.resource
  if (!onAct || !resource || !row.doer.session) return null
  if (resource.owner.id !== viewerId) {
    return <p className="act-note muted">{resource.owner.name} steers, holds or stops their own sessions.</p>
  }
  const supports = (c: 'steer' | 'hold' | 'stop') => resource.controls[c] === 'supported'
  const send = (kind: ActKind, words?: string) => {
    setSent({ kind, at: 'recorded' })
    onAct(row, { kind, ...(words ? { text: words } : {}) }, (at) => setSent({ kind, at }))
    if (kind === 'guidance') setText('')
  }
  return (
    <section className="sheet-section task-actions">
      <h3>Act on it</h3>
      {supports('steer') && (
        <form
          className="act-guide"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) send('guidance', text.trim())
          }}
        >
          <input
            aria-label="Guidance for its session"
            placeholder="Guidance for its session…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="pill" disabled={!text.trim()}>
            Send
          </button>
        </form>
      )}
      <div className="control-row">
        {supports('hold') && (
          <button type="button" className="ghost" onClick={() => send('hold')}>
            Hold
          </button>
        )}
        {supports('stop') && (
          <ConfirmButton
            label="Stop"
            warning="Ends its session’s work at once."
            confirm="Stop"
            keep="Keep it working"
            onConfirm={() => send('stop')}
          />
        )}
      </div>
      {sent && <Steps kind={sent.kind} at={sent.at} />}
    </section>
  )
}
