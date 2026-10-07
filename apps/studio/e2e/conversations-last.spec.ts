import { expect, test, type Page } from '@playwright/test'

// Conversations, rows by their last message (docs/plans/conversations-last.md, C5): where the list says each one's newest
// message (A18 proposed; the fixture's `last=1`), a row's line is it, who said it first; else Sophia's summary. On the
// fixture page; only the API is faked.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const gists = (page: Page) => list(page).locator('.conv-gist')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('last · each row says its last message, who said it first', async ({ page }) => {
  await page.goto(`${PAGE}&last=1`)
  await expect(gists(page)).toHaveText([
    'You: Let’s look at it together tomorrow.',
    'Lucía: One page, with the sources inline, then.',
    /^Sophia: /,
  ])
  // Said to a screen reader too: the line is part of the row's description.
  await expect(list(page).getByRole('listitem').getByRole('button').first()).toHaveAccessibleDescription(
    /You: Let’s look at it together/,
  )
})

test('last · a note sent moves its row to the top, its line now the note', async ({ page }) => {
  await page.goto(`${PAGE}&last=1`)
  await list(page)
    .getByRole('button', { name: /Short or long briefs/ })
    .click()
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await field(page).fill('Two pages at most.')
  await field(page).press('Enter')
  await expect(gists(page).first()).toHaveText('You: Two pages at most.')
})

test('last · where the list doesn’t say it, the row keeps Sophia’s summary', async ({ page }) => {
  await page.goto(PAGE)
  await expect(gists(page).first()).toHaveText(/^Compared a short brief/)
})
