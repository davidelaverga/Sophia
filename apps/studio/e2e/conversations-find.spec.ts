import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Conversations, found (docs/plans/conversations-find.md, C4): «Open» and «Mine» under the title filter, and quick asks
// that ask Sophia in one press. On the fixture page; only the API is faked, and each check ends by asking the page
// whether anything reached for it unanswered.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const titles = (page: Page) => rows(page).locator('.conv-title')
const show = (page: Page) => list(page).getByRole('group', { name: 'Show only' })
const openOnly = (page: Page) => show(page).getByRole('button', { name: 'Open', exact: true })
const mine = (page: Page) => show(page).getByRole('button', { name: 'Mine', exact: true })
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).getByRole('listitem')
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })
const asks = (page: Page) => open(page).getByRole('group', { name: 'Ask Sophia in one press' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('find · «Open» keeps the conversations with an open question; «Mine» those you wrote in; the list says how many', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(titles(page)).toHaveCount(3)
  await expect(openOnly(page)).toHaveAttribute('aria-pressed', 'false')
  await openOnly(page).click()
  await expect(openOnly(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(titles(page)).toHaveText(['What makes a report worth reading?', 'Test data for the first release'])
  await expect(list(page).getByText('2 of 3')).toBeVisible()
  await openOnly(page).click()
  await mine(page).click()
  // Marco and Lucía's, the briefs, is not yours.
  await expect(titles(page)).toHaveText(['What makes a report worth reading?', 'Test data for the first release'])
  // What a press left is said: the count is a status.
  await expect(list(page).getByRole('status')).toHaveText('2 of 3')
})

test('find · nothing left says so, and Clear brings every conversation back', async ({ page }) => {
  await page.goto(PAGE)
  await openOnly(page).click()
  await list(page).getByRole('searchbox', { name: 'Filter conversations' }).fill('briefs')
  await expect(list(page).locator('.conv-note')).toContainText('No conversation matches.')
  await expect(list(page).getByRole('status')).toHaveText('No conversation matches.')
  await list(page).getByRole('button', { name: 'Clear' }).click()
  await expect(titles(page)).toHaveCount(3)
  // Clear went with its note: the filter has the focus.
  await expect(list(page).getByRole('searchbox', { name: 'Filter conversations' })).toBeFocused()
  await expect(openOnly(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(list(page).getByRole('searchbox', { name: 'Filter conversations' })).toHaveValue('')
})

test('find · the filters wait while you are in another view, and are as left when you come back', async ({ page }) => {
  await page.goto(PAGE)
  await mine(page).click()
  const views = page.getByRole('navigation', { name: 'Project views' })
  await views.getByRole('link', { name: 'Knowledge', exact: true }).click()
  await expect(list(page)).toHaveCount(0)
  await views.getByRole('link', { name: 'Conversations', exact: true }).click()
  await expect(mine(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(titles(page)).toHaveCount(2)
})

test('find · a filter pressed before the membership arrives is still on after it', async ({ page }) => {
  await page.goto(`${PAGE}&membership=hold`)
  await expect(titles(page)).toHaveCount(3)
  await openOnly(page).click()
  await expect(openOnly(page)).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => window.fixture?.releaseMembership())
  // Once the reader is known (the field arrives with it), the press holds.
  await expect(field(page)).toBeVisible()
  await expect(openOnly(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(titles(page)).toHaveCount(2)
})

test('find · a quick ask asks Sophia in one press: its words are yours in the thread, and she answers', async ({
  page,
}) => {
  await page.goto(PAGE)
  await rows(page).nth(1).click() // Marco and Lucía's: Sophia isn't there yet
  await expect(messages(page)).toHaveCount(2)
  await expect(asks(page).getByRole('button')).toHaveText(['Sum it up', 'What’s still open?', 'What did we decide?'])
  const ask = open(page).getByRole('checkbox', { name: 'Ask Sophia' })
  await ask.uncheck() // the next note was to go to the team only: a quick ask leaves that as it is
  await asks(page).getByRole('button', { name: 'Sum it up' }).click()
  const asked = messages(page).filter({ hasText: 'Sum it up' })
  await expect(asked).toHaveCount(1)
  await expect(asked).toHaveClass(/\bmine\b/)
  await expect(field(page)).toHaveValue('')
  await expect(ask).not.toBeChecked()
  await expect.poll(async () => (await served(page)).includes('conversation-message:Sum it up:yes')).toBe(true)
  await expect(messages(page)).toHaveCount(4) // hers follows
  await expect(messages(page).last()).toContainText('Sophia')
})

test('find · the quick asks step aside once you write, and come back when the field is empty', async ({ page }) => {
  await page.goto(PAGE)
  await expect(asks(page)).toBeVisible()
  const thread = open(page).locator('.conv-scroll')
  const height = await thread.evaluate((el) => el.clientHeight)
  await field(page).fill('My own words')
  await expect(asks(page)).toBeHidden()
  // Its place is kept: the thread above doesn't jump.
  expect(await thread.evaluate((el) => el.clientHeight)).toBe(height)
  await field(page).fill('')
  await expect(asks(page)).toBeVisible()
})

test('find · a quick ask with no reply steps aside for Send, which sends it again', async ({ page }) => {
  await page.goto(`${PAGE}&send=lost`)
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  await asks(page).getByRole('button', { name: 'What did we decide?' }).click()
  await expect(open(page)).toContainText('Not confirmed: “What did we decide?”')
  await expect(asks(page)).toBeHidden()
  await expect(open(page).getByRole('button', { name: 'Send' })).toBeFocused()
})

test('find · a refused quick ask says why and leaves the focus on its chip', async ({ page }) => {
  await page.goto(`${PAGE}&send=refused`)
  await rows(page).nth(1).click()
  await expect(messages(page)).toHaveCount(2)
  const chip = asks(page).getByRole('button', { name: 'Sum it up' })
  await chip.click()
  await expect(open(page)).toContainText('That isn’t yours to write here.')
  await expect(asks(page)).toBeVisible()
  await expect(chip).toBeFocused()
})

test('find · the filters and the quick asks read at 4.5:1, on the app’s type sizes', async ({ page }) => {
  await page.goto(PAGE)
  await openOnly(page).click()
  for (const where of ['.conv-show', '.conv-quick']) {
    expect(await lowContrast(page, where)).toEqual([])
    const sizes = await typeSizes(page, where)
    for (const s of sizes) expect(['10.5px', '12px', '13px', '14px'], sizes.join(' ')).toContain(s)
  }
})

test('find @phone · the quick asks fit one row that scrolls, at a finger’s 40 px', async ({ page }) => {
  await page.goto(PAGE)
  await rows(page).first().click()
  const row = open(page).locator('.conv-quick')
  await expect(row).toBeVisible()
  const sized = await row.getByRole('button').evaluateAll((all) => all.map((b) => b.getBoundingClientRect().height))
  for (const h of sized) expect(h).toBeGreaterThanOrEqual(40)
  // One row: every chip on the first's line; the row scrolls rather than wraps or widens the page.
  const tops = await row
    .getByRole('button')
    .evaluateAll((all) => all.map((b) => Math.round(b.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  // The last is reached by scrolling the row, and shows whole.
  const last = row.getByRole('button').last()
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport({ ratio: 1 })
  // Scrolled to its end, the last chip stands clear of the fade (the row's last 28 px).
  await row.evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
  const [chip, edge] = await Promise.all([last.boundingBox(), row.boundingBox()])
  if (!chip || !edge) throw new Error('the row or its chip is missing')
  expect(chip.x + chip.width).toBeLessThanOrEqual(edge.x + edge.width - 28)
})
