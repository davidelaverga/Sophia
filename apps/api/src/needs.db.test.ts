// What needs the calling person (A15, docs/plans/needs-served.md, FND-C2-ATTENTION C2a), through the real app on
// PostgreSQL (level: sql-run). A need leaves where it lives: a decision stays while it waits, whatever is seen; a reply
// leaves through its seen mark, which only moves forward; the list is the person's own.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { parseInvitation, parseNeedList } from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { parseNeedId } from './routes/needs.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const INVITES = { secret: 'invite-test-secret-at-least-32-characters!!', studioUrl: 'https://studio.test' }

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance

const token = (sub: string, claims: Record<string, unknown> = {}) =>
  new SignJWT({ role: 'authenticated', email: `${sub.slice(0, 8)}@sophia.test`, ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

async function call(url: string, bearer: string, method: 'GET' | 'POST' = 'GET', body?: unknown, key = false) {
  const res = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${bearer}`, ...(key ? { 'idempotency-key': randomUUID() } : {}) },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  })
  return { status: res.statusCode, json: res.body ? res.json<Record<string, unknown>>() : null }
}

const needsOf = async (sub: string) => {
  const res = await call('/api/v1/me/needs', await token(sub))
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return parseNeedList(res.json)
}
const seen = async (sub: string, id: string) =>
  (await call(`/api/v1/me/needs/${encodeURIComponent(id)}/seen`, await token(sub), 'POST')).status

async function asOwner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

/** A work decision on its own plan, written as the board writes one (0042), for `decider`. */
async function decision(seed: SeededProject, decider: string, over: { expiresIn?: string; state?: string } = {}) {
  const [plan, work, id] = [randomUUID(), randomUUID(), randomUUID()]
  await asOwner(
    `INSERT INTO sophia.work_plans(project_id,id,goal_id,goal_revision,criteria_ref,mission_revision,recipe,route,work_id,
       assignment_id,source_ids,manifest_source_id,definition,allowance_usd,proposed_by,decision_id)
     VALUES($1,$2,$3,1,'c1',1,'sophia-source-review-v1','paperclip',$4,$5,ARRAY[$6]::uuid[],$6,'{}',0.5,$7,$8)`,
    [seed.projectId, plan, seed.goalId, work, randomUUID(), seed.sourceId, decider, id],
  )
  const state = over.state ?? 'proposed'
  const answered = state === 'accepted' || state === 'declined'
  await asOwner(
    `INSERT INTO sophia.work_decisions(project_id,id,kind,plan_id,plan_revision,work_id,question,decider_id,choices,
       expires_at,state,selected_choice,answered_by,answered_at)
     VALUES($1,$2,'plan_admission',$3,1,$4,$5,$6,'[{"id":"accept"},{"id":"decline"}]',now()+$7::interval,$8,$9,$10,$11)`,
    [
      seed.projectId,
      id,
      plan,
      work,
      `Admit the review plan ${id.slice(0, 4)}?`,
      decider,
      over.expiresIn ?? '1 hour',
      state,
      answered ? 'accept' : null,
      answered ? decider : null,
      answered ? new Date() : null,
    ],
  )
  return { id, work }
}

/** A personal space for `owner` holding `turns` in order: the person's (answered) and Sophia's replies. */
async function space(owner: string, turns: ('person' | 'sophia')[]) {
  const ids: string[] = []
  await asOwner(`INSERT INTO sophia.personal_spaces(owner_id, turn_seq) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    owner,
    0,
  ])
  let asked: string | null = null
  for (const author of turns) {
    const id = randomUUID()
    const [row] = await asOwner<{ seq: string }>(
      `UPDATE sophia.personal_spaces SET turn_seq=turn_seq+1 WHERE owner_id=$1 RETURNING turn_seq AS seq`,
      [owner],
    )
    const seq = row?.seq ?? '0'
    await asOwner(
      `INSERT INTO sophia.personal_turns(owner_id,id,seq,author,body,reply_to,reply,asked_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      author === 'person'
        ? [owner, id, seq, 'person', `My question ${seq}`, null, 'answered', new Date()]
        : [owner, id, seq, 'sophia', `Sophia answers turn ${seq}: the launch moves to Thursday.`, asked, null, null],
    )
    if (author === 'person') asked = id
    ids.push(id)
  }
  return ids
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor, invites: INVITES })
})

after(async () => {
  await app?.close()
  await pool?.end()
  await db?.drop()
})

describe('what needs the calling person (A15)', () => {
  it('lists a decision waiting on them until it is answered, never because it was seen', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { title: 'Pilot', admin, editors: [editor] })
    const mine = await decision(seed, admin)
    await decision(seed, editor) // someone else's
    await decision(seed, admin, { expiresIn: '-1 minute' }) // expired
    await decision(seed, admin, { state: 'accepted' }) // answered
    const list = await needsOf(admin)
    assert.deepEqual(
      list.needs.map((n) => [n.kind, n.ref.kind, n.ref.id, n.ref.within, n.projectId, n.projectTitle]),
      [['decision', 'work_decision', mine.id, mine.work, seed.projectId, 'Pilot']],
    )
    const [need] = list.needs
    assert.ok(need)
    assert.equal(need.id, `decision:${seed.projectId}:${mine.work}:${mine.id}`)
    assert.ok(need.expiresAt && Date.parse(need.expiresAt) > Date.parse(list.readAt))
    // Seen is not answered: 204, and the decision stays.
    assert.equal(await seen(admin, need.id), 204)
    assert.deepEqual(
      (await needsOf(admin)).needs.map((n) => n.id),
      [need.id],
    )
    await asOwner(
      `UPDATE sophia.work_decisions SET state='accepted', selected_choice='accept', answered_by=$2, answered_at=now()
        WHERE id=$1`,
      [mine.id, admin],
    )
    assert.deepEqual((await needsOf(admin)).needs, [])
    // The other decider's is theirs alone.
    assert.equal((await needsOf(editor)).needs.length, 1)
  })

  it('lists a guest at the door to those who can let them in, not to a viewer; it leaves when decided', async () => {
    const [admin, editor, viewer, guest, outsider] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const invited = await call(
      `/api/v1/projects/${seed.projectId}/invitations`,
      await token(editor),
      'POST',
      { kind: 'guest' },
      true,
    )
    assert.equal(invited.status, 200, JSON.stringify(invited.json))
    const link = { token: parseInvitation(invited.json).url.split('#')[1] ?? '' }
    const knock = await call('/api/v1/join/knock', await token(guest, { is_anonymous: true }), 'POST', {
      ...link,
      displayName: 'Rosa',
    })
    assert.equal(knock.status, 200, JSON.stringify(knock.json))
    const entryId = String(knock.json?.id)
    for (const sub of [admin, editor]) {
      const needs = (await needsOf(sub)).needs
      assert.deepEqual(
        needs.map((n) => [n.kind, n.title, n.ref.kind, n.ref.id]),
        [['guest', 'Rosa', 'lobby_entry', entryId]],
      )
      assert.match(needs[0]?.detail ?? '', /^Waiting \d+ (min|h)$/)
    }
    assert.deepEqual((await needsOf(viewer)).needs, [])
    // Someone outside the project reads nothing of it.
    assert.deepEqual((await needsOf(outsider)).needs, [])
    // A guest has no needs of their own.
    assert.equal((await call('/api/v1/me/needs', await token(guest, { is_anonymous: true }))).status, 403)
    assert.equal(
      (await call(`/api/v1/lobby/${entryId}/decision`, await token(editor), 'POST', { decision: 'admit' })).status,
      200,
    )
    assert.deepEqual((await needsOf(admin)).needs, [])
  })

  it('lists Sophia’s replies after the seen mark; only seen moves it, forward only, and a later reply stays', async () => {
    const [ana, other] = [randomUUID(), randomUUID()]
    // A space made after the rollout starts at 0: Ana asked (1), Sophia answered (2), Ana wrote again (3), Sophia
    // answered twice (4, 5). Ana writing again acknowledged nothing (Codex on #390): 2 is unread until seen.
    const [, two, , four, five] = await space(ana, ['person', 'sophia', 'person', 'sophia', 'sophia'])
    const replies = async () => (await needsOf(ana)).needs.filter((n) => n.kind === 'reply').map((n) => n.ref.id)
    assert.deepEqual(await replies(), [five, four, two])
    const fourNeed = (await needsOf(ana)).needs.find((n) => n.ref.id === four)
    assert.equal(fourNeed?.id, `reply:personal:-:${four}`)
    assert.equal(fourNeed?.projectId, null)
    assert.match(fourNeed?.title ?? '', /^Sophia answers turn 4/)
    // Seeing 4 sees what came before it (2) and leaves 5; seeing 2 afterwards never moves the mark back.
    assert.equal(await seen(ana, `reply:personal:-:${four}`), 204)
    assert.deepEqual(await replies(), [five])
    assert.equal(await seen(ana, `reply:personal:-:${two}`), 204)
    assert.deepEqual(await replies(), [five])
    assert.equal(await seen(ana, `reply:personal:-:${four}`), 204) // again: the same
    // A turn of Ana's own, reading her space, reading this list: none of them sees 5.
    await space(ana, ['person'])
    await call('/api/v1/personal', await token(ana))
    assert.deepEqual(await replies(), [five])
    // Nobody else reads or marks them: another person's turn is not theirs (404), and their list has none of Ana's.
    assert.equal(await seen(other, `reply:personal:-:${five}`), 404)
    assert.deepEqual((await needsOf(other)).needs, [])
    assert.deepEqual(await replies(), [five])
    assert.equal(await seen(ana, `reply:personal:-:${five}`), 204)
    assert.deepEqual(await replies(), [])
    // A new reply after the mark is new.
    const [six] = await space(ana, ['sophia'])
    assert.deepEqual(await replies(), [six])
  })

  it('after an erasure the erased replies are gone, and a reply after it is new against the kept mark', async () => {
    const eve = randomUUID()
    const [, two, three] = await space(eve, ['person', 'sophia', 'sophia'])
    assert.equal(await seen(eve, `reply:personal:-:${two}`), 204)
    const replies = async () => (await needsOf(eve)).needs.filter((n) => n.kind === 'reply').map((n) => n.ref.id)
    assert.deepEqual(await replies(), [three])
    const erased = await call('/api/v1/personal/erasure', await token(eve), 'POST', { confirm: 'delete' }, true)
    assert.equal(erased.status, 202, JSON.stringify(erased.json))
    assert.deepEqual(await replies(), [])
    // An erased turn names no need any more.
    assert.equal(await seen(eve, `reply:personal:-:${three}`), 404)
    // The turn order went on from before the erasure (0021), so a late reply is after the mark: new.
    const [late] = await space(eve, ['sophia'])
    assert.deepEqual(await replies(), [late])
  })

  it('refuses an id that names no need: malformed, another kind’s shape, or not this person’s', async () => {
    const ana = randomUUID()
    for (const id of [
      'nonsense',
      'reply:personal:-',
      `reply:${randomUUID()}:-:${randomUUID()}`,
      `decision:personal:-:${randomUUID()}`,
      `reply:personal:-:not-a-uuid`,
      `reply:personal:-:${randomUUID()}`,
      `review:${randomUUID()}:-:x`,
    ])
      assert.equal(await seen(ana, id), 404, id)
    // A well-formed need of another kind changes nothing, whoever's it is: it leaves where it lives.
    assert.equal(await seen(ana, `guest:${randomUUID()}:-:${randomUUID()}`), 204)
  })

  it('reads nothing from a project the person left or that is archived; an empty list is still an answer', async () => {
    const [admin, leaver] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [leaver] })
    await decision(seed, leaver)
    await decision(seed, admin)
    assert.equal((await needsOf(leaver)).needs.length, 1)
    await asOwner(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
      seed.projectId,
      leaver,
    ])
    assert.deepEqual((await needsOf(leaver)).needs, [])
    await asOwner(`UPDATE sophia.projects SET archived_at=now() WHERE id=$1`, [seed.projectId])
    const empty = await needsOf(admin)
    assert.deepEqual(empty.needs, [])
    assert.ok(Date.parse(empty.readAt) > 0)
  })

  it('reads back an id whose parts are escaped, and refuses one that is not four parts', () => {
    assert.deepEqual(parseNeedId(`decision:${'0'.repeat(8)}-0000-4000-8000-000000000001:w%3A1:d%251`), {
      kind: 'decision',
      project: '00000000-0000-4000-8000-000000000001',
      within: 'w:1',
      ref: 'd%1',
    })
    assert.equal(parseNeedId('decision:a:b:c:d'), null)
    assert.equal(parseNeedId('reply:personal:-:%E0%A4%A'), null)
  })
})
