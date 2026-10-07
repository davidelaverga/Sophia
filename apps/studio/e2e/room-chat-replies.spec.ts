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
  await expect(reply.getByRole('button', { name: /^Go to .*message: Let us keep the report/ })).toBeVisible()
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
    .getByRole('button', { name: /^Go to / })
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
  // Escape let the reply go, not the chat: the panel is open and the bar keeps the focus.
  await expect(discussion(page)).toBeVisible()
  await expect(bar(page)).toBeFocused()
})

test('replies · a quote whose message left the discussion stays, as plain words', async ({ page }) => {
  await enter(page)
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await bar(page).fill('Agreed: one page.')
  await bar(page).press('Enter')
  await expect(entries(page)).toHaveCount(2)
  await page.evaluate(() => window.fixture?.dropOldest())
  await expect(entries(page)).toHaveCount(1)
  await expect(entries(page).first().locator('.contribution-quote')).toContainText('Let us keep the report')
  await expect(
    entries(page)
      .first()
      .getByRole('button', { name: /^Go to / }),
  ).toHaveCount(0)
})

test('replies · moving the bar to Sophia lets the reply go', async ({ page }) => {
  await enter(page)
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await expect(target(page)).toHaveText(/^To the room/)
  await target(page).click()
  await expect(target(page)).toHaveText(/^To Sophia/)
  await expect(chip(page)).toHaveCount(0)
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

test('replies · a reply chosen while the last one is sending stays, and the next goes as that reply', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.say('Two pages, then, with the sources at the end.'))
  await expect(entries(page)).toHaveCount(2)
  await page.evaluate(() => window.fixture?.holdMessages(true))
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await bar(page).fill('One page.')
  await bar(page).press('Enter')
  // While it goes, the second message is answered.
  await entries(page)
    .nth(1)
    .getByRole('button', { name: /^Reply to / })
    .click()
  await expect(chip(page)).toContainText('Two pages, then')
  await page.evaluate(() => window.fixture?.releaseMessages())
  // Recorded: the bar lets go of what was sent, and the reply chosen meanwhile stays.
  await expect(bar(page)).toHaveValue('')
  await expect(chip(page)).toContainText('Two pages, then')
  await bar(page).fill('Sources at the end, agreed.')
  await bar(page).press('Enter')
  await expect(entries(page)).toHaveCount(4)
  await expect(entries(page).last().locator('.contribution-quote')).toContainText('Two pages, then')
})

test('replies · a failed read of the links says so, and Try again brings the quotes back', async ({ page }) => {
  await enter(page)
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await page.evaluate(() => window.fixture?.failReplies(true))
  await bar(page).fill('Agreed: one page.')
  await bar(page).press('Enter')
  await expect(entries(page)).toHaveCount(2)
  const failed = page.getByText(/^Replies didn’t load/)
  await expect(failed).toBeVisible()
  await expect(entries(page).last()).toContainText('Agreed: one page.')
  await page.evaluate(() => window.fixture?.failReplies(false))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(entries(page).last().locator('.contribution-quote')).toContainText('Let us keep the report')
  await expect(failed).toHaveCount(0)
  // Try again went with the line: the focus it held is at the message field, not lost to the page.
  await expect(bar(page)).toBeFocused()
})

test('replies · the failure stays put as messages come: no blink, not read out again', async ({ page }) => {
  await enter(page)
  // The line is in the page before anything fails, empty, so its words are read out when they come.
  await expect(page.locator('.replies-state[role="status"]')).toBeEmpty()
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await bar(page).fill('Agreed: one page.')
  await bar(page).press('Enter')
  const quote = entries(page).nth(1).locator('.contribution-quote')
  await expect(quote).toContainText('Let us keep the report')
  await page.evaluate(() => window.fixture?.failReplies(true))
  await page.evaluate(() => window.fixture?.say('Two pages, then.'))
  const failed = page.getByText(/^Replies didn’t load/)
  await expect(failed).toBeVisible()
  // The links read before stay: a reply read well a moment ago doesn't turn into a message on its own.
  await expect(quote).toContainText('Let us keep the report')
  // Every change to the line from here on, as a screen reader would hear it, kept on the page as `data-heard`.
  await page.evaluate(() => {
    const history = document.querySelector('.conversation-history')
    let last = document.querySelector('.replies-state')?.textContent ?? 'gone'
    const note = () => {
      const now = document.querySelector('.replies-state')?.textContent ?? 'gone'
      if (now === last) return
      last = now
      document.body.dataset['heard'] = `${document.body.dataset['heard'] ?? ''}|${now}`
    }
    if (history) new MutationObserver(note).observe(history, { subtree: true, childList: true, characterData: true })
  })
  const reads = async () => (await served(page)).filter((s) => s === 'replies:failed').length
  const before = await reads()
  await page.evaluate(() => window.fixture?.say('Sources at the end.'))
  await expect(entries(page)).toHaveCount(4)
  // The new message's read and its one retry both fail.
  await expect.poll(reads).toBeGreaterThanOrEqual(before + 2)
  await expect(failed).toBeVisible()
  await expect(page.locator('body')).not.toHaveAttribute('data-heard')
})

test('replies · with nothing in the discussion, no word about replies', async ({ page }) => {
  await page.goto('/room.html?call=on&exchange=open')
  await expect(leave(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.failReplies(true))
  await page.evaluate(() => window.fixture?.update())
  await expect.poll(async () => (await served(page)).includes('replies:failed')).toBe(true)
  await chatToggle(page).click()
  await expect(page.getByText('Messages stay in this conversation.', { exact: false })).toBeVisible()
  // Not even the empty line that would say it: nothing here is a reply.
  await expect(page.locator('.replies-state')).toHaveCount(0)
})

test('replies · ✕ gives the focus back to the message field', async ({ page }) => {
  await enter(page)
  await entries(page)
    .first()
    .getByRole('button', { name: /^Reply to / })
    .click()
  await chip(page).getByRole('button', { name: 'Stop replying' }).focus()
  await page.keyboard.press('Enter')
  await expect(chip(page)).toHaveCount(0)
  await expect(bar(page)).toBeFocused()
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
