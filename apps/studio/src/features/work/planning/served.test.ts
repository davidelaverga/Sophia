import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import type { WorkCommand, WorkReceipt, WorkResult } from '@sophia/contracts'
import type { Command } from '../../resources/receipts.ts'
import { commandWith, decideWith, dispositionOf, readResultWith, type Following } from './served.ts'

const receipt = (over: Partial<WorkReceipt> = {}): WorkReceipt => ({
  schema_version: 'sophia.work.receipt.v1',
  operation_id: 'op-1',
  receipt_id: 'receipt:x:1',
  project_id: 'p',
  work_id: 'w',
  assignment_id: 'a',
  assignment_generation: 1,
  kind: 'hold',
  revision: 1,
  observed_at: '2026-10-05T12:00:00.000Z',
  admission: 'recorded',
  delivery: 'queued',
  effect: 'pending',
  rejection: null,
  evidence_refs: ['command:c'],
  ...over,
})

const command = (over: Partial<Command['target']> = {}): Command => ({
  operation_id: 'op-1',
  kind: 'hold',
  target: {
    project_id: 'p',
    work_id: 'w',
    assignment_id: 'a',
    assignment_generation: 1,
    attempt_id: 't',
    session_id: null,
    ...over,
  },
})

const instant: Following = { everyMs: 0, looks: 5, wait: () => Promise.resolve() }
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('the board’s ports bound to Sophia', () => {
  it('reads an answer’s receipt as the decision’s disposition', () => {
    assert.equal(
      dispositionOf(receipt({ admission: 'recorded', effect: 'choice_recorded', kind: 'decision' })),
      'recorded',
    )
    assert.equal(dispositionOf(receipt({ admission: 'rejected', rejection: 'denied' })), 'denied')
    assert.equal(dispositionOf(receipt({ admission: 'rejected', rejection: 'expired' })), 'expired')
    assert.equal(dispositionOf(receipt({ admission: 'rejected', rejection: 'conflict' })), 'conflict')
    assert.equal(dispositionOf(receipt({ admission: 'rejected', rejection: 'unavailable' })), 'conflict')
    assert.equal(dispositionOf(receipt({ admission: 'unknown' })), 'unknown')
  })

  it('says an answer whose reply never came is not confirmed, never refused', async () => {
    const decide = decideWith(() => Promise.reject(new Error('no reply')))
    const answer = {
      operation_id: 'o',
      decision_id: 'd',
      revision: 1,
      choice: 'accept',
      work_id: 'w',
      plan_id: 'p',
      plan_revision: 1,
      candidate_version_ref: null,
    }
    assert.equal(await decide(answer), 'unknown')
  })

  it('sends a command at its exact target, then follows its receipt until it settles', async () => {
    const sent: WorkCommand[] = []
    const seen: unknown[] = []
    const later = [
      receipt({ revision: 2, delivery: 'delivered' }),
      receipt({ revision: 4, delivery: 'delivered', effect: 'held' }),
    ]
    const port = commandWith(
      {
        send: (body) => {
          sent.push(body)
          return Promise.resolve(receipt())
        },
        receipt: () => Promise.resolve(later.shift() ?? receipt({ revision: 4, effect: 'held' })),
      },
      instant,
    )
    port(command(), { receipt: (r) => seen.push(r), lost: () => seen.push('lost') })
    await settle()
    assert.deepEqual(sent, [
      {
        operation_id: 'op-1',
        kind: 'hold',
        work_id: 'w',
        assignment_id: 'a',
        assignment_generation: 1,
        attempt_id: 't',
      },
    ])
    assert.deepEqual(
      seen.map((r) => (r as WorkReceipt).revision),
      [1, 2, 4],
      'the admission, then each look, and nothing after the effect settled',
    )
  })

  it('stops following a refused command, and says a command with no reply is lost', async () => {
    const seen: unknown[] = []
    let looks = 0
    const refused = commandWith(
      {
        send: () =>
          Promise.resolve(
            receipt({ admission: 'rejected', rejection: 'conflict', delivery: 'not_sent', effect: 'not_applicable' }),
          ),
        receipt: () => {
          looks += 1
          return Promise.resolve(receipt())
        },
      },
      instant,
    )
    refused(command(), { receipt: (r) => seen.push(r), lost: () => seen.push('lost') })
    const silent = commandWith(
      { send: () => Promise.reject(new Error('timeout')), receipt: () => Promise.resolve(receipt()) },
      instant,
    )
    silent(command(), { receipt: (r) => seen.push(r), lost: () => seen.push('lost') })
    await settle()
    assert.equal(looks, 0)
    assert.equal(seen.length, 2)
    assert.equal(seen[1], 'lost')
  })

  it('never sends a command that names no assignment', () => {
    const seen: string[] = []
    commandWith(
      { send: () => Promise.reject(new Error('must not be called')), receipt: () => Promise.reject(new Error('no')) },
      instant,
    )(command({ assignment_id: null, assignment_generation: null }), {
      receipt: () => seen.push('receipt'),
      lost: () => seen.push('lost'),
    })
    assert.deepEqual(seen, ['lost'])
  })

  it('shows a result only when its text hashes to the exact version’s sha256', async () => {
    const text = '## Goal\nCheck the brief.'
    const sha256 = createHash('sha256').update(text).digest('hex')
    const ready = (over: Partial<WorkResult> = {}): WorkResult => ({
      state: 'ready',
      workId: 'w',
      sourceId: 's',
      versionId: 's',
      sha256,
      text,
      verdict: 'changes_required',
      ...over,
    })
    const ref = { work_id: 'w', source_id: 's', version_id: 's', sha256, media_type: 'text/markdown' }
    assert.deepEqual(await readResultWith(() => Promise.resolve(ready()))(ref, 'read'), {
      text,
      label: 'Source review · changes required',
    })
    assert.equal(
      await readResultWith(() => Promise.resolve(ready({ text: `${text} (altered)` })))(ref, 'read'),
      null,
      'bytes that do not match',
    )
    assert.equal(
      await readResultWith(() =>
        Promise.resolve({ state: 'withdrawn', workId: 'w', reason: 'An input was withdrawn' }),
      )(ref, 'read'),
      null,
    )
    assert.equal(await readResultWith(() => Promise.reject(new Error('down')))(ref, 'read'), null)
  })
})
