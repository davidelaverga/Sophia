import { expect, test, type Locator, type Page } from '@playwright/test'

// A message that comes while the tab is hidden counts in its title (docs/plans/unread-title.md), as someone at the door
// already does; shown again, the count goes. The page's visibility is stood in for (`away`), and another member writes
// through the fixture (`say`).

const away = (page: Page, on: boolean) =>
  page.evaluate((hidden) => {
    Reflect.set(window, 'away', hidden)
    document.dispatchEvent(new Event('visibilitychange'))
  }, on)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => Reflect.get(window, 'away') === true })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (Reflect.get(window, 'away') === true ? 'hidden' : 'visible'),
    })
  })
})

test('unread · messages from another while the tab is hidden count in its title; shown again, the count goes', async ({
  page,
}) => {
  await page.goto('/room.html')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, true)
  await page.evaluate(() => window.fixture?.say('The deck is in Resources.'))
  await page.evaluate(() => window.fixture?.say('And the numbers too.'))
  await expect(page).toHaveTitle('(2) Fixture project · Sophia')
  await away(page, false)
  await expect(page).toHaveTitle('Fixture project · Sophia')
})

test('unread · a message rolled out of the snapshot’s 50 still counts (Codex P2 on #418)', async ({ page }) => {
  await page.goto('/room.html')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, true)
  await page.evaluate(() => window.fixture?.say('First while away.'))
  await expect(page).toHaveTitle('(1) Fixture project · Sophia')
  // Fifty more: the snapshot holds the latest 50 (fixtures/data.ts, as the API does), so the first leaves it.
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++) window.fixture?.say(`More ${String(i)}`)
  })
  await expect(page).toHaveTitle('(51) Fixture project · Sophia')
  await away(page, false)
  await expect(page).toHaveTitle('Fixture project · Sophia')
})

test('unread · a message while the tab is shown doesn’t count', async ({ page }) => {
  await page.goto('/room.html')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await page.evaluate(() => window.fixture?.say('Seen as it comes.'))
  await page.waitForTimeout(500)
  await expect(page).toHaveTitle('Fixture project · Sophia')
})

test('unread · the viewer’s own message, read before their membership, leaves the count once it is (Codex P2 on #444)', async ({
  page,
}) => {
  await page.goto('/room.html?membership=hold')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, true)
  // Written from the viewer's phone while this tab is hidden, and read before the page knows who the viewer is.
  await page.evaluate(() => window.fixture?.sayElsewhere('Sent from my phone.'))
  await page.evaluate(() => window.fixture?.say('The deck is in Resources.'))
  await expect(page).toHaveTitle('(2) Fixture project · Sophia')
  await page.evaluate(() => window.fixture?.releaseMembership())
  await expect(page).toHaveTitle('(1) Fixture project · Sophia')
  await away(page, false)
  await expect(page).toHaveTitle('Fixture project · Sophia')
})

// Shown again, the chat marks where the person left off (docs/plans/messages-while-away.md, costuras seam #10): a
// divider above the first message that came, and, where the divider is out of the chat's view, a line at its head
// with Jump. Once per absence; sending ends it.

const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const contributions = (page: Page) => page.getByRole('list', { name: 'Recent discussion' }).locator('.contribution')
const divider = (page: Page, words: string) => page.getByText(words, { exact: true })
const line = (page: Page) => page.getByRole('status').filter({ hasText: 'came while you were away' })
const history = (page: Page) => page.locator('.conversation-history')

/** Two messages from another member while the tab is hidden, the first «The deck is in Resources.», then back. */
async function backFromTwo(page: Page) {
  await away(page, true)
  await page.evaluate(() => window.fixture?.say('The deck is in Resources.'))
  await page.evaluate(() => window.fixture?.say('And the numbers too.'))
  await expect(page).toHaveTitle('(2) Fixture project · Sophia')
  await away(page, false)
  await expect(page).toHaveTitle('Fixture project · Sophia')
}

/** Whether the element lies wholly inside the chat's history, as the reader sees it. */
async function inHistory(page: Page, el: Locator) {
  const [box, at] = await Promise.all([history(page).boundingBox(), el.boundingBox()])
  return !!box && !!at && at.y >= box.y - 1 && at.y + at.height <= box.y + box.height + 1
}

test('away · back from two messages, the chat marks the first with a divider; in view, no line points at it (seam #10)', async ({
  page,
}) => {
  await page.goto('/room.html?discussion=3')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await backFromTwo(page)
  await chatToggle(page).click()
  const mark = divider(page, '2 messages came while you were away')
  await expect(mark).toBeVisible()
  // In the first one's line, above its words, after the three from before.
  const first = contributions(page).nth(3)
  await expect(first).toContainText('The deck is in Resources.')
  await expect(first.getByText('2 messages came while you were away', { exact: true })).toBeVisible()
  const [markAt, wordsAt] = await Promise.all([
    mark.boundingBox(),
    first.getByText('The deck is in Resources.').boundingBox(),
  ])
  expect((markAt?.y ?? 0) + (markAt?.height ?? 0)).toBeLessThanOrEqual(wordsAt?.y ?? 0)
  await expect(divider(page, '2 messages came while you were away')).toHaveCount(1)
  await expect(line(page)).toHaveCount(0)
})

test('away · the chat open while the tab was hidden: the divider shows all the same', async ({ page }) => {
  await page.goto('/room.html?discussion=3')
  await chatToggle(page).click()
  await expect(page.locator('#converse-draft')).toBeVisible()
  await backFromTwo(page)
  await expect(divider(page, '2 messages came while you were away')).toBeVisible()
  await expect(contributions(page).nth(3)).toContainText('2 messages came while you were away')
})

/** Thirty messages from another member while the tab is hidden, then back: the chat opens at the newest. */
async function backFromThirty(page: Page) {
  await away(page, true)
  await page.evaluate(() => {
    window.fixture?.say('The deck is in Resources.')
    for (let i = 1; i < 30; i++) window.fixture?.say(`More ${String(i)}`)
  })
  await expect(page).toHaveTitle('(30) Fixture project · Sophia')
  await away(page, false)
  await expect(page).toHaveTitle('Fixture project · Sophia')
}

/** The history moved, as the reader scrolls it, until the divider sits at its top. */
const readDownTo = (page: Page) =>
  history(page).evaluate((el) => {
    const at = el.querySelector('.while-away-divider')
    if (at) el.scrollTop += at.getBoundingClientRect().top - el.getBoundingClientRect().top - 8
  })

test('away · thirty while away, the chat opened at the newest: its head says so, and Jump goes to the first, once', async ({
  page,
}) => {
  await page.goto('/room.html?discussion=3')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await backFromThirty(page)
  await chatToggle(page).click()
  await expect(line(page)).toHaveText('30 messages came while you were away. Jump to the first')
  const mark = divider(page, '30 messages came while you were away')
  expect(await inHistory(page, mark)).toBe(false)
  await page.getByRole('button', { name: 'Jump to the first' }).click()
  await expect(mark).toBeFocused()
  await expect.poll(() => inHistory(page, mark)).toBe(true)
  await expect(line(page)).toHaveCount(0)
  // Once: back at the newest, the divider far again, hidden and shown with nothing new says nothing more.
  await history(page).evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect.poll(() => inHistory(page, mark)).toBe(false)
  await away(page, true)
  await away(page, false)
  await page.waitForTimeout(300)
  await expect(line(page)).toHaveCount(0)
  await expect(mark).toHaveCount(1)
})

test('away · hidden and shown with nothing new adds nothing, nor does a message while shown', async ({ page }) => {
  await page.goto('/room.html?discussion=3')
  await chatToggle(page).click()
  await away(page, true)
  await away(page, false)
  // Shown a moment: what the tab reads as it comes back has been read.
  await page.waitForTimeout(300)
  await page.evaluate(() => window.fixture?.say('Seen as it comes.'))
  await expect(page.getByText('Seen as it comes.')).toBeVisible()
  await expect(page.getByText(/came while you were away/)).toHaveCount(0)
})

test('away · sending from the bar ends it', async ({ page }) => {
  await page.goto('/room.html?discussion=3')
  await backFromTwo(page)
  await chatToggle(page).click()
  await expect(divider(page, '2 messages came while you were away')).toBeVisible()
  await page.locator('#converse-draft').fill('Reading them now.')
  await page.locator('#converse-draft').press('Enter')
  await expect(contributions(page).last()).toContainText('Reading them now.')
  await expect(page.getByText(/came while you were away/)).toHaveCount(0)
})

test('away · reading down to the divider, without Jump, ends the line for good', async ({ page }) => {
  await page.goto('/room.html?discussion=3')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await backFromThirty(page)
  await chatToggle(page).click()
  await expect(line(page)).toBeVisible()
  const mark = divider(page, '30 messages came while you were away')
  await readDownTo(page)
  await expect.poll(() => inHistory(page, mark)).toBe(true)
  await expect(line(page)).toHaveCount(0)
  // Back at the newest, the divider far again: the line doesn't come back.
  await history(page).evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect.poll(() => inHistory(page, mark)).toBe(false)
  await page.waitForTimeout(300)
  await expect(line(page)).toHaveCount(0)
})

test('away · the divider seen as the chat opens, reading back up brings no line', async ({ page }) => {
  await page.goto('/room.html?discussion=40')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await backFromTwo(page)
  await chatToggle(page).click()
  const mark = divider(page, '2 messages came while you were away')
  await expect.poll(() => inHistory(page, mark)).toBe(true)
  await history(page).evaluate((el) => (el.scrollTop = 0))
  await expect.poll(() => inHistory(page, mark)).toBe(false)
  await page.waitForTimeout(300)
  await expect(line(page)).toHaveCount(0)
})

test('away · the chat open and read far back while the tab was hidden: its head says so, and Jump goes down', async ({
  page,
}) => {
  await page.goto('/room.html?discussion=40')
  await chatToggle(page).click()
  await expect(contributions(page)).toHaveCount(40)
  await history(page).evaluate((el) => (el.scrollTop = 0))
  await backFromTwo(page)
  const mark = divider(page, '2 messages came while you were away')
  await expect(line(page)).toHaveText('2 messages came while you were away. Jump to the first')
  expect(await inHistory(page, mark)).toBe(false)
  await page.getByRole('button', { name: 'Jump to the first' }).click()
  await expect(mark).toBeFocused()
  await expect.poll(() => inHistory(page, mark)).toBe(true)
  await expect(line(page)).toHaveCount(0)
})

// The viewer's own message, written on another device while the tab was hidden, puts what came before it behind them
// (review P2 on seam #10): the report's «gone on sending» holds wherever they sent it.

test('away · answered from another device while the tab was hidden, nothing is left to mark', async ({ page }) => {
  await page.goto('/room.html?discussion=3')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, true)
  await page.evaluate(() => window.fixture?.say('The deck is in Resources.'))
  await page.evaluate(() => window.fixture?.sayElsewhere('Got it, reading it now.'))
  await expect(page).toHaveTitle('(1) Fixture project · Sophia')
  await away(page, false)
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await chatToggle(page).click()
  await expect(contributions(page).last()).toContainText('Got it, reading it now.')
  await page.waitForTimeout(300)
  await expect(page.getByText(/came while you were away/)).toHaveCount(0)
})

test('away · written from another device first, what came after it is still marked', async ({ page }) => {
  await page.goto('/room.html?discussion=3')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, true)
  await page.evaluate(() => window.fixture?.sayElsewhere('On my way.'))
  await page.evaluate(() => window.fixture?.say('The deck is in Resources.'))
  await expect(page).toHaveTitle('(1) Fixture project · Sophia')
  await away(page, false)
  await chatToggle(page).click()
  const marco = contributions(page).nth(4)
  await expect(marco).toContainText('The deck is in Resources.')
  await expect(marco.getByText('1 message came while you were away', { exact: true })).toBeVisible()
  await expect(
    contributions(page)
      .nth(3)
      .getByText(/came while you were away/),
  ).toHaveCount(0)
})

// What the feed brings only once the tab is shown came while away all the same (review P2 on seam #10): a phone's
// frozen page, or a laptop woken from sleep, gets the events after `visibilitychange`. `holdFeed` holds them meanwhile.

/** A moment for the reads already on their way to land (the feed's first events refresh the snapshot once more). */
const settled = (page: Page) => page.waitForTimeout(500)

test('away · nothing reached the hidden page, the feed held: back, the chat still marks the two', async ({ page }) => {
  await page.goto('/room.html?discussion=3')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await settled(page)
  await away(page, true)
  await page.evaluate(() => window.fixture?.holdFeed(true))
  await page.evaluate(() => window.fixture?.say('The deck is in Resources.'))
  await page.evaluate(() => window.fixture?.say('And the numbers too.'))
  await page.waitForTimeout(300)
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, false)
  await page.evaluate(() => window.fixture?.holdFeed(false))
  await chatToggle(page).click()
  await expect(divider(page, '2 messages came while you were away')).toBeVisible()
  await expect(contributions(page).nth(3)).toContainText('The deck is in Resources.')
  await expect(contributions(page).nth(3)).toContainText('2 messages came while you were away')
})

test('away · one counted before the feed was held, two after: back, the divider counts all three', async ({ page }) => {
  await page.goto('/room.html?discussion=3')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, true)
  await page.evaluate(() => window.fixture?.say('The deck is in Resources.'))
  await expect(page).toHaveTitle('(1) Fixture project · Sophia')
  await settled(page)
  await page.evaluate(() => window.fixture?.holdFeed(true))
  await page.evaluate(() => window.fixture?.say('And the numbers too.'))
  await page.evaluate(() => window.fixture?.say('And the plan.'))
  await page.waitForTimeout(300)
  await expect(page).toHaveTitle('(1) Fixture project · Sophia')
  await away(page, false)
  await page.evaluate(() => window.fixture?.holdFeed(false))
  await chatToggle(page).click()
  await expect(contributions(page)).toHaveCount(6)
  await expect(divider(page, '3 messages came while you were away')).toBeVisible()
  await expect(contributions(page).nth(3)).toContainText('3 messages came while you were away')
})
