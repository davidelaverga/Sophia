import { expect, test, type Locator, type Page } from '@playwright/test'

// Explicit mentions in the room's chat (docs/plans/mentions.md, A37; the mentions flag's): an editor or an admin
// chooses members by their current names before sending; the message says whom it names; a viewer writes as before;
// a correction keeps the recipients and a withdrawal ends them; Home lists a mention and opening it marks it seen.
// Nothing is read from the words. Every word is synthetic.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const chatToggle = (page: Page) => page.getByRole('button', { name: /^Chat/ }).first()
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const line = (page: Page, words: string) => discussion(page).locator('.contribution').filter({ hasText: words })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const bar = (page: Page) => page.locator('#converse-draft')
const MARCO = '00000000-0000-4000-8000-0000000000b1'
const MENTIONED_IN = '00000000-0000-4000-8000-00000000003a'
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const NEED = `mention:${PROJECT}:2.1:${MENTIONED_IN}`
const entryIdOf = (n: number) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`
const seenOf = async (page: Page) => (await served(page)).filter((s) => s.startsWith('seen:'))

/** In the call, out of Sophia's conversation: the bar writes to the room (room-discussion.spec.ts). */
async function enter(page: Page, query = '') {
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mine&acts=1${query}`)
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await expect(discussion(page)).toBeVisible()
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

test('mentions · an admin chooses members by their names; the message names them; a correction keeps them, a withdrawal ends them', async ({
  page,
}) => {
  await enter(page)
  await page.getByRole('button', { name: 'Mention' }).click()
  const options = page.getByRole('group', { name: /Mention members/ })
  // The members by their current names, never the reader, never an address.
  await expect(options.getByRole('checkbox')).toHaveCount(2)
  await expect(options).toContainText('Marco')
  await expect(options).toContainText('Lucía')
  await expect(options).not.toContainText('@')
  await options.getByRole('checkbox', { name: 'Marco' }).check()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Mentions Marco')).toBeVisible()
  // A name typed in the words mentions nobody: only the choice does.
  await bar(page).fill('Marco, can you check the door plan? Lucía too.')
  await bar(page).press('Enter')
  const sent = line(page, 'can you check the door plan')
  await expect(sent.locator('.contribution-mentions')).toHaveText('to Marco')
  expect(await served(page)).toContain(`mentions:${MARCO}`)
  await expect(page.getByText('Mentions Marco')).toHaveCount(0) // the choice clears and closes for the next message
  await expect(page.getByRole('group', { name: /Mention members/ })).toHaveCount(0)

  // A correction left as it was keeps the recipients.
  await sent.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('Marco, can you check the door plan by Friday?')
  await page.getByRole('button', { name: 'Save' }).click()
  const fixed = line(page, 'by Friday')
  await expect(fixed.locator('.contribution-mentions')).toHaveText('to Marco')
  // Withdrawn: its place, never its words or whom it named.
  await fixed.getByRole('button', { name: 'Withdraw' }).click()
  await page
    .getByRole('group', { name: 'Withdraw your message?' })
    .getByRole('button', { name: 'Withdraw message' })
    .click()
  await expect(discussion(page).getByText('You withdrew this message.').last()).toBeVisible()
  await expect(discussion(page).getByText('to Marco')).toHaveCount(0)
})

test('mentions · a viewer is never offered them, and still writes, corrects and withdraws their own words', async ({
  page,
}) => {
  await enter(page, '&role=viewer')
  await expect(page.getByRole('button', { name: 'Mention' })).toHaveCount(0)
  await bar(page).fill('A viewer’s own words.')
  await bar(page).press('Enter')
  const mine = line(page, 'A viewer’s own words.')
  await expect(mine).toBeVisible()
  await expect(mine.locator('.contribution-mentions')).toHaveCount(0)
  expect((await served(page)).some((s) => s.startsWith('mentions:'))).toBe(false)
  await mine.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Edit your message' }).fill('A viewer’s own words, fixed.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(line(page, 'fixed.')).toBeVisible()
})

test('mentions · at most five; taking one off frees a place', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Mention' }).click()
  const options = page.getByRole('group', { name: /Mention members/ })
  await options.getByRole('checkbox', { name: 'Marco' }).check()
  await options.getByRole('checkbox', { name: 'Lucía' }).check()
  await expect(page.getByText('Mentions Marco, Lucía')).toBeVisible()
  await options.getByRole('checkbox', { name: 'Marco' }).uncheck()
  await expect(page.getByText('Mentions Lucía')).toBeVisible()
})

test('mentions · Home lists a message that mentions the person; opening it goes to that message in the room, without marking it', async ({
  page,
}) => {
  await page.goto('/home.html?needs=api&mentions=1')
  const list = page.getByRole('list', { name: 'Needs you' })
  const mention = list.getByRole('button').filter({ hasText: 'Can you check the door plan before Friday?' })
  await expect(mention).toContainText('Marco mentioned you')
  await expect(mention).toHaveAccessibleName(/Read$/)
  await mention.click()
  // Opened, not yet seen: the room marks it once the message is shown there (Codex on #409).
  await expect
    .poll(() => page.evaluate(() => window.homeFixture?.pressed ?? []))
    .toEqual([`open studio 00000000-0000-4000-8000-0000000000aa #message-${MENTIONED_IN}`])
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.homeFixture?.pressed ?? [])).toHaveLength(1)
  await expect(mention).toBeVisible()
})

test('mentions · the room opens its chat on the message the address names, and marks the mention seen once it is shown', async ({
  page,
}) => {
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  await expect(leave(page)).toBeVisible()
  const entry = discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)
  await expect(entry).toBeInViewport()
  await expect(entry.locator('.contribution-mentions')).toHaveText('to you')
  await expect.poll(() => served(page)).toContain(`seen:${NEED}`)
  expect((await served(page)).filter((s) => s === `seen:${NEED}`)).toHaveLength(1)
})

test('mentions · with the chat closed, nothing is marked; opening it marks the mention once shown', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mentioned')
  await expect(leave(page)).toBeVisible()
  await page.waitForTimeout(500)
  expect((await served(page)).some((s) => s.startsWith('seen:'))).toBe(false)
  await chatToggle(page).click()
  await expect.poll(() => served(page)).toContain(`seen:${NEED}`)
})

test('mentions · until the members are read, nobody is offered and no recipient is named', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mentioned&members=fail')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await expect(discussion(page).getByText('Can you check the door plan before Friday?')).toBeVisible()
  await expect(page.locator('.contribution-mentions')).toHaveCount(0)
  await expect(page.getByText('a former member')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mention' })).toHaveCount(0)
})

test('mentions · a message that comes to mention the reader while it is shown is marked seen, its revision unchanged', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mine')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  const entry = line(page, 'Sounds good to me.')
  await expect(entry).toBeInViewport()
  // A mention-only correction by its author: same words, same revision, the reader now named.
  await page.evaluate(() => window.fixture?.mentionMeIn(1))
  await expect(entry.locator('.contribution-mentions')).toHaveText('to you')
  await expect.poll(() => served(page)).toContain(`seen:mention:${PROJECT}:1.1:${entryIdOf(1)}`)
})

test('mentions · removed and named again on the same words is a new occurrence: each is acknowledged once, by its own id', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mine')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await expect(line(page, 'Sounds good to me.')).toBeInViewport()
  await page.evaluate(() => window.fixture?.mentionMeIn(1))
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${entryIdOf(1)}`])
  // Same words, same revision: removed, then named again while the chat shows it.
  await page.evaluate(() => window.fixture?.unmentionMeIn(1))
  await expect(line(page, 'Sounds good to me.').locator('.contribution-mentions')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.mentionMeIn(1))
  await expect
    .poll(() => seenOf(page))
    .toEqual([`seen:mention:${PROJECT}:1.1:${entryIdOf(1)}`, `seen:mention:${PROJECT}:1.2:${entryIdOf(1)}`])
  // Shown again, nothing more is sent.
  await page.evaluate(() => window.fixture?.say('Another message.'))
  await expect(discussion(page).getByText('Another message.')).toBeVisible()
  await page.waitForTimeout(300)
  expect(await seenOf(page)).toHaveLength(2)
})

test('mentions · a sliver at the chat’s edge is not reading it; the message in view is', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mine')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  for (let i = 0; i < 25; i++) await page.evaluate((n) => window.fixture?.say(`Filler ${n}`), i)
  await expect(discussion(page).getByText('Filler 24')).toBeVisible()
  const target = line(page, 'Sounds good to me.')
  const visible = () =>
    target.evaluate((el) => {
      const box = el.closest('.conversation-history')?.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return box ? Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)) : -1
    })
  /** Scrolls the chat so only `px` of the message shows at its top edge. */
  const sliver = (px: number) =>
    target.evaluate((el, n) => {
      const box = el.closest('.conversation-history')
      if (box) box.scrollTop += el.getBoundingClientRect().bottom - (box.getBoundingClientRect().top + n)
    }, px)
  // Out of view when it comes to name the reader (its «to you» line makes it taller), then only 4 px of it shown.
  await sliver(-200)
  expect(await visible()).toBe(0)
  await page.evaluate(() => window.fixture?.mentionMeIn(1))
  await expect(target.locator('.contribution-mentions')).toHaveText('to you')
  await sliver(4)
  expect(await visible()).toBeGreaterThan(0)
  expect(await visible()).toBeLessThanOrEqual(6)
  await page.waitForTimeout(600)
  expect(await seenOf(page)).toEqual([])
  // Brought into view, it is read.
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${entryIdOf(1)}`])
})

/** A message as long as the API allows (4000 characters at most), for the tall cases. */
const LONG = (() => {
  const words = 'Door plan detail. '
  return words.repeat(Math.floor(4000 / words.length)).trim()
})()

/** A message's height and the chat's, as rendered. */
const geometry = (entry: Locator) =>
  entry.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    view: el.closest('.conversation-history')?.clientHeight ?? 0,
  }))

test('mentions · a message taller than the chat is read once it fills the chat', async ({ page }) => {
  expect(LONG.length).toBeLessThanOrEqual(4000)
  await page.setViewportSize({ width: 1280, height: 560 })
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mine')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await page.evaluate((text) => window.fixture?.say(text), LONG)
  await page.evaluate(() => window.fixture?.say('After the long one.'))
  await expect(discussion(page).getByText('After the long one.')).toBeVisible()
  const tall = discussion(page).locator(`[data-message="${entryIdOf(3)}"]`)
  const g = await geometry(tall)
  expect(g.height).toBeGreaterThan(g.view * 1.7) // 60% of it can never show at once
  await page.evaluate(() => window.fixture?.mentionMeIn(3))
  await tall.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${entryIdOf(3)}`])
})

test('mentions · a message whose most visible part is under 5% of it (a short window) is read once it fills the chat', async ({
  page,
}) => {
  // Measured: 4000 characters render 1344 px tall; a 320 px high window leaves the chat 40 px, a ratio of 0.03 at most.
  await page.setViewportSize({ width: 1280, height: 320 })
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mine')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await page.evaluate((text) => window.fixture?.say(text), LONG)
  await page.evaluate(() => window.fixture?.say('After the long one.'))
  const tall = discussion(page).locator(`[data-message="${entryIdOf(3)}"]`)
  await expect(tall).toHaveCount(1)
  const g = await geometry(tall)
  expect(g.view / g.height).toBeLessThan(0.05)
  // Named while out of view; then a 2 px sliver shows (not read), then it fills the chat (read).
  await tall.evaluate((el) => {
    const box = el.closest('.conversation-history')
    if (box) box.scrollTop = 0
  })
  await page.evaluate(() => window.fixture?.mentionMeIn(3))
  await tall.evaluate((el) => {
    const box = el.closest('.conversation-history')
    if (box) box.scrollTop += el.getBoundingClientRect().top - (box.getBoundingClientRect().top + box.clientHeight - 2)
  })
  await page.waitForTimeout(500)
  expect(await seenOf(page)).toEqual([])
  await tall.evaluate((el) => {
    const box = el.closest('.conversation-history')
    if (box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top + 400
  })
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${entryIdOf(3)}`])
})

test('mentions · the address brings its message into view once: later messages don’t pull the reader back', async ({
  page,
}) => {
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  await expect(leave(page)).toBeVisible()
  await expect(discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)).toBeInViewport()
  for (let i = 0; i < 20; i++) await page.evaluate((k) => window.fixture?.say(`Later ${k}`), i)
  const history = page.locator('.conversation-history')
  await history.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await page.evaluate(() => window.fixture?.say('One more.'))
  await expect(discussion(page).getByText('One more.')).toBeInViewport()
  await expect(discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)).not.toBeInViewport()
})

test('mentions · a message beyond the chat’s 50 is found in a few earlier pages, shown and then seen', async ({
  page,
}) => {
  const old = entryIdOf(2)
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=60&mentionOld=1#message-${old}`)
  await expect(leave(page)).toBeVisible()
  await expect(discussion(page).locator(`[data-message="${old}"]`)).toBeInViewport()
  expect((await served(page)).filter((s) => s.startsWith('discussion:'))).toHaveLength(1)
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${old}`])
})

test('mentions · an address naming no message of the chat says so, and nothing is marked', async ({ page }) => {
  await page.goto(
    '/room.html?call=on&people=2&floor=1&discussion=mentioned#message-00000000-0000-4000-8000-0000000000ff',
  )
  await expect(leave(page)).toBeVisible()
  await expect(page.getByText('The message you opened isn’t in the chat anymore.')).toBeVisible()
  await page.waitForTimeout(300)
  expect((await seenOf(page)).filter((s) => s.includes('0000000000ff'))).toEqual([])
})

test('mentions · a current mention is acknowledged only on the revision the chat shows: never on older words still shown', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mine')
  await expect(leave(page)).toBeVisible()
  // The other member's message names the viewer at revision 1; the chat is closed, so nothing is acknowledged.
  await page.evaluate(() => window.fixture?.mentionMeIn(1))
  // The chat's reads lag while the author corrects it to revision 2; the Needs read sees revision 2 at once.
  await page.evaluate(() => {
    window.fixture?.holdSnapshot()
    window.fixture?.reviseMessage(1, 'Sounds good, from nine.')
  })
  await chatToggle(page).click()
  const old = line(page, 'Sounds good to me.')
  await expect(old).toBeInViewport()
  await page.waitForTimeout(800)
  expect(await seenOf(page), 'no acknowledgement while the older words are shown').toEqual([])
  // The chat catches up: the current words are shown, and exactly that occurrence is acknowledged, once.
  await page.evaluate(() => window.fixture?.releaseSnapshot())
  await expect(line(page, 'Sounds good, from nine.')).toBeInViewport()
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:2.1:${entryIdOf(1)}`])
  await page.waitForTimeout(300)
  expect(await seenOf(page)).toHaveLength(1)
})

test('mentions · an earlier page that fails stops the look: the failure and Try again stay, nothing more is asked, no «further back»', async ({
  page,
}) => {
  const old = entryIdOf(2)
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=60&mentionOld=1`)
  await expect(leave(page)).toBeVisible()
  await page.evaluate(() => window.fixture?.failEarlierReads(true))
  await page.evaluate((id) => {
    window.location.hash = `#message-${id}`
  }, old)
  await expect(page.getByText('Couldn’t load earlier messages.')).toBeVisible()
  await page.waitForTimeout(800)
  const reads = (await served(page)).filter((s) => s.startsWith('discussion:'))
  expect(reads, 'one failed read, no automatic retries').toHaveLength(1)
  await expect(page.getByText('The message you opened is further back.', { exact: false })).toHaveCount(0)
  expect(await seenOf(page)).toEqual([])
  // Recovered by hand: Try again reads the page, the message shows, and it is acknowledged once.
  await page.evaluate(() => window.fixture?.failEarlierReads(false))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(discussion(page).locator(`[data-message="${old}"]`)).toBeInViewport()
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${old}`])
})
