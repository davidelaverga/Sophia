// Acting on a session where it shows (LFE-06.6): guidance to it, Hold, Stop, from a resource's sheet or a task's. Each
// is offered only where its tool supports it (the resource's controls) and only to its owner; Stop asks first, as the
// app does before cutting work off. What happens is said step by step as it is observed (07_STUDIO_VOICE_AND_ARTIFACTS:
// recorded → queued → delivered), never "applied": delivered isn't seen acting on it yet. Each session's last act is
// kept by the view (useActs), so it is still said after its row closes or the sheet turns, and a late step of an
// earlier act never speaks over a later one.
import { useEffect, useRef, useState } from 'react'
import { ConfirmButton } from '@sophia/ui'
import type { Resource } from './resource.ts'

export type ActKind = 'guidance' | 'hold' | 'stop'
export type ActStep = 'recorded' | 'queued' | 'delivered' | 'refused'
export interface ActAsked {
  kind: ActKind
  text?: string
}
/** Sends an act to one session; `report` is called with each step as it is observed. */
export type SessionAct = (sessionId: string, act: ActAsked, report: (step: ActStep) => void) => void

/** A session's last act, and the step it has reached. */
export interface ActSent {
  kind: ActKind
  at: ActStep
}

/** The view's acts: each session's last one, and a way to send another. */
export interface Acts {
  sent: Readonly<Record<string, ActSent | undefined>>
  send: (sessionId: string, act: ActAsked) => void
}

/**
 * Each session's last act, kept where the view lives, not in a row that closes. Only the latest act of a session
 * speaks: a step reported for an earlier one is let go.
 */
export function useActs(onAct: SessionAct | undefined): Acts | undefined {
  const [sent, setSent] = useState<Record<string, ActSent | undefined>>({})
  const latest = useRef<Record<string, number>>({})
  if (!onAct) return undefined
  return {
    sent,
    send: (sessionId, act) => {
      const n = (latest.current[sessionId] ?? 0) + 1
      latest.current[sessionId] = n
      const said = (at: ActStep) => {
        if (latest.current[sessionId] === n) setSent((s) => ({ ...s, [sessionId]: { kind: act.kind, at } }))
      }
      said('recorded')
      onAct(sessionId, act, said)
    },
  }
}

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

/** Where an act is: three bars filling as each step is observed, and what that step means. */
function Steps({ kind, at }: ActSent) {
  const reached = STEPS.indexOf(at)
  return (
    <div className="act-steps" data-at={at}>
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

type Control = 'steer' | 'hold' | 'stop'
const ACT_NAME: Record<Control, string> = { steer: 'Guidance', hold: 'Hold', stop: 'Stop' }

/** The acts its route supports, in order. */
export const supported = (resource: Resource): Control[] =>
  (['steer', 'hold', 'stop'] as const).filter((c) => resource.controls[c] === 'supported')

/** Whether its owner can act on a session at all here: some control its route supports. */
export const canAct = (resource: Resource) => supported(resource).length > 0

/** What the route's acts are, in words: "Guidance, Hold or Stop", "Hold or Stop". */
export function actsSaid(resource: Resource): string {
  const names = supported(resource).map((c) => ACT_NAME[c])
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1) ?? ''}` : (names[0] ?? '')
}

interface Props {
  resource: Resource
  sessionId: string
  acts: Acts
}

/** The acts its route supports, for its owner: the caller shows them only to the owner. */
export function SessionActs({ resource, sessionId, acts }: Props) {
  const [text, setText] = useState('')
  const mine = acts.sent[sessionId]
  // Guidance stays in its field until it is queued: one not accepted can be sent again as it was.
  useEffect(() => {
    if (mine?.kind === 'guidance' && mine.at !== 'recorded' && mine.at !== 'refused') setText('')
  }, [mine])
  const can = new Set(supported(resource))
  const send = (kind: ActKind, words?: string) => acts.send(sessionId, { kind, ...(words ? { text: words } : {}) })
  return (
    <div className="session-acts">
      {can.has('steer') && (
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
        {can.has('hold') && (
          <button type="button" className="ghost" onClick={() => send('hold')}>
            Hold
          </button>
        )}
        {can.has('stop') && (
          <ConfirmButton
            label="Stop"
            warning="Ends its session’s work at once."
            confirm="Stop"
            keep="Keep it working"
            onConfirm={() => send('stop')}
          />
        )}
      </div>
      {/* Mounted before anything is said, so each step is announced as it comes. */}
      <div role="status">{mine && <Steps kind={mine.kind} at={mine.at} />}</div>
    </div>
  )
}
