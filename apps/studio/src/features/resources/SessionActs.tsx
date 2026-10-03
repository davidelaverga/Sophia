// Commands on work where it shows (LFE-06.6, WBC-01 G4): guidance, Hold, Resume and Stop, from a resource's row or a
// task's sheet. The caller decides what to offer: a resource's owner what its route supports (Resources), anyone what
// the board's view allows them (a task's sheet). Stop asks first, and promises nothing it can't see.
//
// What happens is said as it is observed, in three dimensions (receipts.ts): Sending before any receipt, then
// recorded or refused, then delivered, then, for a control, its effect once the runtime confirms it. A reply that
// never came is unknown and is tried again with the same operation; so is the same request pressed again. Commands
// and drafts are kept while the page lives (command-store.ts), per space (a project as one viewer sees it) and scope
// (work, assignment, generation): still said after the row closes, the sheet turns or the board unmounts; a late or
// foreign receipt changes nothing, and a session's next assignment starts with none of the old one's. The latest
// command speaks; earlier ones still open stay listed under it, each named, each with its own Try again.
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
  knownSaid,
  reached,
  retryableNow,
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
import type { Resource, Session } from './resource.ts'

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
  draft: (scope: string) => string
  setDraft: (scope: string, text: string) => void
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
    draft: (scope) => state.drafts[scope] ?? '',
    setDraft: (scope, text) => drafted(space, scope, text),
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

/** Earlier commands still open, one line each under the latest: named, and each with its own Try again. */
interface EarlierProps {
  known: readonly Known[]
  retryable: Retryable
  onRetry: (k: Known) => void
}

function Earlier({ known, retryable, onRetry }: EarlierProps) {
  if (known.length === 0) return null
  return (
    <ul className="act-earlier" aria-label="Earlier, still open">
      {known.map((k) => (
        <li key={k.command.operation_id}>
          <span className="act-earlier-kind">{KIND_NAME[k.command.kind]}</span>{' '}
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
      ))}
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

/** A session's work, as a command's target: its assignment and generation when its runtime says them. */
export const sessionTarget = (project: string, session: Session): CommandTarget | null =>
  session.assignment
    ? {
        project_id: project,
        work_id: session.assignment.workId,
        assignment_id: session.assignment.id ?? null,
        assignment_generation: session.assignment.epoch ?? null,
        attempt_id: null,
        session_id: session.id,
      }
    : null

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
 * The guidance being written, kept by scope in the page's store: the words sent leave the field once recorded, if they
 * are still all it holds (command-store.ts). Send waits while a guidance is on its way, so one press is one request.
 */
function GuidanceField({ acts, scope, target }: { acts: Acts; scope: string; target: CommandTarget }) {
  const text = acts.draft(scope)
  const sending = acts.of(scope).some((k) => k.command.kind === 'guidance' && k.local === 'sending')
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
        onChange={(e) => acts.setDraft(scope, e.target.value)}
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
  const scope = scopeOf(target)
  const known = acts.of(scope)
  const latest = known.at(-1)
  const kinds = new Set(offer.map((o) => o.kind))
  const send = (kind: CommandKind) => acts.send(kind, target)
  const retryable = (k: Known) => retryableNow(k, kinds)
  // The boundary itself, not only the button: nothing is sent again unless it may be now.
  const retry = (k: Known) => {
    if (retryable(k)) acts.retry(k.command.operation_id)
  }
  return (
    <div className="session-acts">
      {kinds.has('guidance') && <GuidanceField acts={acts} scope={scope} target={target} />}
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
      <Earlier known={known.slice(0, -1).filter(unresolved)} retryable={retryable} onRetry={retry} />
    </div>
  )
}
