import { expect, test, type Page } from '@playwright/test'

// Project conversations, follow-ups to Codex on #133 and #134 (docs/plans/project-conversation-follow-ups.md): nothing
// under way is lost when the view goes, an accepted message shows, and the states that were missing. Behind the
// vision flag the fixture pages set; every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const row = (page: Page, title: string) => rows(page).filter({ hasText: title })
const titles = (page: Page) => rows(page).locator('.conv-title')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).getByRole('listitem')
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })
const ask = (page: Page) => open(page).getByRole('checkbox', { name: 'Ask Sophia' })
const form = (page: Page) => page.getByRole('form', { name: 'New conversation' })
const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name, exact: true })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const written = async (page: Page, kind: string) => (await served(page)).filter((s) => s.startsWith(`${kind}:`))
const BRIEFS = 'Short or long briefs?'
const READING = 'What makes a report worth reading?'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

async function openBriefs(page: Page, query = '') {
  await page.goto(`${PAGE}${query}`)
  await row(page, BRIEFS).click()
  await expect(messages(page)).toHaveCount(2)
}

test('follow · a message with no reply survives a trip to Tasks and back, and goes again under its key', async ({
  page,
}) => {
  await openBriefs(page, '&send=lost')
  await ask(page).uncheck()
  await field(page).fill('Did this one land?')
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(open(page)).toContainText('Not confirmed: “Did this one land?”')
  await nav(page, 'Tasks').click()
  await expect(open(page)).toHaveCount(0)
  await nav(page, 'Conversations').click()
  await row(page, BRIEFS).click()
  await expect(open(page)).toContainText('Not confirmed: “Did this one land?”')
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(open(page)).not.toContainText('Not confirmed')
  await expect(messages(page).filter({ hasText: 'Did this one land?' })).toHaveCount(1)
  expect(await written(page, 'conversation-message')).toHaveLength(1)
})

test('follow · «Ask Sophia» turned off stays off with its draft, after a trip to Tasks and back', async ({ page }) => {
  await openBriefs(page)
  await ask(page).uncheck()
  await field(page).fill('Just for the team')
  await nav(page, 'Tasks').click()
  await nav(page, 'Conversations').click()
  await row(page, BRIEFS).click()
  await expect(field(page)).toHaveValue('Just for the team')
  await expect(ask(page)).not.toBeChecked()
})

test('follow · a conversation that couldn’t be read takes nothing to send', async ({ page }) => {
  await page.goto(`${PAGE}&messages=fail`)
  await row(page, BRIEFS).click()
  await expect(open(page)).toContainText('This conversation can’t be read now.')
  await field(page).fill('Into a conversation not read')
  await expect(open(page).getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true')
})

test('follow · a refusal that comes while another conversation is open is said on coming back', async ({ page }) => {
  await openBriefs(page, '&send=refusedSlow')
  await field(page).fill('Refused later')
  await open(page).getByRole('button', { name: 'Send' }).click()
  await row(page, READING).click()
  await page.waitForTimeout(2000)
  await row(page, BRIEFS).click()
  await expect(open(page)).toContainText('That isn’t yours to write here.')
  await expect(field(page)).toHaveValue('Refused later')
})

test('follow · Sophia is still awaited after another conversation was opened, and a plain message keeps the wait', async ({
  page,
}) => {
  await openBriefs(page, '&answer=slow')
  await field(page).fill('Sophia, which do readers finish?')
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(open(page)).toContainText('Sophia is answering…')
  await row(page, READING).click()
  await row(page, BRIEFS).click()
  await expect(open(page)).toContainText('Sophia is answering…')
  // A message that doesn't ask her leaves the wait as it was.
  await ask(page).uncheck()
  await field(page).fill('And a plain note meanwhile.')
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(messages(page).last()).toContainText('And a plain note meanwhile.')
  await expect(open(page)).toContainText('Sophia is answering…')
  await expect(messages(page).last()).toContainText('Sophia', { timeout: 15_000 })
  await expect(open(page)).not.toContainText('Sophia is answering…')
})

test('follow · once Sophia’s answer is seen the wait is over, even after newer messages push it off the page', async ({
  page,
}) => {
  await openBriefs(page)
  await field(page).fill('Sophia, which do readers finish?')
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(open(page)).toContainText('Sophia is answering…')
  await expect(open(page)).not.toContainText('Sophia is answering…')
  // A page's worth of plain messages: her answer is no longer in the newest page read.
  await ask(page).uncheck()
  for (const n of [1, 2, 3, 4, 5, 6]) {
    await field(page).fill(`Plain note ${String(n)}`)
    await open(page).getByRole('button', { name: 'Send' }).click()
    await expect(messages(page).last()).toContainText(`Plain note ${String(n)}`)
  }
  await row(page, READING).click()
  await row(page, BRIEFS).click()
  await expect(messages(page).last()).toContainText('Plain note 6')
  await expect(open(page)).not.toContainText('Sophia is answering…')
  await expect(open(page)).not.toContainText('Sophia hasn’t answered yet')
})

test('follow · a receipt that lands after the account was forgotten writes nothing and reads nothing', async ({
  page,
}) => {
  await openBriefs(page, '&send=slow')
  await ask(page).uncheck()
  await field(page).fill('Sent as the account goes')
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect.poll(async () => (await written(page, 'conversation-message')).length).toBe(1)
  // Signed out (or another identity) while it is on its way: the page reads afresh, then the receipt lands.
  const reads = async () =>
    (await served(page)).filter((s) => s.startsWith('messages:') || s === 'conversations:read').length
  const before = await reads()
  await page.evaluate(() => window.fixture?.forgetAccount())
  await expect.poll(reads).toBeGreaterThan(before)
  // The fresh reads done (the receipt comes 1.5 s after Send), counted before it lands.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)))
  expect(await served(page)).not.toContain('reply:message')
  const settled = await reads()
  await expect.poll(async () => (await served(page)).includes('reply:message'), { timeout: 5000 }).toBe(true)
  // Time for whatever the receipt would set off to be asked for.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
  expect(await reads()).toBe(settled)
})

test('follow · an accepted message shows even when reading the conversation again fails', async ({ page }) => {
  await openBriefs(page, '&send=thenFail')
  await ask(page).uncheck()
  await field(page).fill('Kept, whatever the read says')
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(messages(page).filter({ hasText: 'Kept, whatever the read says' })).toHaveCount(1)
  await expect(open(page)).toContainText('This may be out of date.')
  await expect(field(page)).toHaveValue('')
})

test('follow · a conversation with no messages says so', async ({ page }) => {
  await page.goto(PAGE.replace('conversations=1', 'conversations=quiet'))
  await row(page, 'A quiet question').click()
  await expect(open(page)).toContainText('Nobody has written here yet.')
})

test('follow · the project context says it is reading', async ({ page }) => {
  await page.goto(`${PAGE}&mission=hold`)
  const context = page.getByRole('complementary', { name: 'Project context' })
  await expect(context).toContainText('Reading the project’s context…')
  await page.evaluate(() => window.fixture?.holdMission(false))
  await expect(context).toContainText('Fixture direction')
})

test('follow · Send says it is sending while the message is on its way', async ({ page }) => {
  await openBriefs(page, '&send=slow')
  await ask(page).uncheck()
  await field(page).fill('On its way')
  await open(page).getByRole('button', { name: 'Send' }).click()
  await expect(open(page).getByRole('button', { name: 'Sending…' })).toHaveAttribute('aria-disabled', 'true')
  await expect(open(page).getByRole('button', { name: 'Send' })).toBeVisible()
})

test('follow · the first conversation of an empty project starts', async ({ page }) => {
  await page.goto(PAGE.replace('conversations=1', 'conversations=none'))
  await list(page).getByRole('button', { name: 'New conversation' }).click()
  await form(page).getByRole('textbox', { name: 'Question' }).fill('Where do we start?')
  await form(page).getByRole('textbox', { name: 'First message' }).fill('Here.')
  await form(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await form(page).getByRole('button', { name: 'Start' }).click()
  await expect(open(page).getByRole('heading', { level: 3 })).toHaveText('Where do we start?')
  expect(await written(page, 'conversation-start')).toHaveLength(1)
})

test('follow · a start that lands after a row was pressed is listed, and the row pressed stays open', async ({
  page,
}) => {
  await page.goto(`${PAGE}&start=slow`)
  await list(page).getByRole('button', { name: 'New conversation' }).click()
  await form(page).getByRole('textbox', { name: 'Question' }).fill('A slow start')
  await form(page).getByRole('textbox', { name: 'First message' }).fill('Taking its time.')
  await form(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await form(page).getByRole('button', { name: 'Start' }).click()
  await expect(form(page).getByRole('button', { name: 'Starting…' })).toBeVisible()
  await row(page, BRIEFS).click()
  await expect(titles(page).filter({ hasText: 'A slow start' })).toHaveCount(1, { timeout: 5000 })
  await expect(open(page).getByRole('heading', { level: 3 })).toHaveText(BRIEFS)
})
