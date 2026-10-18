import { expect, test, type Page, type Request } from '@playwright/test'

// The narrow served path of CON-01 C1 and the profile names (A33, A32): the real Studio build against the real API and
// PostgreSQL (playwright.served.config.ts), VISION off, saved conversations on, Ask off (no reply grant, no provider,
// no companion). Synthetic dev identities only. Not production acceptance: no hosted Auth, deployment or real account.
const PROJECT = process.env.SOPHIA_SERVED_PROJECT ?? ''
const VIEW = `/p/${PROJECT}/conversations`
/** The database outlives a run (dev-db's own): each run's words and names are its own. */
const RUN = Date.now().toString(36)
const ASKED = `Who signs off the served rollout? ${RUN}`
const ERASED = `Erase me after the check ${RUN}`
const NAMELESS = `Davide asks without a name ${RUN}`
const NAMED = `Luis asks with his name ${RUN}`
const NAME = `Luis Served ${RUN}`
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const form = (page: Page) => page.getByRole('form', { name: 'New conversation' })
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
/** A row of the list by its words (a row shows them as its title and as its newest message). */
const row = (page: Page, words: string) => list(page).locator('.conv-row', { hasText: words })
const unanswered = 'Sophia doesn’t answer here yet: the question goes to the team.'

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

async function start(page: Page, words: string, ask: boolean) {
  await list(page).getByRole('button', { name: 'New conversation' }).click()
  const f = form(page)
  const box = f.getByRole('checkbox', { name: 'Ask Sophia' })
  if (ask) await expect(f.getByText(unanswered)).toBeVisible()
  if (!ask) await box.uncheck()
  await f.getByRole('textbox', { name: 'Question' }).fill(words)
  await f.getByRole('textbox', { name: 'Question' }).press('Enter')
  await expect(form(page)).toHaveCount(0)
  await expect(open(page).getByRole('heading', { level: 3 })).toHaveText(words)
}

test('served · VISION off: the conversations tab is the real A33 list, and nothing proposed is offered', async ({
  page,
}) => {
  const calls = await as(page, 'Luis')
  // Synchronized on the A33 read itself (seen in B-C4 run 42 and B-C1-current-main run 29: the list visible before any
  // API request was recorded): the list's answer, then the required record of the request.
  const listed = page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/v1/projects/${PROJECT}/conversations` && r.request().method() === 'GET',
  )
  await page.goto(VIEW)
  expect((await listed).status()).toBe(200)
  await expect(list(page)).toBeVisible()
  expect(calls).toContain(`GET /api/v1/projects/${PROJECT}/conversations`)
  // The project's search is served under its own flag (A38, VITE_SOPHIA_SEARCH=1 in this build), not the vision flag;
  // nothing VISION-only is read (meetings, recaps, so-far, focus, source origins).
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(1)
  expect(calls.filter((c) => /\/(meetings|recap|so-far|focus|source-origins)\b/.test(c))).toEqual([])
})

test('served · a conversation started with Ask off is kept: its question after a reload, no answer asked of anyone', async ({
  page,
}) => {
  const calls = await as(page, 'Luis')
  await page.goto(VIEW)
  await start(page, ASKED, true)
  expect(calls).toContain(`POST /api/v1/projects/${PROJECT}/conversations`)
  await page.reload()
  await expect(list(page)).toContainText(ASKED)
  await row(page, ASKED).click()
  await expect(open(page).locator('.conv-messages > li').first()).toContainText(ASKED)
  // Ask off: no reply is written or awaited; the composer says Sophia doesn't answer here.
  await expect(open(page).getByText('Sophia is answering')).toHaveCount(0)
  expect(calls.some((c) => c.includes('/replies') || c.includes('/runtime'))).toBe(false)
})

test('served · an admin erases a conversation: it leaves the list, and stays gone after a reload', async ({ page }) => {
  await as(page, 'Luis')
  await page.goto(VIEW)
  await start(page, ERASED, false)
  const context = page.getByRole('complementary', { name: 'Project context' })
  if (!(await context.isVisible()))
    await page
      .getByRole('button', { name: /context/i })
      .first()
      .click()
  await context.getByRole('button', { name: 'Erase this conversation' }).click()
  await page.getByRole('group', { name: 'Erase this conversation' }).getByRole('button', { name: 'Erase' }).click()
  await expect(list(page)).not.toContainText(ERASED)
  await page.reload()
  await expect(list(page)).toBeVisible()
  await expect(list(page)).not.toContainText(ERASED)
})

test('served · «Your name» is saved and read back; others see the chosen name, and a member without one as A member', async ({
  browser,
}) => {
  // Davide (no provider name in his token) writes first: Luis sees him as A member, never his address.
  const davide = await browser.newPage()
  await as(davide, 'Davide')
  await davide.goto(VIEW)
  await start(davide, NAMELESS, false)
  const luis = await browser.newPage()
  const calls = await as(luis, 'Luis')
  await luis.goto(VIEW)
  await luis.getByRole('button', { name: 'Account' }).click()
  await luis.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Your name' }).click()
  const sheet = luis.getByRole('dialog', { name: 'Your name' })
  await sheet.getByRole('textbox', { name: 'Name' }).fill(NAME)
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('status')).toContainText('Saved.')
  expect(calls).toContain('PUT /api/v1/me/profile')
  await sheet.getByRole('button', { name: 'Close' }).click()
  await luis.reload()
  await luis.getByRole('button', { name: 'Account' }).click()
  await expect(luis.getByRole('menu', { name: 'Account' }).locator('.menu-head')).toContainText(NAME)
  await luis.keyboard.press('Escape')
  await row(luis, NAMELESS).click()
  await expect(open(luis)).toContainText('A member')
  await start(luis, NAMED, false)
  await davide.reload()
  await row(davide, NAMED).click()
  await expect(open(davide)).toContainText(NAME)
  for (const page of [luis, davide]) expect(await page.locator('body').innerText()).not.toMatch(/@sophia\.test/)
  await davide.close()
  await luis.close()
})

// R-C1-SERVED-01: this case once checked `responses.every(…)` over a list that could still be empty (an empty list's
// every is true) and the absence of a title while the page was still loading, so it could pass without any denial.
// Now it waits for the project's own refusal, the snapshot the shell reads first, then for the settled closed door,
// and only then looks for protected content. The shell denies before the conversations mount: no conversations read
// is required, but any that is made must be refused too.
test('served · someone outside the project is refused by the project itself, then sees none of its conversations', async ({
  page,
}) => {
  const project: string[] = []
  page.on('response', (r) => {
    const path = new URL(r.url()).pathname
    if (path.startsWith(`/api/v1/projects/${PROJECT}/`))
      project.push(`${String(r.status())} ${r.request().method()} ${path}`)
  })
  await as(page, 'Outsider')
  const refused = page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/v1/projects/${PROJECT}/snapshot` && r.request().method() === 'GET',
  )
  await page.goto(VIEW)
  // The witness: the project's own read, refused as to someone who isn't a member.
  expect((await refused).status()).toBe(403)
  // Settled: the closed door, in the shell's words, with its way out; no project view behind it.
  const door = page.locator('main.notice')
  await expect(door.getByRole('heading', { name: 'No access to this project' })).toBeVisible()
  await expect(door).toContainText('Outsider isn’t a member.')
  await expect(door.getByRole('button', { name: 'Back to projects' })).toBeVisible()
  await expect(list(page)).toHaveCount(0)
  await expect(open(page)).toHaveCount(0)
  for (const words of [ASKED, NAMED, NAMELESS]) await expect(page.getByText(words)).toHaveCount(0)
  // Every project read this person made was refused: none answered with content.
  expect(project.length).toBeGreaterThan(0)
  expect(project.filter((r) => !/^(403|404) /.test(r))).toEqual([])
})
