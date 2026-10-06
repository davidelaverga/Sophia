import { expect, test, type Page } from '@playwright/test'

// Replies in the room's chat (docs/plans/room-chat-replies.md, A20 proposed): a message answers another, and the chat
// shows which. Behind the vision flag the fixture pages set; every word is synthetic.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const bar = (page: Page) => page.locator('#converse-draft')
const target = (page: Page) => page.locator('.message-bar .bar-target')
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const entries = (page: Page) => discussion(page).locator('.contribution')
const chip = (page: Page) => page.getByRole('status', { name: 'Replying' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const ORIGINAL = 'Let us keep the report to one page, with the sources inline.'

async function enter(page: Page, query = 'exchange=open') {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
  await page.evaluate((text) => window.fixture?.say(text), ORIGINAL)
  await chatToggle(page).click()
  await expect(entries(page)).toHaveCount(1)
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('replies · Reply shows what is answered above the bar, which writes to the room, the field focused', async ({
  page,
}) => {
  await enter(page)
  // Holding the floor with Sophia, the bar starts at Sophia: a reply moves it to the room.
  await expect(target(page)).toHaveText(/^To Sophia/)
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await expect(chip(page)).toContainText('Replying to')
  await expect(chip(page)).toContainText('“Let us keep the report to one page')
  await expect(target(page)).toHaveText(/^To the room/)
  await expect(bar(page)).toBeFocused()
})

test('replies · sent, the reply is recorded with what it answers, shows its quote, and the chip goes', async ({
  page,
}) => {
  await enter(page)
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await bar(page).fill('Agreed: one page.')
  await bar(page).press('Enter')
  await expect(entries(page)).toHaveCount(2)
  const reply = entries(page).last()
  await expect(reply).toContainText('Agreed: one page.')
  await expect(reply.getByRole('button', { name: /^Replying to .*: Let us keep the report/ })).toBeVisible()
  await expect(chip(page)).toHaveCount(0)
  expect((await served(page)).filter((s) => s.startsWith('contribution-reply:'))).toEqual([
    'contribution-reply:00000000-0000-4000-8000-000000000001',
  ])
})

test('replies · the quote takes you to the message it answers', async ({ page }) => {
  await enter(page)
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await bar(page).fill('Agreed: one page.')
  await bar(page).press('Enter')
  await entries(page)
    .last()
    .getByRole('button', { name: /^Replying to / })
    .click()
  await expect(entries(page).first()).toBeFocused()
})

test('replies · ✕ and Escape stop replying and keep the words', async ({ page }) => {
  await enter(page)
  const reply = entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
  await reply.click()
  await bar(page).fill('Half a reply')
  await chip(page).getByRole('button', { name: 'Stop replying' }).click()
  await expect(chip(page)).toHaveCount(0)
  await expect(bar(page)).toHaveValue('Half a reply')
  await reply.click()
  await bar(page).press('Escape')
  await expect(chip(page)).toHaveCount(0)
  await expect(bar(page)).toHaveValue('Half a reply')
})

test('replies · a reply to a message no longer in the discussion is refused, and says so', async ({ page }) => {
  await enter(page)
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await page.evaluate(() => window.fixture?.forgetDiscussion())
  await bar(page).fill('Too late to answer')
  await bar(page).press('Enter')
  await expect(page.locator('.composer')).toContainText('That message is no longer in the discussion.')
  await expect(bar(page)).toHaveValue('Too late to answer')
})

test('replies · controls are at least 24 px with a reply under way and a quote shown', async ({ page }) => {
  await enter(page)
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await bar(page).fill('Agreed: one page.')
  await bar(page).press('Enter')
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await expect(chip(page)).toBeVisible()
  const short = await page
    .locator('.discussion button:visible, .replying button:visible')
    .evaluateAll((all) =>
      all
        .map((el) => ({ name: el.getAttribute('aria-label') ?? '', h: el.getBoundingClientRect().height }))
        .filter((c) => c.h < 23.5),
    )
  expect(short).toEqual([])
})
