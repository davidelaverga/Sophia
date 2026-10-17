import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Request } from '@playwright/test'

// The project's search (A38) on the narrow served path: the real Studio build with the search flag (and saved
// conversations, attention, message acts and mentions) on and VISION off, against the real API and PostgreSQL
// (playwright.served.config.ts). Everything searched was written through that API or the chat by dev-db's synthetic
// identities. Where an answer is replaced, it is replaced in the browser (page.route); everything else is the real API.
// Not production acceptance: no hosted Auth, deployment or real account.
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
const tokenOf = (name: string) => served.identities.find((i) => i.name === name)?.token ?? ''

/** One call to the listening API as a dev identity: its status and JSON. */
async function call(name: string, method: string, path: string, body?: unknown) {
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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the API's own JSON, read by key below
  return { status: res.status, json: (text ? JSON.parse(text) : {}) as Record<string, unknown> }
}
async function api(name: string, method: string, path: string, body?: unknown) {
  const { status, json } = await call(name, method, path, body)
  expect(status, `${method} ${path}: ${String(status)} ${JSON.stringify(json)}`).toBeLessThan(300)
  return json
}
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
    if (url.pathname.startsWith('/api/')) calls.push(`${r.method()} ${url.pathname}${url.search}`)
  })
  return calls
}

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Search this project' })
const field = (page: Page) => sheet(page).getByRole('searchbox', { name: 'Search this project' })
const hits = (page: Page) => sheet(page).getByRole('list', { name: 'Results' }).getByRole('listitem')
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const line = (page: Page, words: string) => discussion(page).locator('.contribution').filter({ hasText: words })

async function search(page: Page, q: string) {
  await page.goto(`/p/${PROJECT}`)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await field(page).fill(q)
}

test.describe.configure({ mode: 'serial' })
test.use({ channel: 'chromium' })

async function foundAndOpened(page: Page): Promise<void> {
  const word = `heron${RUN}a`
  await say(`The ${word} nests by the north door.`)
  await api('Luis', 'POST', `/api/v1/projects/${PROJECT}/mission/entries`, {
    kind: 'observation',
    epistemic: 'observed',
    text: `Three ${word} were counted at dawn.`,
  })
  const proposed = await api('Luis', 'POST', `/api/v1/projects/${PROJECT}/mission/proposals`, {
    kind: 'constraint',
    statement: `Keep the ${word} path clear.`,
  })
  await api('Luis', 'POST', `/api/v1/projects/${PROJECT}/mission/proposals/${String(proposed.decisionId)}/decision`, {
    decision: 'accept',
    expectedRevision: 1,
  })
  const calls = await as(page, 'Luis')
  await search(page, word)
  await expect(hits(page)).toHaveCount(3)
  expect(calls).toContain(`GET /api/v1/projects/${PROJECT}/search?q=${word}`)
  await hits(page).filter({ hasText: 'nests by the north door' }).getByRole('button').click()
  await expect(line(page, `The ${word} nests by the north door.`)).toBeInViewport()
}

async function olderMessage(page: Page): Promise<void> {
  const word = `heron${RUN}b`
  await say(`An older ${word} landed on the roof.`)
  for (let n = 0; n < 60; n += 15)
    await Promise.all(Array.from({ length: 15 }, (_, i) => say(`Filler ${String(n + i)} of run ${RUN}`)))
  await as(page, 'Luis')
  await search(page, word)
  await expect(hits(page)).toHaveCount(1)
  await hits(page).first().getByRole('button').click()
  // Beyond the chat's latest window: one read ends at it, and it is shown.
  await expect(line(page, `An older ${word} landed on the roof.`)).toBeInViewport()
}

async function correctedAndWithdrawn(page: Page): Promise<void> {
  const old = `heron${RUN}c`
  const fresh = `heron${RUN}d`
  const gone = `heron${RUN}e`
  await say(`Watch the ${old} at the gate.`)
  await say(`The ${gone} left early.`)
  await as(page, 'Luis')
  await page.goto(`/p/${PROJECT}`)
  const chat = page.getByRole('button', { name: /^Chat/ }).first()
  if ((await chat.getAttribute('aria-pressed')) !== 'true') await chat.click()
  await line(page, old).getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill(`Watch the ${fresh} at the gate.`)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(line(page, fresh)).toContainText('Edited')
  await line(page, gone).getByRole('button', { name: 'Withdraw' }).click()
  await page
    .getByRole('group', { name: 'Withdraw your message?' })
    .getByRole('button', { name: 'Withdraw message' })
    .click()
  await expect(page.getByText(`The ${gone} left early.`)).toHaveCount(0)
  // Only the current words are found: nothing of the old revision, nothing of a withdrawn message.
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await field(page).fill(fresh)
  await expect(hits(page)).toHaveCount(1)
  await field(page).fill(old)
  await expect(sheet(page)).toContainText(/No results|Nothing/)
  await expect(hits(page)).toHaveCount(0)
  await field(page).fill(gone)
  await expect(sheet(page)).toContainText(/No results|Nothing/)
  await expect(hits(page)).toHaveCount(0)
}

async function paged(page: Page): Promise<void> {
  const word = `heron${RUN}f`
  for (let n = 0; n < 25; n += 5)
    await Promise.all(Array.from({ length: 5 }, (_, i) => say(`Count ${String(n + i)}: one ${word}.`)))
  const calls = await as(page, 'Luis')
  await search(page, word)
  await expect(hits(page)).toHaveCount(20)
  await sheet(page).getByRole('button', { name: 'More results' }).click()
  await expect(hits(page)).toHaveCount(25)
  const asked = calls.filter((c) => c.startsWith(`GET /api/v1/projects/${PROJECT}/search`))
  expect(asked).toHaveLength(2)
  expect(asked[1]).toContain('cursor=')
}

async function malformedRefused(page: Page): Promise<void> {
  const word = `heron${RUN}a`
  await as(page, 'Luis')
  let replaced = true
  await page.route('**/api/v1/projects/*/search?*', async (r) => {
    if (!replaced) return r.continue()
    // A13's proposed shape, a recap and a meeting: never A38.
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hits: [{ kind: 'recap', meetingId: randomUUID(), title: 'A recap' }], next: null }),
    })
  })
  await search(page, word)
  await expect(sheet(page).getByRole('alert')).toContainText('The search couldn’t be read.')
  await expect(hits(page)).toHaveCount(0)
  replaced = false
  await sheet(page).getByRole('button', { name: 'Try again' }).click()
  await expect(hits(page)).toHaveCount(3)
}

async function outsiderRefused(): Promise<void> {
  const { status } = await call('Outsider', 'GET', `/api/v1/projects/${PROJECT}/search?q=heron${RUN}a`)
  expect(status).toBe(403)
}

/**
 * A report seeded on the owned test database as its producer writes it (B's handback: seed-report.sql), with two
 * «Costs» sections; the searched word is only in the second. Its hit opens the report at THAT section (costs#1).
 */
async function reportSection(page: Page): Promise<void> {
  const word = process.env.SOPHIA_SERVED_REPORT_WORD ?? ''
  const title = process.env.SOPHIA_SERVED_REPORT_TITLE ?? ''
  await as(page, 'Luis')
  await search(page, word)
  // The report itself is found by its title (which holds the word too); its section by its own words.
  const section = hits(page).filter({ hasText: `${title} · Costs` })
  await expect(section).toHaveCount(1)
  await section.getByRole('button').click()
  const heading = page.getByRole('heading', { name: 'Costs' })
  await expect(heading).toHaveCount(2)
  // The second «Costs» takes the focus, the one whose words hold the search: not the first of that name.
  await expect(heading.nth(1)).toBeFocused()
  const after = await heading.nth(1).evaluate((h) => h.nextElementSibling?.textContent ?? '')
  expect(after).toContain(`a hide for the ${word}`)
}

test.describe('the project’s search on the real API (A38)', () => {
  test('served · a message, a note and a decision are found; the message opens in the room', ({ page }) =>
    foundAndOpened(page))
  test('served · a message beyond the chat’s latest window is found and opened', ({ page }) => olderMessage(page))
  test('served · corrected, a message is found by its new words only; withdrawn, not at all', ({ page }) =>
    correctedAndWithdrawn(page))
  test('served · a page at a time: More results reads the next page by its cursor', ({ page }) => paged(page))
  test('served · an answer that isn’t A38 is refused, and asked again it reads', ({ page }) => malformedRefused(page))
  test('served · someone outside the project is refused by the API', () => outsiderRefused())
  test('served · a report section’s hit opens the report at that section, the second of its name', ({ page }) => {
    test.skip(!process.env.SOPHIA_SERVED_REPORT_WORD, 'needs the report seeded on the owned database (seed-report.sql)')
    return reportSection(page)
  })
})
