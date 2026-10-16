import { expect, test, type Page } from '@playwright/test'

// The open conversation in the address (docs/plans/conversation-address.md): opening one puts `#conversation-<id>` in
// the address, an address naming one opens it, and the newest open by default leaves the address plain. Behind the
// vision flag the fixture pages set; every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const BRIEFS = '00000000-0000-4000-8000-0000000000c2'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const heading = (page: Page) => open(page).getByRole('heading', { level: 3 })
const hash = (page: Page) => page.evaluate(() => window.location.hash)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('address · opening a conversation puts it in the address, with no new history entry', async ({ page }) => {
  await page.goto(PAGE)
  await expect(heading(page)).toHaveText('What makes a report worth reading?')
  expect(await hash(page)).toBe('')
  const before = await page.evaluate(() => window.history.length)
  await rows(page).nth(1).click()
  await expect(heading(page)).toHaveText('Short or long briefs?')
  await expect.poll(() => hash(page)).toBe(`#conversation-${BRIEFS}`)
  expect(await page.evaluate(() => window.history.length)).toBe(before)
})

test('address · an address naming a conversation opens it', async ({ page }) => {
  await page.goto(`${PAGE}#conversation-${BRIEFS}`)
  await expect(heading(page)).toHaveText('Short or long briefs?')
  await expect(rows(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
  expect(await hash(page)).toBe(`#conversation-${BRIEFS}`)
})

test('address · one that isn’t there says so, with the newest open', async ({ page }) => {
  await page.goto(`${PAGE}#conversation-00000000-0000-4000-8000-0000000000ff`)
  await expect(list(page).locator('.conv-note')).toHaveText(
    'The conversation asked for isn’t here: the newest is open.',
  )
  await expect(heading(page)).toHaveText('What makes a report worth reading?')
})

test('address · New conversation takes the conversation out of the address', async ({ page }) => {
  await page.goto(`${PAGE}#conversation-${BRIEFS}`)
  await expect(heading(page)).toHaveText('Short or long briefs?')
  await list(page).getByRole('button', { name: 'New conversation' }).click()
  await expect.poll(() => hash(page)).toBe('')
})

test('address @phone · the address shows the conversation alone; back to the list lets it go', async ({ page }) => {
  await page.goto(`${PAGE}#conversation-${BRIEFS}`)
  await expect(heading(page)).toHaveText('Short or long briefs?')
  await expect(list(page)).toBeHidden()
  await open(page).getByRole('button', { name: 'All conversations' }).click()
  await expect(list(page)).toBeVisible()
  await expect.poll(() => hash(page)).toBe('')
})
