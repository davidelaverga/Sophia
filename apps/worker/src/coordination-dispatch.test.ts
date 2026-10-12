// What the worker makes of the plugin's answers while a company's source reviewer is provisioned (the managed-reviewer
// race): a 503 `reviewer_provisioning` is unknown, so the commission is reconciled by its key and sent again, never
// failed; a 409 `reviewer_missing` stays the definite refusal it was.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import type { CommissionRequest } from '@sophia/coordination'
import { httpPaperclipClient } from './coordination-dispatch.ts'

const workId = randomUUID()
const request: CommissionRequest = {
  companyId: 'company-a',
  envelope: { claims: 'claims', signature: 'signature' },
  commission: {
    key: `sophia-wbc02-${workId}`,
    sophiaProjectId: randomUUID(),
    paperclipProjectId: 'pc-project-a',
    workId,
    title: 'Source review: launch brief',
    description: 'Source text stays in Sophia.',
    initialStatus: 'todo',
    wake: true,
  },
}

/** A plugin that answers every request with `status` and the refusal `code`. */
const answering = (status: number, code: string) =>
  httpPaperclipClient({
    origin: 'http://paperclip.test',
    token: 'board-api-key',
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code, message: 'scripted' } }), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
  })

describe('the plugin client while a source reviewer is provisioned', () => {
  it('takes 503 reviewer_provisioning as unknown, never as a refusal', async () => {
    const answer = await answering(503, 'reviewer_provisioning').commission(request)
    assert.equal(answer.kind, 'unknown')
  })

  it('still takes 409 reviewer_missing as a definite refusal', async () => {
    const answer = await answering(409, 'reviewer_missing').commission(request)
    assert.deepEqual(answer.kind === 'refused' ? [answer.status, answer.code] : answer, [409, 'reviewer_missing'])
  })
})
