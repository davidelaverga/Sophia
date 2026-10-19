// A member searches the project's current words (A38, docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md, FND-C4),
// through the real app on PostgreSQL as the restricted API role (level: sql-run), every page read with the generated
// parser: report sections by their words and as the viewer names them; notes, decisions and messages as the brief and
// the chat show them to this reader; nothing of another project, a former member, or words since withdrawn, corrected
// away, made ineligible or superseded; pages on a unique microsecond key; the bounds of a query.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import type { ContributionActPreview, SearchHit } from '@sophia/contracts'
import {
  parseContributionActPreview,
  parseContributionReceipt,
  parseDiscussionPage,
  parseMissionReceipt,
  parseMissionWithdrawalPreview,
  parseSearchPage,
} from '@sophia/contracts/validate'
import { checkRoleSafety, createPool, shownReach, withActor } from '@sophia/persistence'
import { sectionsOf } from '@sophia/report/markdown'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated', email: `${sub.slice(0, 8)}@sophia.test` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

async function call(sub: string, url: string, o: { body?: unknown; key?: string } = {}) {
  const res = await app.inject({
    method: o.body === undefined ? 'GET' : 'POST',
    url,
    headers: { authorization: `Bearer ${await token(sub)}`, ...(o.key ? { 'idempotency-key': o.key } : {}) },
    ...(o.body === undefined ? {} : { payload: o.body as Record<string, unknown> }),
  })
  return { status: res.statusCode, json: res.body ? res.json<Record<string, unknown>>() : null, raw: res.body }
}

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

const searchUrl = (projectId: string, q: string, cursor?: string | null) =>
  `/api/v1/projects/${projectId}/search?${new URLSearchParams({ q, ...(cursor ? { cursor } : {}) }).toString()}`

/** One page, parsed by the generated parser. */
async function page(sub: string, projectId: string, q: string, cursor?: string | null) {
  const res = await call(sub, searchUrl(projectId, q, cursor))
  assert.equal(res.status, 200, res.raw)
  return parseSearchPage(res.json)
}

/** Every page in turn: the hits and each page's size. */
async function all(sub: string, projectId: string, q: string) {
  const hits: SearchHit[] = []
  const sizes: number[] = []
  let cursor: string | null = null
  do {
    const p = await page(sub, projectId, q, cursor)
    hits.push(...p.hits)
    sizes.push(p.hits.length)
    cursor = p.next
  } while (cursor)
  return { hits, sizes }
}

/** What a hit is, in a line: kind, record and anchor. */
const what = (h: SearchHit) => `${h.kind} ${h.id}${h.cite.anchor ? ` ${h.cite.anchor}` : ''}`

const found = async (sub: string, projectId: string, q: string) => (await all(sub, projectId, q)).hits

const messages = (projectId: string) => `/api/v1/projects/${projectId}/contributions`

async function say(sub: string, projectId: string, text: string) {
  const res = await call(sub, messages(projectId), {
    body: { intent: 'discuss', text, source: null, threadId: null, artifactVersionId: null },
    key: randomUUID(),
  })
  assert.equal(res.status, 202, res.raw)
  return parseContributionReceipt(res.json)
}

/** A message that shares a source, by `sub`, through the API (0068's submit decides whether they may). */
async function share(sub: string, projectId: string, source: { sourceId: string; sha256: string }) {
  const [p] = await owner<{ e: string }>(`SELECT eligibility_revision AS e FROM sophia.projects WHERE id=$1`, [
    projectId,
  ])
  const res = await call(sub, messages(projectId), {
    body: {
      intent: 'discuss',
      text: null,
      source: { ...source, eligibilityRevision: Number(p?.e) },
      threadId: null,
      artifactVersionId: null,
    },
    key: randomUUID(),
  })
  assert.equal(res.status, 202, res.raw)
  return parseContributionReceipt(res.json)
}

const proof = (p: ContributionActPreview) => ({
  expectedRevision: p.revision,
  reach: p.reach.map(({ taskId, kind, restarts }) => ({ taskId, kind, restarts })),
  previewToken: p.previewToken,
})

async function act(sub: string, projectId: string, id: string, action: 'correct' | 'withdraw', text?: string) {
  const shown = await call(sub, `${messages(projectId)}/${id}/preview?action=${action}`)
  assert.equal(shown.status, 200, shown.raw)
  const res = await call(sub, `${messages(projectId)}/${id}/${action === 'correct' ? 'correction' : 'withdrawal'}`, {
    body: { ...(text === undefined ? {} : { text }), ...proof(parseContributionActPreview(shown.json)) },
    key: randomUUID(),
  })
  assert.equal(res.status, 200, res.raw)
}

/** The chat as this reader reads it (A23 with revisions): the ids of the messages it shows. */
async function chat(sub: string, projectId: string, anchor?: string) {
  const res = await call(
    sub,
    `/api/v1/projects/${projectId}/discussion?revisions=1${anchor ? `&before=${anchor}` : ''}`,
  )
  assert.equal(res.status, 200, res.raw)
  return parseDiscussionPage(res.json)
}

/** A text source of the project, kept by `ownerId` (0012's put_text_source), as the owner writes one. */
async function textSource(projectId: string, ownerId: string, text: string) {
  const [s] = await owner<{ id: string; sha256: string }>(
    `SELECT (s).id, (s).sha256 FROM (SELECT sophia.put_text_source($1,$2,'text/markdown',$3) AS s) x`,
    [projectId, ownerId, text],
  )
  assert.ok(s)
  return { sourceId: s.id, sha256: s.sha256 }
}

/**
 * A Markdown report with published versions, one per text (the last stable, the earlier superseded), each its own
 * source, as a research result publishes them.
 */
async function report(seed: { projectId: string; goalId: string }, by: string, title: string, texts: string[]) {
  const [artifact] = await owner<{ id: string }>(
    `INSERT INTO sophia.artifacts(project_id,title,format) VALUES($1,$2,'markdown') RETURNING id`,
    [seed.projectId, title],
  )
  assert.ok(artifact)
  const versions: { id: string; sourceId: string; sha256: string }[] = []
  for (const [i, text] of texts.entries()) {
    const s = await textSource(seed.projectId, by, text)
    const [v] = await owner<{ id: string }>(
      `INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,
         authority_epoch,state,version_number,created_at)
       VALUES($1,$2,$3,$4,$5,$6,1,1,$7,$8,now() - make_interval(mins => $9)) RETURNING id`,
      [
        seed.projectId,
        artifact.id,
        versions.at(-1)?.id ?? null,
        s.sourceId,
        s.sha256,
        seed.goalId,
        i === texts.length - 1 ? 'stable' : 'superseded',
        i + 1,
        texts.length - i,
      ],
    )
    assert.ok(v)
    versions.push({ id: v.id, ...s })
  }
  await owner(`UPDATE sophia.artifacts SET stable_version_id=$2 WHERE id=$1`, [artifact.id, versions.at(-1)?.id])
  return { artifactId: artifact.id, versions }
}

async function note(sub: string, projectId: string, text: string) {
  const res = await call(sub, `/api/v1/projects/${projectId}/mission/entries`, {
    body: { kind: 'observation', epistemic: 'observed', text },
    key: randomUUID(),
  })
  assert.equal(res.status, 202, res.raw)
  return parseMissionReceipt(res.json)
}

async function propose(sub: string, projectId: string, statement: string, supportingEntryIds: string[] = []) {
  const res = await call(sub, `/api/v1/projects/${projectId}/mission/proposals`, {
    body: { kind: 'constraint', statement, ...(supportingEntryIds.length ? { supportingEntryIds } : {}) },
    key: randomUUID(),
  })
  assert.equal(res.status, 202, res.raw)
  return String(res.json?.decisionId)
}

async function decide(sub: string, projectId: string, decisionId: string, decision: 'accept' | 'reject') {
  const res = await call(sub, `/api/v1/projects/${projectId}/mission/proposals/${decisionId}/decision`, {
    body: { decision, expectedRevision: 1 },
    key: randomUUID(),
  })
  assert.equal(res.status, 202, res.raw)
}

/** A note forgotten through the signed mission preview and withdrawal (0018, 0041). */
async function forget(sub: string, projectId: string, entryId: string) {
  const path = `/api/v1/projects/${projectId}/mission/entries/${entryId}/withdrawal`
  const shown = await call(sub, path)
  assert.equal(shown.status, 200, shown.raw)
  const res = await call(sub, path, {
    body: shownReach(parseMissionWithdrawalPreview(shown.json)),
    key: randomUUID(),
  })
  assert.equal(res.status, 202, res.raw)
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor })
})

after(async () => {
  await app?.close()
  await pool?.end()
  await db?.drop()
})

describe('project search (A38)', () => {
  it('finds a report section by its words, a repeated heading by its occurrence, the title and preamble as the report, at its current version', async () => {
    const [admin, viewer] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, viewers: [viewer] })
    const r = await report(seed, admin, 'Kiosk pilot', [
      [
        'Before any heading: the pelican ledger.',
        '',
        '## Costs',
        'The vendor quoted 9,400 for the quillwort.',
        '',
        '```',
        '## Not a heading inside a fence',
        '```',
        '## Risks',
        'Nothing quillwort here? No: risks only.',
        '## Costs',
        'Second costs: the zylophone line.',
      ].join('\n'),
    ])
    const current = r.versions[0]
    assert.ok(current)
    // The viewer is a member too: search is for every active member.
    const section = await found(viewer, seed.projectId, 'zylophone')
    assert.deepEqual(section.map(what), [`report_section ${r.artifactId} costs#1`])
    assert.deepEqual(section[0]?.cite, { recordId: current.id, sha256: current.sha256, anchor: 'costs#1' })
    assert.equal(section[0]?.title, 'Kiosk pilot · Costs')
    assert.match(section[0]?.snippet ?? '', /zylophone/)
    assert.equal(section[0]?.before, undefined, 'only a message has a neighbour')
    // Two sections and a heading: the first repeat has no #0; the fence's heading is no section.
    assert.deepEqual((await found(viewer, seed.projectId, 'quillwort')).map(what).toSorted(), [
      `report_section ${r.artifactId} costs`,
      `report_section ${r.artifactId} risks`,
    ])
    // A fenced line is the section's words, never a heading of its own.
    assert.deepEqual((await found(viewer, seed.projectId, 'fence')).map(what), [`report_section ${r.artifactId} costs`])
    assert.deepEqual(
      (await found(viewer, seed.projectId, 'costs')).map((h) => h.cite.anchor),
      ['costs', 'costs#1'],
    )
    // The text before the first heading, and the title, are the report itself.
    assert.deepEqual((await found(viewer, seed.projectId, 'pelican')).map(what), [`report ${r.artifactId}`])
    const titled = await found(viewer, seed.projectId, 'kiosk')
    assert.deepEqual(titled.map(what), [`report ${r.artifactId}`])
    assert.equal(titled[0]?.cite.recordId, current.id)
    // Prefixes, every word required.
    assert.deepEqual((await found(viewer, seed.projectId, 'zylo seco')).map(what), [
      `report_section ${r.artifactId} costs#1`,
    ])
    assert.deepEqual(await found(viewer, seed.projectId, 'zylophone pelican'), [])
    // What it opens is read again as the member, at that version.
    const versions = await call(viewer, `/api/v1/artifacts/${r.artifactId}/versions`)
    assert.equal(versions.status, 200)
    assert.ok(JSON.stringify(versions.json).includes(current.id))
    const stranger = await call(randomUUID(), `/api/v1/artifacts/${r.artifactId}/versions`)
    assert.notEqual(stranger.status, 200)
  })

  it('searches the current version only: a superseded version’s removed words are not found', async () => {
    const admin = randomUUID()
    const seed = await seedProject(db.ownerUrl, { admin })
    const r = await report(seed, admin, 'Door study', [
      '## Findings\nThe obsoletum count was wrong.',
      '## Findings\nThe recountum is right.',
    ])
    assert.deepEqual(await found(admin, seed.projectId, 'obsoletum'), [])
    const now = await found(admin, seed.projectId, 'recountum')
    assert.deepEqual(now.map(what), [`report_section ${r.artifactId} findings`])
    assert.equal(now[0]?.cite.recordId, r.versions[1]?.id)
  })

  it('finds current notes and proposed or accepted decisions; not a forgotten note, a rejected decision or one withdrawn with its note', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const kept = await note(editor, projectId, 'The capybara count is 12.\nSecond line.')
    const proposed = await propose(editor, projectId, 'Keep the capybara gate open.')
    const accepted = await propose(editor, projectId, 'Capybara signs at the door.')
    await decide(admin, projectId, accepted, 'accept')
    const rejected = await propose(editor, projectId, 'Capybara banned.')
    await decide(admin, projectId, rejected, 'reject')
    const hits = await found(editor, projectId, 'capybara')
    assert.deepEqual(
      hits.map(what).toSorted(),
      [`decision ${accepted}`, `decision ${proposed}`, `note ${kept.entryId}`].toSorted(),
    )
    const n = hits.find((h) => h.kind === 'note')
    assert.equal(n?.title, 'The capybara count is 12.', 'a note’s first line')
    assert.equal(n?.cite.sha256, kept.sha256)
    // A note forgotten, with the proposal it supported: neither is found.
    const gone = await note(editor, projectId, 'The axolotl tank leaks.')
    const withIt = await propose(editor, projectId, 'Fix the axolotl tank.', [String(gone.entryId)])
    assert.equal((await found(editor, projectId, 'axolotl')).length, 2)
    await forget(editor, projectId, String(gone.entryId))
    const [d] = await owner<{ state: string; proposal: unknown }>(
      `SELECT state, proposal FROM sophia.decisions WHERE id=$1`,
      [withIt],
    )
    assert.deepEqual([d?.state, d?.proposal], ['withdrawn', null])
    assert.deepEqual(await found(editor, projectId, 'axolotl'), [])
  })

  it('finds a message by exactly the words the chat shows this reader: written, a shared report, a private source only for its owner, none once ineligible, withdrawn or corrected away', async () => {
    const [admin, a, b] = [randomUUID(), randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [a, b] })
    const { projectId } = seed
    // Written words, then corrected: the old words are erased, the new ones found.
    const written = await say(a, projectId, 'The heron arrives at nine.')
    assert.deepEqual((await found(b, projectId, 'heron')).map(what), [`message ${written.contributionId}`])
    await act(a, projectId, written.contributionId, 'correct', 'The egret arrives at ten.')
    assert.deepEqual(await found(b, projectId, 'heron'), [])
    assert.deepEqual((await found(b, projectId, 'egret')).map(what), [`message ${written.contributionId}`])
    // Withdrawn: gone.
    const withdrawn = await say(a, projectId, 'The bittern is late.')
    await act(a, projectId, withdrawn.contributionId, 'withdraw')
    assert.deepEqual(await found(b, projectId, 'bittern'), [])
    // A shared report: its words found as the message too (and as the report's section): both are places B sees.
    const r = await report(seed, admin, 'Marsh survey', ['## Birds\nThe spoonbill nests here.'])
    const v = r.versions[0]
    assert.ok(v)
    const shared = await share(a, projectId, { sourceId: v.sourceId, sha256: v.sha256 })
    const both = await found(b, projectId, 'spoonbill')
    assert.deepEqual(both.map(what).toSorted(), [
      `message ${shared.contributionId}`,
      `report_section ${r.artifactId} birds`,
    ])
    const sharedHit = both.find((h) => h.kind === 'message')
    assert.equal(sharedHit?.cite.sha256, v.sha256)
    // A's own private source, shared by A: A's chat shows it and A finds it; B's chat doesn't, and B doesn't.
    const mine = await textSource(projectId, a, 'The kingfisher plan, mine alone.')
    await owner(`UPDATE sophia.source_objects SET scope='private' WHERE id=$1`, [mine.sourceId])
    const privately = await share(a, projectId, mine)
    const shows = async (sub: string, id: string) => (await chat(sub, projectId)).entries.some((e) => e.id === id)
    assert.equal(await shows(a, privately.contributionId), true)
    assert.equal(await shows(b, privately.contributionId), false)
    assert.deepEqual((await found(a, projectId, 'kingfisher')).map(what), [`message ${privately.contributionId}`])
    assert.deepEqual(await found(b, projectId, 'kingfisher'), [])
    // A project source shared, then made ineligible: gone for B as from B's chat; its owner A still reads it.
    const later = await textSource(projectId, a, 'The cormorant count.')
    const sharedLater = await share(a, projectId, later)
    assert.equal((await found(b, projectId, 'cormorant')).length, 1)
    await owner(`UPDATE sophia.source_objects SET eligible=false WHERE id=$1`, [later.sourceId])
    assert.equal(await shows(b, sharedLater.contributionId), false)
    assert.deepEqual(await found(b, projectId, 'cormorant'), [])
    assert.equal(await shows(a, sharedLater.contributionId), true)
    assert.deepEqual((await found(a, projectId, 'cormorant')).map(what), [`message ${sharedLater.contributionId}`])
    // The same visibility is the database's own, as the API role: B's row security hides the private text.
    const hidden = await withActor(
      pool,
      b,
      'read',
      async (c) => (await c.query(`SELECT 1 FROM sophia.source_texts WHERE source_id = $1`, [mine.sourceId])).rowCount,
    )
    assert.equal(hidden, 0)
    // A message's title is its author's current name, never an address.
    assert.ok(!(sharedHit?.title ?? '').includes('@'))
  })

  it('refuses a non-member and a removed member (403), and never returns another project’s words', async () => {
    const [admin, editor, removed, outsider] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const one = await seedProject(db.ownerUrl, { admin, editors: [editor, removed] })
    const two = await seedProject(db.ownerUrl, { admin: outsider })
    await say(admin, one.projectId, 'The narwhal tusk.')
    await say(outsider, two.projectId, 'The narwhal map, elsewhere.')
    assert.equal((await found(editor, one.projectId, 'narwhal')).length, 1)
    assert.equal((await call(outsider, searchUrl(one.projectId, 'narwhal'))).status, 403)
    assert.equal((await call(editor, searchUrl(two.projectId, 'narwhal'))).status, 403)
    assert.equal((await call(editor, searchUrl(randomUUID(), 'narwhal'))).status, 403)
    assert.equal((await found(removed, one.projectId, 'narwhal')).length, 1)
    const out = await call(admin, `/api/v1/projects/${one.projectId}/members/${removed}/removal`, {
      body: {},
      key: randomUUID(),
    })
    assert.equal(out.status, 200, out.raw)
    assert.equal((await call(removed, searchUrl(one.projectId, 'narwhal'))).status, 403)
  })

  it('pages 45 sections of one version, all at one time, 20/20/5: every anchor once', async () => {
    const admin = randomUUID()
    const seed = await seedProject(db.ownerUrl, { admin })
    const text = Array.from({ length: 45 }, (_, i) => `## Part ${String(i)}\nThe marmoset line ${String(i)}.`)
    await report(seed, admin, 'Long report', [text.join('\n')])
    const { hits, sizes } = await all(admin, seed.projectId, 'marmoset')
    assert.deepEqual(sizes, [20, 20, 5])
    assert.deepEqual(
      hits.map((h) => h.cite.anchor),
      Array.from({ length: 45 }, (_, i) => `part-${String(i)}`),
      'in the report’s order, none repeated or dropped',
    )
  })

  it('pages equal times across kinds and two artifacts with no repeat or drop', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const { projectId } = seed
    const sameTime = '2026-10-01T00:00:00.123456Z'
    const expected: string[] = []
    for (const title of ['Quokka one', 'Quokka two']) {
      const r = await report(seed, admin, title, ['Quokka preamble.\n## A\nquokka a\n## B\nquokka b'])
      await owner(`UPDATE sophia.artifact_versions SET created_at=$2 WHERE artifact_id=$1`, [r.artifactId, sameTime])
      expected.push(`report ${r.artifactId}`, `report_section ${r.artifactId} a`, `report_section ${r.artifactId} b`)
    }
    const n = await note(editor, projectId, 'A quokka note.')
    await owner(`UPDATE sophia.mission_entries SET recorded_at=$2 WHERE id=$1`, [n.entryId, sameTime])
    const d = await propose(editor, projectId, 'A quokka decision.')
    await owner(`UPDATE sophia.decisions SET created_at=$2 WHERE id=$1`, [d, sameTime])
    expected.push(`note ${String(n.entryId)}`, `decision ${d}`)
    for (let i = 0; i < 20; i += 1) {
      const m = await say(editor, projectId, `Quokka message ${String(i)}.`)
      await owner(`UPDATE sophia.contributions SET created_at=$2 WHERE id=$1`, [m.contributionId, sameTime])
      expected.push(`message ${m.contributionId}`)
    }
    const { hits, sizes } = await all(editor, projectId, 'quokka')
    assert.deepEqual(sizes, [20, 8])
    assert.deepEqual(hits.map(what).toSorted(), expected.toSorted())
    assert.equal(new Set(hits.map(what)).size, hits.length)
    // Equal times: kinds in order (report, section, note, decision, message).
    const order = ['report', 'report_section', 'note', 'decision', 'message']
    const kinds = hits.map((h) => order.indexOf(h.kind))
    assert.deepEqual(
      kinds,
      kinds.toSorted((x, y) => x - y),
    )
  })

  it('pages two hits 1 µs apart on either side of a page’s end: both served, once', async () => {
    const admin = randomUUID()
    // 21 messages: the 20th and the 21st are 1 µs apart, on either side of the page's end.
    const { projectId: p2 } = await seedProject(db.ownerUrl, { admin })
    const times = [
      ...Array.from({ length: 19 }, (_, i) => `2026-10-02T00:00:${String(30 + i).padStart(2, '0')}.000000Z`),
      '2026-10-02T00:00:10.000500Z',
      '2026-10-02T00:00:10.000499Z',
    ]
    const ids: string[] = []
    for (const at of times) {
      const m = await say(admin, p2, 'The wombat moves.')
      await owner(`UPDATE sophia.contributions SET created_at=$2 WHERE id=$1`, [m.contributionId, at])
      ids.push(m.contributionId)
    }
    const wombats = await all(admin, p2, 'wombat')
    assert.deepEqual(wombats.sizes, [20, 1])
    // Newest first: the 19 later ones, then .000500 ending the page, then .000499 on the next.
    assert.deepEqual(
      wombats.hits.map((h) => h.id),
      [...ids.slice(0, 19).toReversed(), ids[19], ids[20]],
    )
  })

  it('refuses a malformed cursor, or one of another query or project (422); bounds the query: 200 characters, words of 64, eight words; under two finds nothing', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const one = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const two = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    for (let i = 0; i < 25; i += 1) {
      await say(editor, one.projectId, `The ocelot ${String(i)}.`)
      await say(editor, two.projectId, `The ocelot ${String(i)}.`)
    }
    const first = await page(editor, one.projectId, 'ocelot')
    assert.ok(first.next)
    assert.equal((await page(editor, one.projectId, 'ocelot', first.next)).hits.length, 5)
    const status = async (projectId: string, q: string, cursor?: string) =>
      (await call(editor, searchUrl(projectId, q, cursor))).status
    assert.equal(await status(one.projectId, 'oce', first.next), 422, 'another query')
    assert.equal(await status(two.projectId, 'ocelot', first.next), 422, 'another project')
    assert.equal(await status(one.projectId, 'ocelot', 'abc'), 422, 'not one of ours')
    assert.equal(await status(one.projectId, 'ocelot', Buffer.from('{"v":2}').toString('base64url')), 422)
    assert.equal(await status(one.projectId, 'ocelot', 'a'.repeat(513)), 422, 'too long')
    // 200 characters (code points), never 201.
    const words200 = `${'abcdefgh '.repeat(22)}ab`
    assert.equal(words200.length, 200)
    assert.equal(await status(one.projectId, words200), 200)
    assert.equal(await status(one.projectId, `${words200}c`), 422)
    assert.equal(await status(one.projectId, '\u{1F600}'.repeat(200)), 200)
    assert.equal(await status(one.projectId, '\u{1F600}'.repeat(201)), 422)
    // A word of 64 is searched; of 65, refused, with the reason said.
    assert.equal(await status(one.projectId, 'x'.repeat(64)), 200)
    const long = await call(editor, searchUrl(one.projectId, `ocelot ${'x'.repeat(65)}`))
    assert.equal(long.status, 422)
    assert.equal(long.json?.code, 'invalid_request')
    assert.match(String(long.json?.message), /longer than 64/)
    // Eight words are searched; a ninth is left out, as Knowledge does.
    await say(editor, one.projectId, 'one two three four five six seven eight')
    assert.equal((await found(editor, one.projectId, 'one two three four five six seven eight nine')).length, 1)
    // Under two characters, blank, or nothing searchable: nothing, not a failure.
    for (const q of ['', ' ', 'o', '?!', '  o  '])
      assert.deepEqual(await page(editor, one.projectId, q), { hits: [], next: null })
    assert.equal((await call(editor, `/api/v1/projects/${one.projectId}/search`)).status, 422, 'q is required')
  })

  it('names the message after a found one, in any state: the A23 page before it ends at the found message', async () => {
    const admin = randomUUID()
    const { projectId } = await seedProject(db.ownerUrl, { admin })
    const target = await say(admin, projectId, 'The ibis waits.')
    const next = await say(admin, projectId, 'Something else.')
    await act(admin, projectId, next.contributionId, 'withdraw')
    const newest = await say(admin, projectId, 'The ibis again.')
    const hits = await found(admin, projectId, 'ibis')
    assert.deepEqual(
      hits.map((h) => [h.id, h.before]),
      [
        [newest.contributionId, null],
        [target.contributionId, next.contributionId],
      ],
    )
    const read = await chat(admin, projectId, next.contributionId)
    assert.equal(read.entries.at(-1)?.id, target.contributionId)
  })

  it('splits sections as 0036 and the viewer do, in a pure invoker function the API role may call; no definer, table or index is added', async () => {
    const texts = [
      'Intro\n# A\none\n## B #\ntwo\n# A\nthree\n```\n# fenced\n```\n# A\nfour',
      ' \n# Only\nbody',
      '   \n\n## x\n\n## x\n## y',
      '#NoSpace\n#  Spaced  ##  \n',
      // JavaScript's whitespace in a heading (a byte order mark, no-break spaces, a tab), punctuation and edge hyphens,
      // and an anchor repeated by different words: each anchor as 0036 and the viewer make it (R-C4-SQL-01).
      '# Fast\uFEFFhosts\u00A0\u00A02026\nbody\n#\tTabbed\theading\nx',
      '# Costs: €, $ & (approx.)!\none\n# Costs\ntwo\n# -Edge hyphens-\nthree\n# costs!!\nfour',
    ]
    for (const text of texts) {
      const ours = await owner<{
        ord: number
        anchor: string
        occurrence: number
        heading: string | null
        body: string
      }>(`SELECT ord, anchor, occurrence, heading, body FROM sophia.markdown_section_texts($1) ORDER BY ord`, [text])
      const outline = await owner<{ ord: number; anchor: string; heading: string | null }>(
        `SELECT ord, anchor, heading FROM sophia.markdown_outline($1) ORDER BY ord`,
        [text],
      )
      assert.deepEqual(
        ours.map(({ ord, anchor, heading }) => ({ ord, anchor, heading })),
        outline.map(({ ord, anchor, heading }) => ({ ord, anchor, heading })),
        text,
      )
      const viewer = sectionsOf(text)
      const seen = new Map<string, number>()
      assert.deepEqual(
        ours.map((s) => [s.heading, s.anchor, s.occurrence, s.body.replace(/\s+/g, ' ').trim()]),
        viewer.map((s) => {
          const n = s.heading === null ? 0 : (seen.get(s.anchor) ?? 0)
          if (s.heading !== null) seen.set(s.anchor, n + 1)
          return [s.heading, s.anchor, n, s.body]
        }),
        text,
      )
    }
    // The API's own role calls it, with the role safety the API requires.
    await checkRoleSafety(pool)
    const asApi = await withActor(pool, randomUUID(), 'read', async (c) => {
      const role = await c.query<{ who: string; bypass: boolean }>(
        `SELECT current_user AS who, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`,
      )
      const sections = await c.query(`SELECT * FROM sophia.markdown_section_texts('# A\nx\n# A\ny')`)
      return { role: role.rows[0], count: sections.rowCount }
    })
    assert.equal(asApi.role?.bypass, false)
    assert.equal(asApi.count, 2)
    const [fn] = await owner<{ secdef: boolean; volatile: string; src: string; public: boolean; api: boolean }>(
      `SELECT p.prosecdef AS secdef, p.provolatile AS volatile, p.prosrc AS src,
              has_function_privilege('public', p.oid, 'EXECUTE') AS public,
              has_function_privilege('sophia_api', p.oid, 'EXECUTE') AS api
         FROM pg_proc p WHERE p.oid = 'sophia.markdown_section_texts(text)'::regprocedure`,
    )
    assert.deepEqual([fn?.secdef, fn?.volatile, fn?.public, fn?.api], [false, 'i', false, true])
    assert.doesNotMatch(fn?.src ?? '', /\b(from|join|into|update|delete)\s+sophia\./i, 'it reads no relation')
    // It computes its anchors itself: 0036's heading_anchor stays its owner's alone (0036's own test), and the API's
    // search depends on no grant of it (R-C4-SQL-01).
    assert.doesNotMatch(fn?.src ?? '', /sophia\.heading_anchor\s*\(/, 'it calls no private helper')
    const [helper] = await owner<{ api: boolean; worker: boolean; public: boolean }>(
      `SELECT has_function_privilege('sophia_api', 'sophia.heading_anchor(text)', 'EXECUTE') AS api,
              has_function_privilege('sophia_worker', 'sophia.heading_anchor(text)', 'EXECUTE') AS worker,
              has_function_privilege('public', 'sophia.heading_anchor(text)', 'EXECUTE') AS public`,
    )
    assert.deepEqual(helper, { api: false, worker: false, public: false })
    // The migration adds nothing else: no definer, table, index, trigger or write.
    const sql = readFileSync(new URL('../../../db/migrations/0072_project_search.sql', import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')
    assert.doesNotMatch(
      sql,
      /SECURITY DEFINER|CREATE (TABLE|INDEX|TRIGGER|VIEW|POLICY)|INSERT |UPDATE |DELETE |ALTER TABLE/i,
    )
  })
})
