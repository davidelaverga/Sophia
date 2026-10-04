// Commands on work where it shows (LFE-06.6, WBC-01 G4): guidance, Hold, Resume and Stop, from a resource's row or a
// task's sheet. The caller decides what to offer: a resource's owner what its route supports (Resources), anyone what
// the board's view allows them (a task's sheet). Stop asks first, and promises nothing it can't see.
//
// What happens is said as it is observed, in three dimensions (receipts.ts): Sending before any receipt, then
// recorded or refused, then delivered, then, for a control, its effect once the runtime confirms it. A reply that
// never came is unknown and is tried again with the same operation; so is the same request pressed again. Commands
// and drafts are kept while the page lives (command-store.ts), per space (a project as one viewer sees it): commands
// by scope (work, assignment, generation), drafts by execution (its attempt and session too). They are still said after
// the row closes, the sheet turns or the board unmounts; a late or foreign receipt changes nothing, and a session's
// next assignment starts with none of the old one's. The latest command for the execution shown speaks; earlier ones
// still open stay listed under it, each named. Only those for the execution shown can be tried again: one for an
// earlier attempt or another session is said as such, and kept as it was (Codex F-007).
import { useSyncExternalStore } from 'react'
import { ConfirmButton, Tip } from '@sophia/ui'
import {
  added,
  commandOf,
  drafted,
  received,
  repeatOf,
  resent,
  spaceOf,
  subscribe,
  unanswered,
} from './command-store.ts'
import {
  againable,
  executionOf,
  executionSaid,
  knownSaid,
  reached,
  retryableNow,
  sameTarget,
  scopeOf,
  stepsOf,
  uncertain,
  unresolved,
  type Command,
  type CommandKind,
  type CommandTarget,
  type Known,
  type Offer,
} from './receipts.ts'
import type { Resource } from './resource.ts'

export type { Offer } from './receipts.ts'

/** Sends a command; `on.receipt` takes each receipt as it comes (any order), `on.lost` says no reply came in time. */
export type SendCommand = (command: Command, on: { receipt: (r: unknown) => void; lost: () => void }) => void

/** The view's commands and drafts, by scope. */
export interface Acts {
  /** The project the view's commands are for. */
  project: string
  /** The commands sent in a scope, oldest first. */
  of: (scope: string) => readonly Known[]
  /** Sends a command, or the same request again (with its own operation) while it is unresolved; its operation's id. */
  send: (kind: CommandKind, target: CommandTarget, text?: string) => string
  /** Sends a command again with its own operation: after a lost reply, or an unknown admission. */
  retry: (operationId: string) => void
  /** The guidance being written for one execution (receipts.ts `executionOf`). */
  draft: (execution: string) => string
  setDraft: (execution: string, text: string) => void
}

/**
 * The commands and drafts of one space, kept while the page lives (command-store.ts): `space` names the project and
 * who is looking. Absent `onCommand`, nothing can be sent.
 */
export function useActs(
  onCommand: SendCommand | undefined,
  project: string,
  space: string,
  newId: () => string = () => crypto.randomUUID(),
): Acts | undefined {
  const state = useSyncExternalStore(subscribe, () => spaceOf(space))
  if (!onCommand) return undefined
  const dispatch = (command: Command) =>
    onCommand(command, {
      receipt: (r) => received(space, command.operation_id, r),
      lost: () => unanswered(space, command.operation_id),
    })
  const retry = (operationId: string) => {
    const k = commandOf(space, operationId)
    if (!k) return operationId
    resent(space, operationId)
    dispatch(k.command)
    return operationId
  }
  return {
    project,
    of: (scope) => state.known.filter((k) => scopeOf(k.command.target) === scope),
    send: (kind, target, text) => {
      const again = repeatOf(space, kind, target, text)
      if (again) return retry(again.command.operation_id)
      const command: Command = { operation_id: newId(), kind, target, ...(text ? { text } : {}) }
      added(space, command)
      dispatch(command)
      return command.operation_id
    },
    retry,
    draft: (execution) => state.drafts[execution] ?? '',
    setDraft: (execution, text) => drafted(space, execution, text),
  }
}

/** Whether a command may be tried again from here now (receipts.ts `retryableNow`). */
type Retryable = (k: Known) => boolean

/** Where a command is: three bars filling as each step is observed, what that means, and Try again when unknown. */
function Steps({ known, retryable, onRetry }: { known: Known; retryable: Retryable; onRetry: () => void }) {
  const steps = stepsOf(known.command.kind)
  const at = reached(known)
  const again = retryable(known)
  return (
    <div
      className="act-steps"
      data-at={known.local ?? known.receipt?.admission}
      data-uncertain={uncertain(known) || undefined}
    >
      <ol aria-hidden>
        {steps.map((s, i) => (
          <li key={s} data-reached={i <= at || undefined}>
            {s}
          </li>
        ))}
      </ol>
      <p>
        {knownSaid(known, !againable(known) || again)}
        {again && (
          <>
            {' '}
            <button type="button" className="text-button" onClick={onRetry}>
              Try again
            </button>
          </>
        )}
      </p>
    </div>
  )
}

const KIND_NAME: Readonly<Record<CommandKind, string>> = {
  guidance: 'Guidance',
  hold: 'Hold',
  resume: 'Resume',
  stop: 'Stop',
}

/**
 * Earlier commands still open, one line each under the latest: named, with the execution they were for when it isn't
 * the one shown, and Try again only for the one shown.
 */
interface EarlierProps {
  known: readonly Known[]
  shown: CommandTarget
  retryable: Retryable
  onRetry: (k: Known) => void
}

function Earlier({ known, shown, retryable, onRetry }: EarlierProps) {
  if (known.length === 0) return null
  return (
    <ul className="act-earlier" aria-label="Earlier, still open">
      {known.map((k) => {
        const of = executionSaid(k, shown)
        return (
          <li key={k.command.operation_id} data-execution={of ? 'earlier' : undefined}>
            <span className="act-earlier-kind">
              {KIND_NAME[k.command.kind]}
              {of && ` ${of}`}
            </span>{' '}
            {knownSaid(k, !againable(k) || retryable(k))}
            {retryable(k) && (
              <>
                {' '}
                <button type="button" className="text-button" onClick={() => onRetry(k)}>
                  Try again
                </button>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

type Control = 'steer' | 'hold' | 'stop'
const ACT_NAME: Record<Control, string> = { steer: 'Guidance', hold: 'Hold', stop: 'Stop' }
const AS_COMMAND: Record<Control, CommandKind> = { steer: 'guidance', hold: 'hold', stop: 'stop' }

/** The acts a resource's route supports, in order. */
export const supported = (resource: Resource): Control[] =>
  (['steer', 'hold', 'stop'] as const).filter((c) => resource.controls[c] === 'supported')

/** The same, as commands to offer: a resource's owner is offered what its route supports. */
export const routeOffers = (resource: Resource): Offer[] => supported(resource).map((c) => ({ kind: AS_COMMAND[c] }))

/** Whether its owner can act on a session at all here: some control its route supports. */
export const canAct = (resource: Resource) => supported(resource).length > 0

/** What the route's acts are, in words: "Guidance, Hold or Stop", "Hold or Stop". */
export function actsSaid(resource: Resource): string {
  const names = supported(resource).map((c) => ACT_NAME[c])
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1) ?? ''}` : (names[0] ?? '')
}

/** Stop asks first, and says what it can and can't promise. */
export const STOP_WARNING = 'Stop this task? Completed work is kept. Running actions may need time to stop.'

interface Props {
  /** Exactly what the commands are for: the work and its assignment at one generation. */
  target: CommandTarget
  offer: readonly Offer[]
  acts: Acts
}

/**
 * The guidance being written, kept by execution in the page's store: words written for an earlier attempt or another
 * session never reach this one. The words sent leave the field once recorded, if they are still all it holds
 * (command-store.ts). Send waits while a guidance is on its way to this execution, so one press is one request.
 */
function GuidanceField({ acts, target }: { acts: Acts; target: CommandTarget }) {
  const execution = executionOf(target)
  const text = acts.draft(execution)
  const sending = acts
    .of(scopeOf(target))
    .some((k) => k.command.kind === 'guidance' && k.local === 'sending' && sameTarget(k.command.target, target))
  return (
    <form
      className="act-guide"
      onSubmit={(e) => {
        e.preventDefault()
        const words = text.trim()
        if (words && !sending) acts.send('guidance', target, words)
      }}
    >
      <input
        aria-label="Guidance for its session"
        placeholder="Guidance for its session…"
        value={text}
        onChange={(e) => acts.setDraft(execution, e.target.value)}
      />
      <button type="submit" className="pill" disabled={!text.trim() || sending}>
        Send
      </button>
    </form>
  )
}

/** A plain control: Hold or Resume, its tip saying what it does when it isn't plain. */
function ControlButton({ offer, onPress }: { offer: Offer; onPress: () => void }) {
  const label = offer.kind === 'hold' ? 'Hold' : 'Resume'
  return (
    <button
      type="button"
      className={offer.tip ? 'ghost has-tip' : 'ghost'}
      aria-label={offer.tip ? `${label}: ${offer.tip}` : undefined}
      onClick={onPress}
    >
      {label}
      {offer.tip && <Tip label={offer.tip} side="top" />}
    </button>
  )
}

/** The commands offered for one target, each said as it is observed. */
export function SessionActs({ target, offer, acts }: Props) {
  const known = acts.of(scopeOf(target))
  // The execution shown speaks; another attempt's or session's commands are its history, listed under it.
  const latest = known.findLast((k) => sameTarget(k.command.target, target))
  const kinds = new Set(offer.map((o) => o.kind))
  const send = (kind: CommandKind) => acts.send(kind, target)
  const retryable = (k: Known) => retryableNow(k, kinds, target)
  // The boundary itself, not only the button: nothing is sent again unless it may be now.
  const retry = (k: Known) => {
    if (retryable(k)) acts.retry(k.command.operation_id)
  }
  return (
    <div className="session-acts">
      {kinds.has('guidance') && <GuidanceField acts={acts} target={target} />}
      <div className="control-row">
        {offer
          .filter((o) => o.kind === 'hold' || o.kind === 'resume')
          .map((o) => (
            <ControlButton key={o.kind} offer={o} onPress={() => send(o.kind)} />
          ))}
        {kinds.has('stop') && (
          <ConfirmButton
            label="Stop"
            warning={STOP_WARNING}
            confirm="Stop"
            keep="Keep it working"
            onConfirm={() => send('stop')}
          />
        )}
      </div>
      {/* Mounted before anything is said, so each step of the latest is announced as it comes; the rest is read. */}
      <div role="status">{latest && <Steps known={latest} retryable={retryable} onRetry={() => retry(latest)} />}</div>
      <Earlier
        known={known.filter((k) => k !== latest && unresolved(k))}
        shown={target}
        retryable={retryable}
        onRetry={retry}
      />
    </div>
  )
}
