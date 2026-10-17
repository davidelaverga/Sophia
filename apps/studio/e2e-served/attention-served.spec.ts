import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Request } from '@playwright/test'

// Home's needs (A15) and a project's Updates (A34) on the narrow served path: the real Studio build with the attention
// flag and saved conversations on and VISION off, against the real API and PostgreSQL (playwright.served.config.ts).
// Everything these cases read was written through that API by dev-db's synthetic identities: a guest's knock, a
// project's messages, a note and a decision. Not production acceptance: no hosted Auth, deployment or real account.
interface Served {
  project: { projectId: string }
  identities: { name: string; token: string }[]
}
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dev-db.ts's own output
const served = JSON.parse(readFileSync(process.env.SOPHIA_SERVED_ENV ?? '', 'utf8')) as Served
const API = 'http://127.0.0.1:5199'
const PROJECT = served.project.projectId
/** The database outlives a run (dev-db's own): each run's words and names are its own. */
const RUN = Date.now().toString(36)
const GUEST = `Rosa ${RUN}`
/** The waiting guest's need as the API lists it to Luis (a guest still waiting from an earlier run keeps its entry). */
let guestNeed = ''
const LATE_NOTE = `The late note of run ${RUN}`
const LATE_DECISION = `The late decision of run ${RUN}`
const FIRST_PART = 'You haven’t looked before. This is only the first part: mark it as seen to read on.'
const VISION_ONLY = /\/(meetings|recap|so-far|search|focus|source-origins)\b/

const tokenOf = (name: string) => served.identities.find((i) => i.name === name)?.token ?? ''

/** One call to the listening API as a dev identity; its JSON, or a failed test with the status. */
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

const needs = (page: Page) => page.getByRole('list', { name: 'Needs you' })
const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' }).getByRole('link')
const since = (page: Page) => page.getByRole('region', { name: 'Since you last looked' })
const markSeen = (page: Page) => since(page).getByRole('button', { name: 'Mark as seen' })

test.describe.configure({ mode: 'serial' })
// Home asks the browser for on-device speech recognition (features/personal/dictation.ts), which the stripped
// chrome-headless-shell does not bind: it terminates the page (a bad Mojo message, OnDeviceSpeechRecognition), on C1's
// own base too. The full Chromium build, headless, binds it; it is the same revision Playwright already installed.
test.use({ channel: 'chromium' })

test.beforeAll(async () => {
  // A guest knocks at the dev project's room through an editor's link: a need for its editors and admin (A15).
  const invited = await api('Davide', 'POST', `/api/v1/projects/${PROJECT}/invitations`, { kind: 'guest' })
  const link = String(invited.url).split('#')[1] ?? ''
  const entry = String((await api('Guest', 'POST', '/api/v1/join/knock', { token: link, displayName: GUEST })).id)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the API's NeedList (A15), read by key
  const listed = (await api('Luis', 'GET', '/api/v1/me/needs')).needs as { title: string; ref: { id: string } }[]
  guestNeed = listed.find((n) => n.ref.id === entry)?.title ?? ''
  expect(guestNeed, 'the knock is a need for the project’s admin').toMatch(/^Rosa /)
})

test('served · Home lists the real A15 needs under the attention flag, VISION off', async ({ page }) => {
  const calls = await as(page, 'Luis')
  await page.goto('/')
  await expect(needs(page).getByRole('button', { name: new RegExp(`^${guestNeed} `) })).toBeVisible()
  expect(calls).toContain('GET /api/v1/me/needs')
  expect(calls.filter((c) => VISION_ONLY.test(c))).toEqual([])
})

test('served · switching accounts in the tab lists only the current account’s needs', async ({ page }) => {
  await as(page, 'Luis')
  await page.goto('/')
  await expect(needs(page).getByRole('button', { name: new RegExp(`^${guestNeed} `) })).toBeVisible()
  await page.getByRole('button', { name: 'Account' }).first().click()
  await page.getByRole('combobox', { name: 'Acting as' }).selectOption('Outsider')
  // The outsider is a member of no project: the guest waiting at Luis's room is not theirs to see.
  await expect(page.getByText(guestNeed)).toHaveCount(0)
  await expect(page.getByText('Nothing needs you right now')).toBeVisible()
})

/**
 * A project with more events than one window holds (500, 0066), and the only lines after them: a kept note and an
 * accepted decision. So the first window is a first part with nothing to show, and only the next one has them.
 */
async function updatesProject(): Promise<string> {
  const project = String((await api('Luis', 'POST', '/api/v1/projects', { title: `Updates served ${RUN}` })).projectId)
  const say = (n: number) =>
    api('Luis', 'POST', `/api/v1/projects/${project}/contributions`, {
      source: null,
      text: `Message ${String(n)} of run ${RUN}`,
      threadId: null,
      artifactVersionId: null,
      intent: 'discuss',
    })
  for (let n = 0; n < 505; n += 15) await Promise.all(Array.from({ length: 15 }, (_, i) => say(n + i)))
  await api('Luis', 'POST', `/api/v1/projects/${project}/mission/entries`, {
    kind: 'observation',
    epistemic: 'observed',
    text: LATE_NOTE,
  })
  const proposed = await api('Luis', 'POST', `/api/v1/projects/${project}/mission/proposals`, {
    kind: 'constraint',
    statement: LATE_DECISION,
  })
  await api('Luis', 'POST', `/api/v1/projects/${project}/mission/proposals/${String(proposed.decisionId)}/decision`, {
    decision: 'accept',
    expectedRevision: 1,
  })
  return project
}

test.describe('Updates on a project of its own', () => {
  let project = ''

  test.beforeAll(async () => {
    project = await updatesProject()
  })

  test('served · the real A34 window: a first part, then marked seen, the rest, then nothing new', async ({ page }) => {
    const calls = await as(page, 'Luis')
    await page.goto(`/p/${project}/updates`)
    await expect(views(page)).toHaveText(['Studio', 'Conversations', 'Goals', 'Tasks', 'Knowledge', 'Updates'])
    await expect(page.getByRole('heading', { name: 'Updates', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Meetings' })).toHaveCount(0)
    await expect(since(page)).toContainText(FIRST_PART)
    await expect(since(page)).not.toContainText(LATE_NOTE)
    await expect(since(page)).not.toContainText(LATE_DECISION)
    expect(calls).toContain(`GET /api/v1/projects/${project}/since`)

    await markSeen(page).click()
    await expect(since(page)).toContainText(LATE_NOTE)
    await expect(since(page)).toContainText(LATE_DECISION)
    await expect(since(page)).not.toContainText('only the first part')
    expect(calls).toContain(`PUT /api/v1/projects/${project}/seen`)

    await markSeen(page).click()
    await expect(since(page)).toContainText('Nothing new since you last looked.')
    await expect(markSeen(page)).toHaveCount(0)
    expect(calls.filter((c) => VISION_ONLY.test(c))).toEqual([])
  })

  test('served · someone not in that project is refused by it, and reads none of its Updates', async ({ page }) => {
    const reads: string[] = []
    page.on('response', (r) => {
      const path = new URL(r.url()).pathname
      if (path.startsWith(`/api/v1/projects/${project}/`))
        reads.push(`${String(r.status())} ${r.request().method()} ${path}`)
    })
    await as(page, 'Davide')
    const refused = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/v1/projects/${project}/snapshot` && r.request().method() === 'GET',
    )
    await page.goto(`/p/${project}/updates`)
    expect((await refused).status()).toBe(403)
    const door = page.locator('main.notice')
    await expect(door.getByRole('heading', { name: 'No access to this project' })).toBeVisible()
    await expect(since(page)).toHaveCount(0)
    for (const words of [LATE_NOTE, LATE_DECISION]) await expect(page.getByText(words)).toHaveCount(0)
    // Every read of that project this person made was refused, and nothing was marked seen.
    expect(reads.filter((r) => !/^(403|404) /.test(r))).toEqual([])
    expect(reads.filter((r) => r.includes(' PUT '))).toEqual([])
  })
})

const CANARY = `The canary line of run ${RUN}`
const SINCE = '**/api/v1/projects/*/since'
const SNAPSHOT = '**/api/v1/projects/*/snapshot'
/** The window comes back into view: the query core reads again what is stale (its own focus refetch). */
const lookAgain = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
const answer = (status: number) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify({ code: status === 403 ? 'forbidden' : 'unavailable', message: 'Not now', retry: 'never' }),
})

test.describe('a refusal of this reader’s own Updates read (R-C2-READ-01)', () => {
  let project = ''

  test.beforeAll(async () => {
    project = String((await api('Luis', 'POST', '/api/v1/projects', { title: `Refused ${RUN}` })).projectId)
    await api('Luis', 'POST', `/api/v1/projects/${project}/mission/entries`, {
      kind: 'observation',
      epistemic: 'observed',
      text: CANARY,
    })
  })

  // The real window first; then this reader's own read is refused (stubbed in the browser, as the API refuses a
  // removed member) while the project's snapshot is unavailable, so the shell's door stays as it was.
  test('served · refused, the window read before and Mark as seen go, through a later failure and a remount, until a read answers', async ({
    page,
  }) => {
    const calls = await as(page, 'Luis')
    await page.goto(`/p/${project}/updates`)
    await expect(since(page)).toContainText(CANARY)
    await expect(markSeen(page)).toBeVisible()
    await page.route(SNAPSHOT, (r) => r.fulfill(answer(503)))
    await page.route(SINCE, (r) => r.fulfill(answer(403)))
    await lookAgain(page)
    await expect(since(page).getByRole('alert')).toContainText('What changed couldn’t be read.')
    await expect(since(page)).not.toContainText(CANARY)
    await expect(markSeen(page)).toHaveCount(0)

    await page.unroute(SINCE)
    await page.route(SINCE, (r) => r.fulfill(answer(503)))
    await lookAgain(page)
    await expect(since(page).getByRole('alert')).toBeVisible()
    await expect(since(page)).not.toContainText(CANARY)
    await expect(markSeen(page)).toHaveCount(0)

    await views(page).filter({ hasText: 'Studio' }).click()
    const remountRead = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/since'))
    await views(page).filter({ hasText: 'Updates' }).click()
    expect((await remountRead).status()).toBe(503)
    await expect(since(page).getByRole('alert')).toBeVisible()
    await expect(since(page)).not.toContainText(CANARY)
    await expect(markSeen(page)).toHaveCount(0)
    expect(calls.filter((c) => c.startsWith('PUT ') && c.endsWith('/seen'))).toEqual([])

    // A read set out since the refusal, and answered, shows it again: here the person's own Try again.
    await page.unroute(SINCE)
    await since(page).getByRole('button', { name: 'Try again' }).click()
    await expect(since(page)).toContainText(CANARY)
    await expect(markSeen(page)).toBeVisible()
  })

  test('served · an ordinary failure keeps the window read before, said as possibly out of date', async ({ page }) => {
    await as(page, 'Luis')
    await page.goto(`/p/${project}/updates`)
    await expect(since(page)).toContainText(CANARY)
    await page.route(SINCE, (r) => r.fulfill(answer(503)))
    await lookAgain(page)
    await expect(since(page)).toContainText('This may be out of date.')
    await expect(since(page)).toContainText(CANARY)
    await expect(markSeen(page)).toBeVisible()
  })
})
