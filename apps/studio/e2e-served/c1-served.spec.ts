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
  await page.goto(VIEW)
  await expect(list(page)).toBeVisible()
  expect(calls).toContain(`GET /api/v1/projects/${PROJECT}/conversations`)
  // VISION-only controls (ProjectShell): the project search is absent from a served build.
  await expect(page.getByRole('button', { name: /search/i })).toHaveCount(0)
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

test('served · someone outside the project reads none of its conversations', async ({ page }) => {
  const responses: number[] = []
  page.on('response', (r) => {
    if (new URL(r.url()).pathname === `/api/v1/projects/${PROJECT}/conversations`) responses.push(r.status())
  })
  await as(page, 'Outsider')
  await page.goto(VIEW)
  await expect(page.getByText(ASKED)).toHaveCount(0)
  await expect.poll(() => responses.every((s) => s === 403 || s === 404)).toBe(true)
})
