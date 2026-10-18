import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Request } from '@playwright/test'

// The room's message acts (A36) and mentions (A37) on the narrow served path: the real Studio build with those flags,
// saved conversations and the attention flag on and VISION off, against the real API and PostgreSQL
// (playwright.served.config.ts). Messages are written through that API or the chat by dev-db's synthetic identities
// (Luis an admin, Davide an editor). Where a preview's answer is held, it is held in the browser (page.route) and then
// let through to the real API. Not production acceptance: no hosted Auth, deployment or real account.
interface Served {
  project: { projectId: string }
  identities: { name: string; token: string }[]
}
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dev-db.ts's own output
const served = JSON.parse(readFileSync(process.env.SOPHIA_SERVED_ENV ?? '', 'utf8')) as Served
const API = 'http://127.0.0.1:5199'
const PROJECT = served.project.projectId
/** The database outlives a run (dev-db's own): each run's words are its own. */
const RUN = Date.now().toString(36)
const PREVIEW = '**/api/v1/projects/*/contributions/*/preview?action=*'

const tokenOf = (name: string) => served.identities.find((i) => i.name === name)?.token ?? ''

/** One call to the listening API as a dev identity; its JSON (or nothing for a 204), or a failed test. */
async function api(name: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${tokenOf(name)}`,
      'idempotency-key': randomUUID(),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  expect(res.ok, `${method} ${path}: ${String(res.status)} ${text}`).toBe(true)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the API's own JSON, read by key below
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

/** Luis says something in the dev project's room, through the API. */
const say = (text: string) =>
  api('Luis', 'POST', `/api/v1/projects/${PROJECT}/contributions`, {
    source: null,
    text,
    threadId: null,
    artifactVersionId: null,
    intent: 'discuss',
  })

/** Signed in as one of dev-db's identities (dev-identity.ts keeps the choice per tab), every API call recorded. */
async function as(page: Page, name: string) {
  await page.addInitScript((who) => sessionStorage.setItem('sophia.dev.identity', who), name)
  const calls: string[] = []
  page.on('request', (r: Request) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/api/')) calls.push(`${r.method()} ${url.pathname}`)
  })
  return calls
}

const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const line = (page: Page, words: string) => discussion(page).locator('.contribution').filter({ hasText: words })
/** A message's act written (a correction or a withdrawal), never its preview. */
const acts = (calls: readonly string[]) =>
  calls.filter((c) => /^POST .*\/contributions\/.*\/(correction|withdrawal)$/.test(c))

/** The project's room with its chat open, as the person finds it. */
async function room(page: Page) {
  await page.goto(`/p/${PROJECT}`)
  const chat = page.getByRole('button', { name: /^Chat/ }).first()
  if ((await chat.getAttribute('aria-pressed')) !== 'true') await chat.click()
  await expect(discussion(page)).toBeVisible()
}

test.describe.configure({ mode: 'serial' })
// Home asks the browser for on-device speech recognition, which chrome-headless-shell does not bind (it ends the
// page): the full Chromium build of the same installed revision, as attention-served.spec.ts uses.
test.use({ channel: 'chromium' })

async function withdrawalPreviewCancelled(page: Page): Promise<void> {
  const words = `Withdraw me later, run ${RUN}`
  await say(words)
  const calls = await as(page, 'Luis')
  await room(page)
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  await page.route(PREVIEW, async (r) => {
    await held
    await r.continue()
  })
  const asked = page.waitForRequest((r) => r.url().includes('/preview?action=withdraw'))
  await line(page, words).getByRole('button', { name: 'Withdraw' }).click()
  await asked
  // Only read so far: nothing says it is withdrawing, and it can still be called off.
  await expect(page.getByText('Withdrawing…')).toHaveCount(0)
  await line(page, words).getByRole('button', { name: 'Cancel' }).click()
  await expect(line(page, words).getByRole('button', { name: 'Withdraw' })).toBeVisible()

  const late = page.waitForResponse((r) => r.url().includes('/preview?action=withdraw'))
  release()
  expect((await late).status()).toBe(200)
  await expect(page.getByRole('group', { name: 'Withdraw your message?' })).toHaveCount(0)
  await expect(line(page, words).getByRole('button', { name: 'Withdraw' })).toBeVisible()

  await page.unroute(PREVIEW)
  await line(page, words).getByRole('button', { name: 'Withdraw' }).click()
  const ask = page.getByRole('group', { name: 'Withdraw your message?' })
  await expect(ask).toContainText('Your words are erased.')
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(line(page, words)).toBeVisible()
  expect(acts(calls)).toEqual([])
}

async function correctionPreviewCancelled(page: Page): Promise<void> {
  const words = `Correct me later, run ${RUN}`
  const fixed = `Corrected, run ${RUN}`
  await say(words)
  const calls = await as(page, 'Luis')
  await room(page)
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  await page.route(PREVIEW, async (r) => {
    await held
    await r.continue()
  })
  await line(page, words).getByRole('button', { name: 'Edit' }).click()
  const field = page.getByRole('textbox', { name: 'Edit your message' })
  await field.fill(fixed)
  const asked = page.waitForRequest((r) => r.url().includes('/preview?action=correct'))
  await page.getByRole('button', { name: 'Save' }).click()
  await asked
  // Only read so far: not «Saving…», and Cancel is not held back.
  await expect(page.getByRole('button', { name: 'Saving…' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancel' })).not.toHaveAttribute('aria-disabled', 'true')
  await field.press('Escape')
  await expect(field).toHaveCount(0)
  await expect(line(page, words)).toBeVisible()

  const late = page.waitForResponse((r) => r.url().includes('/preview?action=correct'))
  release()
  expect((await late).status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'Edit your message' })).toHaveCount(0)
  await expect(line(page, words)).toBeVisible()
  expect(acts(calls)).toEqual([])

  // Saved again with nothing held: its preview reaches no work, so it goes, through the real API.
  await page.unroute(PREVIEW)
  await line(page, words).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill(fixed)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(line(page, fixed)).toBeVisible()
  await expect(line(page, fixed)).toContainText('Edited')
  expect(acts(calls)).toHaveLength(1)
}

test.describe('a preview read before an act (r4296732968)', () => {
  test('served · a withdrawal’s preview can be cancelled while it is read: nothing sent, a late answer opens nothing, asking again asks afresh', ({
    page,
  }) => withdrawalPreviewCancelled(page))
  test('served · a correction’s preview can be cancelled while it is read: Escape goes back, nothing is saved; saved again, it is', ({
    page,
  }) => correctionPreviewCancelled(page))
})

/** A dev identity's actor id: its token's subject (dev-db's own synthetic HS256 token). */
const actorOf = (name: string): string => {
  const payload = tokenOf(name).split('.')[1] ?? ''
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dev-db's own token payload
  return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string }).sub
}
interface MentionNeed {
  id: string
  kind: string
  title: string
  ref: { id: string; within: string }
}
/** Davide's own mention needs, as the API lists them to him. */
const mentionsOf = async (name: string): Promise<MentionNeed[]> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the API's NeedList (A15, A37), read by key
  ((await api(name, 'GET', '/api/v1/me/needs?mentions=1')).needs as MentionNeed[]).filter((n) => n.kind === 'mention')
const needFor = async (name: string, words: string) => (await mentionsOf(name)).find((n) => n.title.includes(words))
const bar = (page: Page) => page.getByRole('textbox', { name: 'Message the room' })
const seenPosts = (calls: readonly string[]) => calls.filter((c) => /^POST \/api\/v1\/me\/needs\/.+\/seen$/.test(c))
/** The need a seen write names, decoded from its path. */
const seenOf = (call: string) =>
  decodeURIComponent(call.replace(/^POST \/api\/v1\/me\/needs\//, '').replace(/\/seen$/, ''))
const PICKED = `Davide, can you check the door plan? Outsider too. Run ${RUN}`

async function pickAndSend(page: Page): Promise<void> {
  await as(page, 'Luis')
  await room(page)
  await page.getByRole('button', { name: 'Mention' }).click()
  const options = page.getByRole('group', { name: /Mention members/ })
  // The project's other current members, never the writer, never an address.
  await expect(options.getByRole('checkbox')).toHaveCount(1)
  await expect(options).not.toContainText('@')
  await options.getByRole('checkbox', { name: /Davide|A member/ }).check()
  await page.getByRole('button', { name: 'Done' }).click()
  const sent = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/contributions'))
  await bar(page).fill(PICKED)
  await bar(page).press('Enter')
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the request the chat sent, read by key
  expect(((await sent).postDataJSON() as { mentions?: string[] }).mentions).toEqual([actorOf('Davide')])
  await expect(line(page, PICKED).locator('.contribution-mentions')).toHaveText(/^to /)
  // A name typed in the words mentions nobody: only the choice did. Davide is asked; the outsider is no member.
  expect(await needFor('Davide', PICKED)).toBeDefined()
}

async function openFromHome(page: Page): Promise<void> {
  const need = (await needFor('Davide', PICKED))?.id ?? ''
  expect(need).toMatch(/^mention:.+:1\.1:/)
  const calls = await as(page, 'Davide')
  await page.goto('/')
  const mention = page.getByRole('list', { name: 'Needs you' }).getByRole('button').filter({ hasText: PICKED })
  await expect(mention).toContainText('mentioned you')
  await mention.click()
  await expect(line(page, PICKED)).toBeVisible()
  // Marked seen in the room, once, by its own id, where its words are read. (Davide's other mentions shown in the same
  // chat, left from earlier runs on this database, are acknowledged by their own ids.)
  await expect.poll(() => seenPosts(calls).filter((c) => seenOf(c) === need)).toHaveLength(1)
  await expect.poll(async () => needFor('Davide', PICKED)).toBeUndefined()
  // Luis's message offers Davide no act of his own.
  await expect(line(page, PICKED).getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await expect(line(page, PICKED).getByRole('button', { name: 'Withdraw' })).toHaveCount(0)
}

async function staleRevision(page: Page): Promise<void> {
  const words = `Davide, a look at the budget? Run ${RUN}`
  const fixed = `Davide, a look at the budget by Monday? Run ${RUN}`
  await api('Luis', 'POST', `/api/v1/projects/${PROJECT}/contributions`, {
    source: null,
    text: words,
    threadId: null,
    artifactVersionId: null,
    intent: 'discuss',
    mentions: [actorOf('Davide')],
  })
  const first = await needFor('Davide', words)
  expect(first?.ref.within).toBe('1.1')
  await as(page, 'Luis')
  await room(page)
  await line(page, words).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill(fixed)
  await page.getByRole('button', { name: 'Save' }).click()
  // Answered: the field is gone and the message says it was edited, still naming its recipient.
  await expect(page.getByRole('textbox', { name: 'Edit your message' })).toHaveCount(0)
  await expect(line(page, fixed)).toContainText('Edited')
  await expect(line(page, fixed).locator('.contribution-mentions')).toHaveText(/^to /)
  const second = await needFor('Davide', fixed)
  expect(second?.ref.within).toBe('2.1')
  // The seen of the older revision answers and clears nothing newer.
  await api('Davide', 'POST', `/api/v1/me/needs/${encodeURIComponent(first?.id ?? '')}/seen`)
  expect((await needFor('Davide', fixed))?.id).toBe(second?.id)
}

async function withdrawnEnds(page: Page): Promise<void> {
  const words = `Davide, the venue list? Run ${RUN}`
  await api('Luis', 'POST', `/api/v1/projects/${PROJECT}/contributions`, {
    source: null,
    text: words,
    threadId: null,
    artifactVersionId: null,
    intent: 'discuss',
    mentions: [actorOf('Davide')],
  })
  expect(await needFor('Davide', words)).toBeDefined()
  await as(page, 'Luis')
  await room(page)
  await line(page, words).getByRole('button', { name: 'Withdraw' }).click()
  const ask = page.getByRole('group', { name: 'Withdraw your message?' })
  await ask.getByRole('button', { name: 'Withdraw message' }).click()
  await expect(discussion(page).getByText('You withdrew this message.').last()).toBeVisible()
  await expect(page.getByText(words)).toHaveCount(0)
  expect(await needFor('Davide', words)).toBeUndefined()
}

test.describe('mentions in the room, on the real API (A37)', () => {
  test('served · an admin picks a member by name; the message names them; words typed name nobody', ({ page }) =>
    pickAndSend(page))
  test('served · the member finds it on Home, opens it in the room, and it is marked seen there once', ({ page }) =>
    openFromHome(page))
  test('served · corrected, the mention is asked again on the new revision; a seen for the old one clears nothing', ({
    page,
  }) => staleRevision(page))
  test('served · withdrawn, the message leaves only its place, and the mention ends', ({ page }) => withdrawnEnds(page))
})

/** Luis's room message's current words, as the API reads it to him (A36 revisions). */
async function wordsNow(id: string): Promise<{ text: string; revision: number } | undefined> {
  const page = await api('Luis', 'GET', `/api/v1/projects/${PROJECT}/discussion?revisions=1`)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the API's DiscussionPage, read by key
  const entries = page.entries as { id: string; text: string; revision: number }[]
  return entries.find((e) => e.id === id)
}

/**
 * Luis presses Save on a correction whose preview reaches no work, and leaves (another account in the tab, or signing
 * out) while that preview is on its way. Its answer, valid and let through to the real API, must start nothing under
 * the account that left: Luis's token is still valid at the API, so only the browser can hold the line (R-C3-ACT-01).
 */
async function previewOutlivesAccount(page: Page, leave: (page: Page) => Promise<void>): Promise<void> {
  const words = `Leave before the answer, run ${RUN} ${randomUUID().slice(0, 4)}`
  const id = String((await say(words)).contributionId)
  const calls = await as(page, 'Luis')
  await room(page)
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  await page.route(PREVIEW, async (r) => {
    await held
    await r.continue()
  })
  await line(page, words).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill(`${words}, corrected`)
  const asked = page.waitForRequest((r) => r.url().includes('/preview?action=correct'))
  await page.getByRole('button', { name: 'Save' }).click()
  await asked
  await leave(page)
  const late = page.waitForResponse((r) => r.url().includes('/preview?action=correct'))
  release()
  expect((await late).status()).toBe(200)
  // Given time to act on it: nothing is written for the account that left, and the message is as it was.
  await page.waitForTimeout(1500)
  expect(acts(calls)).toEqual([])
  expect((await wordsNow(id))?.text).toBe(words)
}

const switchToDavide = async (page: Page) => {
  await page.getByRole('button', { name: 'Account' }).first().click()
  await page.getByRole('combobox', { name: 'Acting as' }).selectOption('Davide')
}
const signOut = async (page: Page) => {
  await page.getByRole('button', { name: 'Account' }).first().click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
}

test.describe('an act’s preview outliving its account (R-C3-ACT-01)', () => {
  test('served · another account in the tab before the preview answers: nothing is written for the one that left', ({
    page,
  }) => previewOutlivesAccount(page, switchToDavide))
  test('served · signed out before the preview answers: nothing is written for the one that left', ({ page }) =>
    previewOutlivesAccount(page, signOut))
})
