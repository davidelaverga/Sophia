// The board's ports bound to Sophia (WBC-02 G5): a decision's answer, a command on a task, and a task's result, each
// through Sophia's own work routes (api/work.ts), never Paperclip. What each says is what Sophia's receipts say:
// - an answer is recorded, refused (stale, not the decider's, expired) or not confirmed; a reply that never came is not
//   confirmed, and the decision's own memory (answers.ts) sends the same operation again;
// - a command's receipts are handed to the command store as they come, first the admission's, then the operation's as
//   its effect is known, until it settles or is refused; a command that got no reply is lost, and tried again with the
//   same operation (SessionActs);
// - a result is read at its exact version and shown only if its bytes hash to the version's sha256.
import type { WorkCommand, WorkDecisionAnswer, WorkReceipt, WorkResult } from '@sophia/contracts'
import type { SendCommand } from '../../resources/SessionActs.tsx'
import type { Disposition } from './answers.ts'
import type { Decide } from './Decision.tsx'
import type { ReadResult } from './results.ts'

/** How an answer's receipt reads as the decision's disposition. */
export function dispositionOf(receipt: WorkReceipt): Disposition {
  if (receipt.admission === 'recorded') return 'recorded'
  if (receipt.admission === 'unknown') return 'unknown'
  if (receipt.rejection === 'denied') return 'denied'
  return receipt.rejection === 'expired' ? 'expired' : 'conflict'
}

/** A decision port over the answer call. No reply, or one that broke the contract, is not confirmed. */
export const decideWith =
  (answer: (body: WorkDecisionAnswer) => Promise<WorkReceipt>): Decide =>
  async (body) => {
    try {
      return dispositionOf(await answer(body))
    } catch {
      return 'unknown'
    }
  }

/** A receipt past which nothing more will be learnt by asking: refused, settled, or a command with no effect. */
export const settled = (r: WorkReceipt) =>
  r.admission === 'rejected' || r.revision >= 4 || r.effect === 'not_applicable'

export interface Following {
  /** How long between looks at an operation's receipt, and how many looks before the board's own refresh takes over. */
  readonly everyMs: number
  readonly looks: number
  readonly wait: (ms: number) => Promise<void>
}

export const FOLLOWING: Following = {
  everyMs: 2_000,
  looks: 45,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export interface CommandCalls {
  readonly send: (body: WorkCommand) => Promise<WorkReceipt>
  readonly receipt: (operationId: string) => Promise<WorkReceipt>
}

/** Follow an admitted command's receipt until it settles, handing each one on; a look that fails is tried again. */
async function follow(calls: CommandCalls, first: WorkReceipt, on: (r: WorkReceipt) => void, f: Following) {
  let last = first
  for (let look = 0; look < f.looks && !settled(last); look += 1) {
    await f.wait(f.everyMs)
    try {
      last = await calls.receipt(first.operation_id)
      on(last)
    } catch {
      // The next look asks again; the board's refresh says the same in the meantime.
    }
  }
}

/** A command port over the command and receipt calls. A command naming no assignment never leaves. */
export function commandWith(calls: CommandCalls, f: Following = FOLLOWING): SendCommand {
  return (command, on) => {
    const { target } = command
    if (target.assignment_id === null || target.assignment_generation === null) {
      on.lost()
      return
    }
    const body: WorkCommand = {
      operation_id: command.operation_id,
      kind: command.kind,
      ...(command.text === undefined ? {} : { text: command.text }),
      work_id: target.work_id,
      assignment_id: target.assignment_id,
      assignment_generation: target.assignment_generation,
      attempt_id: target.attempt_id,
    }
    void calls.send(body).then(
      (first) => {
        on.receipt(first)
        return follow(calls, first, on.receipt, f)
      },
      () => on.lost(),
    )
  }
}

const VERDICT: Readonly<Record<NonNullable<WorkResult['verdict']>, string>> = {
  supported: 'supported',
  changes_required: 'changes required',
  insufficient_evidence: 'insufficient evidence',
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A result port over the result call: the exact version, shown only when its text hashes to the version's sha256. */
export const readResultWith =
  (read: (workId: string, versionId: string) => Promise<WorkResult>): ReadResult =>
  async (ref) => {
    try {
      const result = await read(ref.work_id, ref.version_id)
      if (result.state !== 'ready' || result.text === undefined || result.sha256 !== ref.sha256) return null
      if ((await sha256Hex(result.text)) !== ref.sha256) return null
      const verdict = result.verdict ? ` · ${VERDICT[result.verdict]}` : ''
      return { text: result.text, label: `Source review${verdict}` }
    } catch {
      return null
    }
  }
