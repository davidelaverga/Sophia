// WBC-02 G1/G2: the sophia.coordination plugin's routes over a synthetic Paperclip (memory-host.ts) whose namespace is
// a real PostgreSQL schema with the plugin's migration. Level: sql-run against the plugin's own tables; the pinned
// host's issue services are stood in for, never claimed. INT-02 (forged, expired, replayed, cross-company and
// unmapped requests change nothing), INT-05 (a lost reply is answered by the same issue; a concurrent create is
// serialized) and the control mirror.
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import pg from 'pg'
import { signEnvelope, type EnvelopeOp } from '@sophia/coordination/envelope'
import {
  COMMISSION_ORIGIN_KIND,
  ROUTES,
  type Commission,
  type Control,
  type Lookup,
} from '@sophia/coordination/plugin-wire'
import { createEmptyDatabase, type EmptyDatabase } from '@sophia/test-support'
import {
  installNamespace,
  memoryPaperclip,
  NAMESPACE,
  type MemoryPaperclip,
  type MemoryPaperclipOptions,
} from './memory-host.ts'

const sophia = generateKeyPairSync('ed25519')
const forger = generateKeyPairSync('ed25519')
const COMPANY = 'company-a'
const OTHER_COMPANY = 'company-b'
const PROJECT = 'pc-project-a'
const SOPHIA_PROJECT = randomUUID()
const NOW = 1_800_000_000

let db: EmptyDatabase
let client: pg.Client

before(async () => {
  db = await createEmptyDatabase('sophia_pc')
  client = new pg.Client({ connectionString: db.ownerUrl })
  await client.connect()
  await installNamespace(client)
})
after(async () => {
  await client.end()
  await db.drop()
})
beforeEach(async () => {
  await client.query(`TRUNCATE ${NAMESPACE}.controls, ${NAMESPACE}.commissions, ${NAMESPACE}.envelope_nonces`)
})

const config = {
  signingPublicKey: sophia.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  integrationUserId: 'user-sophia-integration',
  projects: [{ sophiaProjectId: SOPHIA_PROJECT, companyId: COMPANY, paperclipProjectId: PROJECT }],
}

const paperclip = (over: Partial<MemoryPaperclipOptions> = {}): MemoryPaperclip =>
  memoryPaperclip(client, { config, now: () => NOW, ...over })

function commissionOf(workId = randomUUID()): Commission {
  return {
    key: `sophia-wbc02-${workId}`,
    sophiaProjectId: SOPHIA_PROJECT,
    paperclipProjectId: PROJECT,
    workId,
    title: 'Source review: launch brief',
    description: 'Review two selected sources against the plan’s criteria. Source text stays in Sophia.',
    initialStatus: 'todo',
    wake: true,
  }
}

interface Sign {
  readonly op: EnvelopeOp
  readonly deliveryKey: string
  readonly companyId?: string
  readonly key?: typeof sophia.privateKey
  readonly iat?: number
}

function envelope(c: { workId: string; commissionKey: string }, body: unknown, s: Sign) {
  const iat = s.iat ?? NOW
  return signEnvelope(
    {
      op: s.op,
      companyId: s.companyId ?? COMPANY,
      paperclipProjectId: PROJECT,
      sophiaProjectId: SOPHIA_PROJECT,
      workId: c.workId,
      commissionKey: c.commissionKey,
      deliveryKey: s.deliveryKey,
      initiator: { kind: 'member', id: randomUUID() },
      nonce: randomUUID(),
      iat,
      exp: iat + 120,
    },
    body,
    s.key ?? sophia.privateKey,
  )
}

const commissionRequest = (c: Commission, s: Partial<Sign> = {}) => ({
  routeKey: 'commission',
  params: {},
  companyId: s.companyId ?? COMPANY,
  body: {
    companyId: s.companyId ?? COMPANY,
    envelope: envelope({ workId: c.workId, commissionKey: c.key }, c, {
      op: 'commission',
      deliveryKey: `commission-${c.workId}`,
      ...s,
    }),
    commission: c,
  },
})

const lookupRequest = (c: Commission) => {
  const lookup: Lookup = { key: c.key, sophiaProjectId: SOPHIA_PROJECT, workId: c.workId }
  return {
    routeKey: 'lookup',
    params: {},
    companyId: COMPANY,
    body: {
      companyId: COMPANY,
      envelope: envelope({ workId: c.workId, commissionKey: c.key }, lookup, {
        op: 'lookup',
        deliveryKey: `lookup-${c.workId}`,
      }),
      lookup,
    },
  }
}

const controlRequest = (c: Commission, issueId: string, op: Control['op'], key: string, signedOp: EnvelopeOp = op) => {
  const control: Control = { op, key, commissionKey: c.key, sophiaProjectId: SOPHIA_PROJECT, workId: c.workId }
  return {
    routeKey: 'control',
    params: { issueId },
    companyId: COMPANY,
    body: {
      envelope: envelope({ workId: c.workId, commissionKey: c.key }, control, { op: signedOp, deliveryKey: key }),
      control,
    },
  }
}

const code = (body: unknown): unknown =>
  typeof body === 'object' && body !== null && 'error' in body ? body.error : body

describe('commission', () => {
  it('creates one core issue assigned to the source reviewer, with the commission origin, and wakes it', async () => {
    const p = paperclip()
    const c = commissionOf()
    const res = await p.request(commissionRequest(c))
    assert.equal(res.status, 200)
    const issue = [...p.issues.values()][0]
    assert.ok(issue)
    assert.deepEqual(res.body, { outcome: 'created', issueId: issue.id, status: 'todo', wakeQueued: true })
    assert.equal(issue.assigneeAgentId, 'agent-source-reviewer')
    assert.equal(issue.originKind, COMMISSION_ORIGIN_KIND)
    assert.equal(issue.originId, c.key)
    assert.equal(issue.billingCode, `sophia:${c.workId}`)
    assert.equal(issue.projectId, PROJECT)
    assert.ok(!JSON.stringify(issue).includes('BEGIN PRIVATE KEY'))
    assert.deepEqual(p.wakeups, [{ issueId: issue.id, idempotencyKey: c.key }])
  })

  it('answers a resend whose first reply was lost with the same issue (INT-05)', async () => {
    const p = paperclip()
    const c = commissionOf()
    const first = await p.request(commissionRequest(c))
    const again = await p.request(commissionRequest(c))
    assert.equal(p.issues.size, 1)
    assert.equal(again.status, 200)
    assert.deepEqual(again.body, {
      outcome: 'existing',
      issueId: [...p.issues.keys()][0],
      status: 'todo',
      wakeQueued: false,
    })
    assert.notDeepEqual(first.body, again.body)
  })

  it('does not wake a commission that starts blocked', async () => {
    const p = paperclip()
    await p.request(commissionRequest({ ...commissionOf(), initialStatus: 'blocked' }))
    assert.equal(p.wakeups.length, 0)
  })

  it('serializes concurrent creates of one key: one creates, the other is told to reconcile (503)', async () => {
    const gate = Promise.withResolvers<void>()
    const p = paperclip({ beforeCreate: () => gate.promise })
    const c = commissionOf()
    const first = p.request(commissionRequest(c))
    await new Promise((resolve) => setTimeout(resolve, 50))
    const second = await p.request(commissionRequest(c))
    const pending = await p.request(lookupRequest(c))
    gate.resolve()
    assert.equal(second.status, 503)
    assert.deepEqual(code(second.body), {
      code: 'commission_in_progress',
      message: 'Another request is creating this commission; reconcile by its key',
    })
    assert.equal(pending.status, 503, 'a create in flight is not proof of absence')
    assert.equal((await first).status, 200)
    assert.equal(p.issues.size, 1)
    const found = await p.request(lookupRequest(c))
    assert.deepEqual(found.body, { outcome: 'found', issueId: [...p.issues.keys()][0], status: 'todo' })
  })

  it('proves absence of a key no create ever claimed', async () => {
    const res = await paperclip().request(lookupRequest(commissionOf()))
    assert.deepEqual(res.body, { outcome: 'absent' })
  })

  it('refuses when the reviewer agent is not provisioned, creating nothing', async () => {
    const p = paperclip({ reviewerAgentId: null })
    const res = await p.request(commissionRequest(commissionOf()))
    assert.equal(res.status, 409)
    assert.equal(p.issues.size, 0)
  })
})

describe('refusals change nothing (INT-02)', () => {
  const refused = async (
    p: MemoryPaperclip,
    request: Parameters<MemoryPaperclip['request']>[0],
    status: number,
    errorCode: string,
  ) => {
    const res = await p.request(request)
    assert.equal(res.status, status, JSON.stringify(res.body))
    assert.equal((code(res.body) as { code: string }).code, errorCode)
    assert.equal(p.issues.size, 0)
    assert.equal(p.wakeups.length, 0)
  }

  it('a forged signature', async () => {
    await refused(
      paperclip(),
      commissionRequest(commissionOf(), { key: forger.privateKey }),
      403,
      'envelope_bad_signature',
    )
  })

  it('a body changed after signing', async () => {
    const c = commissionOf()
    const request = commissionRequest(c)
    await refused(
      paperclip(),
      { ...request, body: { ...request.body, commission: { ...c, title: 'Something else' } } },
      403,
      'envelope_digest_mismatch',
    )
  })

  it('an expired envelope', async () => {
    await refused(paperclip(), commissionRequest(commissionOf(), { iat: NOW - 600 }), 401, 'envelope_expired')
  })

  it('a replayed envelope', async () => {
    const p = paperclip()
    const request = commissionRequest(commissionOf())
    assert.equal((await p.request(request)).status, 200)
    const res = await p.request(request)
    assert.equal(res.status, 409)
    assert.equal(p.issues.size, 1)
  })

  it('an envelope for another company', async () => {
    const c = commissionOf()
    const request = commissionRequest(c, { companyId: OTHER_COMPANY })
    await refused(
      paperclip(),
      { ...request, companyId: COMPANY, body: { ...request.body, companyId: COMPANY } },
      403,
      'envelope_wrong_company',
    )
  })

  it('a company the Sophia project is not mapped to', async () => {
    await refused(paperclip(), commissionRequest(commissionOf(), { companyId: OTHER_COMPANY }), 403, 'not_mapped')
  })

  it('an envelope signed for another operation', async () => {
    const c = commissionOf()
    await refused(paperclip(), commissionRequest(c, { op: 'lookup' }), 403, 'envelope_wrong_operation')
  })

  it('an agent or another board user', async () => {
    const request = commissionRequest(commissionOf())
    await refused(
      paperclip(),
      { ...request, actor: { actorType: 'agent', actorId: 'agent-x' } },
      403,
      'not_integration_principal',
    )
    await refused(
      paperclip(),
      { ...request, actor: { actorType: 'user', actorId: 'user-other', userId: 'user-other' } },
      403,
      'not_integration_principal',
    )
  })

  it('a plugin with no configuration', async () => {
    await refused(paperclip({ config: {} }), commissionRequest(commissionOf()), 503, 'not_configured')
  })

  it('a malformed body', async () => {
    await refused(
      paperclip(),
      { routeKey: 'commission', params: {}, companyId: COMPANY, body: { companyId: COMPANY } },
      422,
      'invalid_request',
    )
  })
})

describe('control', () => {
  async function commissioned() {
    const p = paperclip()
    const c = commissionOf()
    await p.request(commissionRequest(c))
    const issueId = [...p.issues.keys()][0] ?? ''
    return { p, c, issueId }
  }

  it('mirrors Hold, Resume and Stop onto the issue, idempotently per delivery', async () => {
    const { p, c, issueId } = await commissioned()
    const hold = await p.request(controlRequest(c, issueId, 'hold', 'hold-1'))
    assert.deepEqual(hold.body, { outcome: 'applied', issueId, status: 'blocked', wakeQueued: false })
    const again = await p.request(controlRequest(c, issueId, 'hold', 'hold-1'))
    assert.deepEqual(again.body, { outcome: 'already', issueId, status: 'blocked', wakeQueued: false })
    const resume = await p.request(controlRequest(c, issueId, 'resume', 'resume-1'))
    assert.deepEqual(resume.body, { outcome: 'applied', issueId, status: 'todo', wakeQueued: true })
    const stop = await p.request(controlRequest(c, issueId, 'stop', 'stop-1'))
    assert.deepEqual(stop.body, { outcome: 'applied', issueId, status: 'cancelled', wakeQueued: false })
    const rows = await client.query(`SELECT op FROM ${NAMESPACE}.controls ORDER BY applied_at, op`)
    assert.deepEqual(rows.rows.map((r: { op: string }) => r.op).toSorted(), ['hold', 'resume', 'stop'])
  })

  it('refuses a control on an issue that does not hold the commission', async () => {
    const { p, c } = await commissioned()
    const other = await p.request(commissionRequest(commissionOf()))
    const otherIssue = (other.body as { issueId: string }).issueId
    const res = await p.request(controlRequest(c, otherIssue, 'stop', 'stop-x'))
    assert.equal(res.status, 403)
    assert.equal(p.issues.get(otherIssue)?.status, 'todo')
  })

  it('refuses a control whose envelope names another operation', async () => {
    const { p, c, issueId } = await commissioned()
    const res = await p.request(controlRequest(c, issueId, 'stop', 'stop-2', 'resume'))
    assert.equal(res.status, 403)
    assert.equal(p.issues.get(issueId)?.status, 'todo')
  })

  it('routes no unknown key', async () => {
    const res = await paperclip().request({ routeKey: 'admin', params: {}, companyId: COMPANY, body: {} })
    assert.equal(res.status, 404)
  })

  it('keeps routes under the plugin namespace path', () => {
    assert.equal(ROUTES.control('a b'), '/issues/a%20b/control')
  })
})
