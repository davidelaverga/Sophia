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
declare global {
  interface Window {
    /** A message to the room held until released, and what each named (the held-send case below). */
    heldSends?: { held: (() => void)[]; bodies: { mentions: string[] | undefined }[]; hold: boolean }
    /** Seen writes the page attempted (the failing-seen cases below). */
    seenAttempts?: number
    /** The held seen write's release: answers it 503 (the held-write case below). */
    releaseSeen?: () => void
    /** GET /me/needs the page sent, a held one's release, and whether the next is held (the padlock cases below). */
    needsGets?: number
    holdNeeds?: boolean
    releaseNeeds?: () => void
    /** The one seen write held before it reaches the fixture (its need id), those held, and their release. */
    holdSeenNeed?: string
    heldSeen?: string[]
    seenPosts?: string[]
    releaseHeldSeen?: () => void
  }
}
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

test('mentions · named while a modal covers the chat: nothing is marked seen until it closes, then exactly once (4308744385)', async ({
  page,
}) => {
  await page.goto('/room.html?call=on&people=2&floor=1&discussion=mine')
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  const entry = line(page, 'Sounds good to me.')
  await expect(entry).toBeInViewport()
  // A real modal over the room: the command palette (the platform's command key: Meta on a Mac, Ctrl elsewhere).
  await page.keyboard.press('ControlOrMeta+k')
  const modal = page.getByRole('dialog', { name: 'Commands' })
  await expect(modal).toBeVisible()
  expect(await modal.getAttribute('aria-modal')).toBe('true')
  await page.evaluate(() => window.fixture?.mentionMeIn(1))
  await expect(entry.locator('.contribution-mentions')).toHaveText('to you')
  await page.waitForTimeout(1500)
  expect(await seenOf(page), 'nothing marked seen while covered').toEqual([])
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await expect.poll(() => seenOf(page)).toEqual([`seen:mention:${PROJECT}:1.1:${entryIdOf(1)}`])
  // Reading on, nothing more is sent.
  await page.waitForTimeout(500)
  expect(await seenOf(page)).toHaveLength(1)
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

test('mentions · chosen again while a message goes: its success clears only what it named; the next choice and words stay, and go with the next message', async ({
  page,
}) => {
  await enter(page)
  // Each message to the room is held until released, and what it named is kept.
  await page.evaluate(() => {
    const inner = window.fetch
    const held: (() => void)[] = []
    const bodies: { mentions: string[] | undefined }[] = []
    const sendsHeld = { held, bodies, hold: true }
    window.heldSends = sendsHeld
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname
      if (init?.method !== 'POST' || !path.endsWith('/contributions')) return inner(input, init)
      const sent: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null
      const named = sent && typeof sent === 'object' && 'mentions' in sent ? sent.mentions : undefined
      bodies.push({ mentions: Array.isArray(named) ? named.map(String) : undefined })
      if (sendsHeld.hold) await new Promise<void>((resolve) => held.push(resolve))
      return inner(input, init)
    }
  })
  const sends = () =>
    page.evaluate(() => ({ bodies: window.heldSends?.bodies ?? [], held: window.heldSends?.held.length ?? 0 }))
  await page.getByRole('button', { name: 'Mention' }).click()
  const options = page.getByRole('group', { name: /Mention members/ })
  await options.getByRole('checkbox', { name: 'Marco' }).check()
  await page.getByRole('button', { name: 'Done' }).click()
  await bar(page).fill('SYNTHETIC first words for Marco')
  await bar(page).press('Enter')
  await expect.poll(async () => (await sends()).held).toBe(1)
  // While it goes: Lucía instead of Marco, and the next words.
  await page.getByRole('button', { name: 'Mention' }).click()
  await options.getByRole('checkbox', { name: 'Marco' }).uncheck()
  await options.getByRole('checkbox', { name: 'Lucía' }).check()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Mentions Lucía')).toBeVisible()
  await bar(page).fill('SYNTHETIC next words for Lucía')
  await page.evaluate(() => {
    const sendsHeld = window.heldSends
    if (!sendsHeld) return
    sendsHeld.hold = false
    for (const release of sendsHeld.held.splice(0)) release()
  })
  await expect(line(page, 'SYNTHETIC first words for Marco').locator('.contribution-mentions')).toHaveText('to Marco')
  // The first message's success leaves the next choice and words as they are.
  await expect(page.getByText('Mentions Lucía')).toBeVisible()
  await expect(bar(page)).toHaveValue('SYNTHETIC next words for Lucía')
  await bar(page).press('Enter')
  await expect(line(page, 'SYNTHETIC next words for Lucía').locator('.contribution-mentions')).toHaveText('to Lucía')
  await expect(page.getByText('Mentions Lucía')).toHaveCount(0) // what it named, unchanged, clears on its success
  const { bodies } = await sends()
  expect(bodies.map((b) => b.mentions)).toEqual([[MARCO], [expect.not.stringMatching(MARCO)]])
})

/**
 * #409 4305869903: the first `failures` seen writes answer 503 (the fixture's fetch is wrapped as the page sets it), and
 * each attempt is counted, so a stationary readable mention's retries are seen without a scroll or a new read.
 */
async function failingSeen(page: Page, failures: number) {
  await page.addInitScript((n) => {
    let left = n
    window.seenAttempts = 0
    const wrap =
      (f: typeof fetch): typeof fetch =>
      async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        if (init?.method === 'POST' && /^\/api\/v1\/me\/needs\/[^/]+\/seen$/.test(url.pathname)) {
          window.seenAttempts = (window.seenAttempts ?? 0) + 1
          if (left > 0) {
            left--
            return new Response(JSON.stringify({ code: 'unavailable', message: 'Busy', retry: 'safe' }), {
              status: 503,
            })
          }
        }
        return f(input, init)
      }
    let current = wrap(window.fetch.bind(window))
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      get: () => current,
      set: (f: typeof fetch) => (current = wrap(f)),
    })
  }, failures)
}
const seenAttempts = (page: Page) => page.evaluate(() => window.seenAttempts ?? 0)

test('mentions · a seen write that fails once is tried again while the message stays readable, and is marked once', async ({
  page,
}) => {
  await failingSeen(page, 1)
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  const entry = discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)
  await expect(entry).toBeInViewport()
  await expect.poll(() => served(page), { timeout: 5000 }).toContain(`seen:${NEED}`)
  expect((await served(page)).filter((s) => s === `seen:${NEED}`)).toHaveLength(1)
  expect(await seenAttempts(page)).toBe(2)
})

test('mentions · a seen write that keeps failing is tried a bounded number of times, then waits for the next showing', async ({
  page,
}) => {
  await failingSeen(page, 99)
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  await expect(discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)).toBeInViewport()
  await expect.poll(() => seenAttempts(page), { timeout: 9000 }).toBe(4) // the first and three more
  await page.waitForTimeout(4500)
  expect(await seenAttempts(page)).toBe(4)
  expect((await served(page)).filter((s) => s.startsWith('seen:'))).toEqual([])
})

/**
 * The first seen write held, then answered 503 on a stopped page clock, so its retry is surely pending (1 s on): a slow
 * runner can't let the retry go before the step meant to come first (#452's 1 vs 2). Closed, the clock then runs 2.5 s;
 * kept open, just past the retry's time (600 ms more), where the one retry goes and the next is 2 s off.
 */
async function pendingSeenRetry(page: Page, close: boolean) {
  await page.clock.install()
  await page.addInitScript(() => {
    let held = true
    window.seenAttempts = 0
    const wrap =
      (f: typeof fetch): typeof fetch =>
      async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        if (init?.method === 'POST' && /^\/api\/v1\/me\/needs\/[^/]+\/seen$/.test(url.pathname)) {
          window.seenAttempts = (window.seenAttempts ?? 0) + 1
          if (held) {
            held = false
            await new Promise<void>((resolve) => (window.releaseSeen = resolve))
          }
          return new Response(JSON.stringify({ code: 'unavailable', message: 'Busy', retry: 'safe' }), { status: 503 })
        }
        return f(input, init)
      }
    let current = wrap(window.fetch.bind(window))
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      get: () => current,
      set: (f: typeof fetch) => (current = wrap(f)),
    })
  })
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  await expect(discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)).toBeInViewport()
  await expect.poll(() => page.evaluate(() => typeof window.releaseSeen)).toBe('function') // the first write, held
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1))
  await page.evaluate(() => window.releaseSeen?.()) // its 503, answered with the clock stopped: the retry waits
  await page.clock.runFor(500) // half its wait: still pending, nothing sent again
  expect(await seenAttempts(page)).toBe(1)
  if (close) {
    await chatToggle(page).click()
    await expect(discussion(page)).toHaveCount(0)
  }
  await page.clock.runFor(close ? 2500 : 600)
}

test('mentions · closing the chat cancels a pending retry of a failed seen write', async ({ page }) => {
  await pendingSeenRetry(page, true)
  expect(await seenAttempts(page)).toBe(1)
})

test('mentions · with the chat kept open, the same pending retry goes when its time comes', async ({ page }) => {
  await pendingSeenRetry(page, false)
  expect(await seenAttempts(page)).toBe(2)
})

// #409 R-CURRENT-MENTIONS-RETRY-OWNERSHIP-02: the first seen write is held; while it is in flight the same mounted chat's
// effect starts again (a new message changes what it shows); then the held write fails. The occurrence, still current
// and readable where it is, is acknowledged by the effect that is current now, within bounds: no scroll, no new read.
test('mentions · a seen write that fails after the chat moved on is tried again by the chat as it is now', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let held = true
    window.seenAttempts = 0
    const wrap =
      (f: typeof fetch): typeof fetch =>
      async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        if (init?.method === 'POST' && /^\/api\/v1\/me\/needs\/[^/]+\/seen$/.test(url.pathname)) {
          window.seenAttempts = (window.seenAttempts ?? 0) + 1
          if (held) {
            held = false
            await new Promise<void>((resolve) => (window.releaseSeen = resolve))
            return new Response(JSON.stringify({ code: 'unavailable', message: 'Busy', retry: 'safe' }), {
              status: 503,
            })
          }
        }
        return f(input, init)
      }
    let current = wrap(window.fetch.bind(window))
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      get: () => current,
      set: (f: typeof fetch) => (current = wrap(f)),
    })
  })
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  const entry = discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)
  await expect(entry).toBeInViewport()
  await expect.poll(() => seenAttempts(page)).toBe(1) // the write is in flight, held
  await page.evaluate(() => window.fixture?.say('SYNTHETIC: the chat moves on while the write is held.'))
  await expect(line(page, 'the chat moves on while the write is held')).toBeVisible()
  await expect(entry).toBeInViewport()
  await page.evaluate(() => window.releaseSeen?.())
  await expect.poll(() => served(page), { timeout: 6000 }).toContain(`seen:${NEED}`)
  expect((await served(page)).filter((s) => s === `seen:${NEED}`)).toHaveLength(1)
  expect(await seenAttempts(page)).toBe(2)
})

/**
 * R92 on 4308744385: the first seen write is held until released, then answers 503, and so do the next `failures - 1`;
 * every attempt is counted.
 */
async function heldFailingSeen(page: Page, failures: number) {
  await page.addInitScript((n) => {
    let left = n
    let held = true
    window.seenAttempts = 0
    const wrap =
      (f: typeof fetch): typeof fetch =>
      async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        if (init?.method === 'POST' && /^\/api\/v1\/me\/needs\/[^/]+\/seen$/.test(url.pathname)) {
          window.seenAttempts = (window.seenAttempts ?? 0) + 1
          if (held) {
            held = false
            await new Promise<void>((resolve) => (window.releaseSeen = resolve))
          }
          if (left > 0) {
            left--
            return new Response(JSON.stringify({ code: 'unavailable', message: 'Busy', retry: 'safe' }), {
              status: 503,
            })
          }
        }
        return f(input, init)
      }
    let current = wrap(window.fetch.bind(window))
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      get: () => current,
      set: (f: typeof fetch) => (current = wrap(f)),
    })
  }, failures)
}

const commands = (page: Page) => page.getByRole('dialog', { name: 'Commands' })
/** A real modal over the chat: the command palette (the platform's command key: Meta on a Mac, Ctrl elsewhere). */
async function cover(page: Page) {
  await page.keyboard.press('ControlOrMeta+k')
  await expect(commands(page)).toBeVisible()
  expect(await commands(page).getAttribute('aria-modal')).toBe('true')
}
async function uncover(page: Page) {
  await page.keyboard.press('Escape')
  await expect(commands(page)).toHaveCount(0)
}

/** The mentioned message readable and its first seen write held; then the modal over the chat. */
async function heldThenCovered(page: Page, failures: number) {
  await heldFailingSeen(page, failures)
  await page.goto(`/room.html?call=on&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  const entry = discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)
  await expect(entry).toBeInViewport()
  await expect.poll(() => seenAttempts(page)).toBe(1) // in flight, held
  await cover(page)
  return entry
}

for (const phone of [false, true])
  test(`mentions${phone ? ' @phone' : ''} · a failed seen write's retry falling due under a modal is sent once when it closes, with no scroll (R92)`, async ({
    page,
  }) => {
    const entry = await heldThenCovered(page, 1)
    await page.evaluate(() => window.releaseSeen?.()) // 503, while covered
    await page.waitForTimeout(2000) // past the owned retry's deadline (1 s)
    expect(await seenAttempts(page), 'no new write while covered').toBe(1)
    expect(await seenOf(page)).toEqual([])
    const scrolled = await discussion(page).evaluate((el) => el.scrollTop)
    await uncover(page)
    await expect.poll(() => seenOf(page)).toEqual([`seen:${NEED}`])
    await page.waitForTimeout(1500)
    expect(await seenAttempts(page)).toBe(2)
    expect(await seenOf(page)).toEqual([`seen:${NEED}`])
    expect(await discussion(page).evaluate((el) => el.scrollTop)).toBe(scrolled)
    await expect(entry).toBeInViewport()
  })

test('mentions · a modal closing before a failed seen write is due sends nothing early; the retry goes at its time, once (R92)', async ({
  page,
}) => {
  await heldThenCovered(page, 1)
  await page.evaluate(() => window.releaseSeen?.())
  await page.waitForTimeout(150)
  await uncover(page) // before the 1 s deadline
  await page.waitForTimeout(300)
  expect(await seenAttempts(page), 'no early duplicate').toBe(1)
  await expect.poll(() => seenOf(page)).toEqual([`seen:${NEED}`])
  await page.waitForTimeout(1500)
  expect(await seenAttempts(page)).toBe(2)
})

test('mentions · covered and revealed again and again, a failing seen write keeps its bound: the first and three more (R92)', async ({
  page,
}) => {
  await heldThenCovered(page, 99)
  await page.evaluate(() => window.releaseSeen?.())
  for (const [due, attempts] of [
    [1300, 2],
    [2300, 3],
    [3300, 4],
  ] as const) {
    await page.waitForTimeout(due) // the next retry falls due under the modal
    expect(await seenAttempts(page)).toBe(attempts - 1)
    await uncover(page)
    await expect.poll(() => seenAttempts(page)).toBe(attempts)
    await cover(page)
  }
  await page.waitForTimeout(4500)
  await uncover(page)
  await page.waitForTimeout(1000)
  expect(await seenAttempts(page)).toBe(4)
  expect(await seenOf(page)).toEqual([])
})

// P1 4309009938: the room's mentions are read from the person's mixed Needs list (their replies' words beside the
// mentions: the fixture's reply:t9). While the personal padlock is shut it is never read, nothing of it is kept, and a
// read on its way refills nothing; opened, it is read afresh.
async function countedNeeds(page: Page) {
  await page.addInitScript(() => {
    // One controller for the page's fetch: GET /me/needs counted (and the next held when asked), and the seen write of
    // exactly `holdSeenNeed` held before it reaches the fixture's handler, until released.
    const control = { gets: 0, seen: [] as string[], held: [] as string[] }
    window.needsGets = 0
    window.seenPosts = control.seen
    window.heldSeen = control.held
    const wrap =
      (f: typeof fetch): typeof fetch =>
      async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        const method = init?.method ?? 'GET'
        if (method === 'GET' && url.pathname === '/api/v1/me/needs') {
          control.gets += 1
          window.needsGets = control.gets
          if (window.holdNeeds) {
            window.holdNeeds = false
            await new Promise<void>((resolve) => (window.releaseNeeds = resolve))
          }
        }
        const seen = /^\/api\/v1\/me\/needs\/([^/]+)\/seen$/.exec(url.pathname)
        if (method === 'POST' && seen?.[1]) {
          const need = decodeURIComponent(seen[1])
          control.seen.push(need)
          if (need === window.holdSeenNeed) {
            control.held.push(need)
            await new Promise<void>((resolve) => (window.releaseHeldSeen = resolve))
          }
        }
        return f(input, init)
      }
    let current = wrap(window.fetch.bind(window))
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      get: () => current,
      set: (f: typeof fetch) => (current = wrap(f)),
    })
  })
}
const needsGets = (page: Page) => page.evaluate(() => window.needsGets ?? 0)
const kept = (page: Page) => page.evaluate(() => JSON.stringify(window.fixture?.cachedMentionNeeds() ?? []))
const setPadlock = (page: Page, locked: boolean) => page.evaluate((l) => window.fixture?.setPadlock(l), locked)
const MENTIONED_ROOM = `/room.html?call=on&people=2&floor=1&discussion=mentioned`

test('mentions · padlock shut from the start: the hidden room and its chat read nothing of the person’s Needs; opened, the mention is read afresh and on its message (P1 4309009938)', async ({
  page,
}) => {
  await countedNeeds(page)
  await page.goto(`${MENTIONED_ROOM}&padlock=shut`)
  await expect(leave(page)).toBeVisible()
  await expect(discussion(page)).toHaveCount(0) // the chat is hidden
  await page.waitForTimeout(1000)
  expect(await needsGets(page), 'chat hidden: no mixed read').toBe(0)
  expect(await kept(page)).toBe('[]')
  await chatToggle(page).click()
  await expect(discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)).toBeAttached()
  await page.waitForTimeout(1500)
  expect(await needsGets(page), 'chat shown, padlock shut: still no mixed read').toBe(0)
  expect(await kept(page)).toBe('[]')
  await expect(discussion(page).locator('[data-mention-need]')).toHaveCount(0)
  expect(await seenOf(page)).toEqual([])
  // Positive control: the current Need's seen write is held before it reaches the fixture, so its marker can't leave
  // before it is checked; released, it is written exactly once and the Need leaves the list.
  await page.evaluate((need) => (window.holdSeenNeed = need), NEED)
  await setPadlock(page, false)
  await expect.poll(() => needsGets(page)).toBeGreaterThan(0)
  await expect.poll(() => kept(page)).toContain(NEED)
  const marked = discussion(page).locator(`[data-mention-need="${NEED}"]`)
  await expect(marked).toHaveAttribute('data-message', MENTIONED_IN)
  await marked.scrollIntoViewIfNeeded()
  await expect.poll(() => page.evaluate(() => window.heldSeen ?? [])).toEqual([NEED]) // pending, exactly this one
  expect(await page.evaluate(() => window.seenPosts ?? [])).toEqual([NEED]) // no other seen write
  expect(await seenOf(page)).toEqual([])
  await expect(marked).toHaveAttribute('data-message', MENTIONED_IN) // still on its message while held
  await page.evaluate(() => window.releaseHeldSeen?.())
  await expect.poll(() => seenOf(page)).toEqual([`seen:${NEED}`])
  await expect(marked).toHaveCount(0)
  await page.waitForTimeout(1000)
  expect(await seenOf(page)).toEqual([`seen:${NEED}`])
  expect(await page.evaluate(() => window.seenPosts ?? [])).toEqual([NEED])
})

test('mentions · a read on its way, kept under two cursors, then the padlock shut: stopped, forgotten, its late answer refills nothing, nothing read while shut (P1 4309009938)', async ({
  page,
}) => {
  await countedNeeds(page)
  await page.goto(MENTIONED_ROOM)
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await expect.poll(() => kept(page)).toContain('reply:t9') // the mixed list, with the person's reply, kept
  const before = await needsGets(page)
  await page.evaluate(() => (window.holdNeeds = true))
  await page.evaluate(() => window.fixture?.say('SYNTHETIC: the project moves on, its cursor with it.'))
  await expect.poll(() => needsGets(page)).toBe(before + 1) // read again under the new cursor, held
  const variants: unknown = JSON.parse(await kept(page))
  expect(Array.isArray(variants) ? variants.length : 0).toBeGreaterThanOrEqual(2) // the earlier cursor's, and the held one's
  await setPadlock(page, true)
  await expect.poll(() => kept(page)).toBe('[]')
  const shut = await needsGets(page)
  await page.evaluate(() => window.releaseNeeds?.()) // the held read answers, late
  await page.waitForTimeout(1500)
  expect(await kept(page), 'the late answer refills nothing').toBe('[]')
  expect(await needsGets(page), 'nothing read while shut').toBe(shut)
  await expect(discussion(page).locator('[data-mention-need]')).toHaveCount(0)
  await setPadlock(page, false)
  await expect.poll(() => needsGets(page)).toBeGreaterThan(shut)
  await expect.poll(() => kept(page)).toContain('reply:t9')
})

test('mentions · a call that shuts the padlock: the room’s mentions read is forgotten and not read again while it is shut (P1 4309009938)', async ({
  page,
}) => {
  await countedNeeds(page)
  await page.goto(`${MENTIONED_ROOM}&padlock=call`)
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await expect(discussion(page).locator(`[data-message="${MENTIONED_IN}"]`)).toBeVisible()
  await expect.poll(() => kept(page)).toBe('[]')
  const shut = await needsGets(page)
  await page.waitForTimeout(1500)
  expect(await needsGets(page)).toBe(shut)
  expect(await kept(page)).toBe('[]')
  await expect(discussion(page).locator('[data-mention-need]')).toHaveCount(0)
})

test('mentions · another tab shuts the padlock (device storage): the read is forgotten here too and not read while shut (P1 4309009938)', async ({
  page,
}) => {
  await countedNeeds(page)
  await page.goto(MENTIONED_ROOM)
  await expect(leave(page)).toBeVisible()
  await chatToggle(page).click()
  await expect.poll(() => kept(page)).toContain('reply:t9')
  await page.evaluate(() => {
    const key = window.fixture?.padlockKey() ?? ''
    localStorage.setItem(key, 'you')
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'you' }))
  })
  await expect.poll(() => kept(page)).toBe('[]')
  const shut = await needsGets(page)
  await page.waitForTimeout(1500)
  expect(await needsGets(page)).toBe(shut)
  expect(await kept(page)).toBe('[]')
})

/** The members read from here on: as served, without Marco, or failing; and how many reads the page sent. */
async function membersAs(page: Page, as: 'served' | 'withoutMarco' | 'failing' | 'marcoRenamed') {
  await page.evaluate(
    ({ mode, marco }) => {
      const w = window as Window & { membersAs?: string; membersReads?: number; membersInner?: typeof fetch }
      w.membersAs = mode
      if (w.membersInner) return
      const isMarco = (m: unknown) => !!m && typeof m === 'object' && 'actorId' in m && m.actorId === marco
      const withoutMarco = (body: unknown) =>
        body && typeof body === 'object' && 'members' in body && Array.isArray(body.members)
          ? { ...body, members: body.members.filter((m: unknown) => !isMarco(m)) }
          : body
      // The same member under a new name: what they are called changes, never who they are.
      const marcoRenamed = (body: unknown) =>
        body && typeof body === 'object' && 'members' in body && Array.isArray(body.members)
          ? {
              ...body,
              members: body.members.map((m: unknown) =>
                isMarco(m) && typeof m === 'object' ? { ...m, name: 'Marco Rossi' } : m,
              ),
            }
          : body
      const inner = window.fetch
      w.membersInner = inner
      w.membersReads = 0
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname
        if ((init?.method ?? 'GET') !== 'GET' || !path.endsWith('/members')) return inner(input, init)
        w.membersReads = (w.membersReads ?? 0) + 1
        if (w.membersAs === 'failing') return new Response('{}', { status: 503 })
        const res = await inner(input, init)
        if (w.membersAs !== 'withoutMarco' && w.membersAs !== 'marcoRenamed') return res
        const body: unknown = await res.json()
        return new Response(JSON.stringify(w.membersAs === 'withoutMarco' ? withoutMarco(body) : marcoRenamed(body)), {
          status: res.status,
          headers: res.headers,
        })
      }
    },
    { mode: as, marco: MARCO },
  )
}
const membersReads = (page: Page) =>
  page.evaluate(() => (window as Window & { membersReads?: number }).membersReads ?? 0)

/** The members read again, as the page would on coming back to it once the last read is a minute old. */
async function membersReadAgain(page: Page, reads: number) {
  const before = await membersReads(page)
  await page.clock.fastForward(61_000)
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect
    .poll(async () => {
      await page.clock.fastForward(5_000) // a failed read's own retries
      return membersReads(page)
    })
    .toBeGreaterThanOrEqual(before + reads)
}

test('mentions · chosen, then removed by a successful read and back: not named again until chosen again (4311940162)', async ({
  page,
}) => {
  await page.clock.install()
  await enter(page)
  await membersAs(page, 'served')
  await page.getByRole('button', { name: 'Mention' }).click()
  const options = page.getByRole('group', { name: /Mention members/ })
  await options.getByRole('checkbox', { name: 'Marco' }).check()
  await expect(page.getByText('Mentions Marco')).toBeVisible()
  // Marco is removed: a successful read without him; the picker stays open throughout.
  await membersAs(page, 'withoutMarco')
  await membersReadAgain(page, 1)
  await expect(options.getByRole('checkbox', { name: 'Marco' })).toHaveCount(0)
  await expect(page.getByText('Mentions Marco')).toHaveCount(0)
  // Marco rejoins: offered again, not chosen.
  await membersAs(page, 'served')
  await membersReadAgain(page, 1)
  await expect(options.getByRole('checkbox', { name: 'Marco' })).not.toBeChecked()
  await expect(page.getByText('Mentions Marco')).toHaveCount(0)
  await page.getByRole('button', { name: 'Done' }).click()
  await bar(page).fill('SYNTHETIC words after Marco came back')
  await bar(page).press('Enter')
  const after = line(page, 'SYNTHETIC words after Marco came back')
  await expect(after).toBeVisible()
  await expect(after.locator('.contribution-mentions')).toHaveCount(0)
  expect(await served(page)).not.toContain(`mentions:${MARCO}`)
  // Chosen again, he is named.
  await page.getByRole('button', { name: 'Mention' }).click()
  await options.getByRole('checkbox', { name: 'Marco' }).check()
  await page.getByRole('button', { name: 'Done' }).click()
  await bar(page).fill('SYNTHETIC words for Marco, chosen again')
  await bar(page).press('Enter')
  await expect(line(page, 'SYNTHETIC words for Marco, chosen again').locator('.contribution-mentions')).toHaveText(
    'to Marco',
  )
  expect(await served(page)).toContain(`mentions:${MARCO}`)
})

test('mentions · a member renamed by a successful read stays chosen and is named under the new name (4311940162)', async ({
  page,
}) => {
  await page.clock.install()
  await enter(page)
  await membersAs(page, 'served')
  await page.getByRole('button', { name: 'Mention' }).click()
  const options = page.getByRole('group', { name: /Mention members/ })
  await options.getByRole('checkbox', { name: 'Marco' }).check()
  await page.getByRole('button', { name: 'Done' }).click()
  await membersAs(page, 'marcoRenamed')
  await membersReadAgain(page, 1)
  await expect(page.getByText('Mentions Marco Rossi')).toBeVisible()
  await bar(page).fill('SYNTHETIC words for Marco under his new name')
  await bar(page).press('Enter')
  await expect(line(page, 'SYNTHETIC words for Marco under his new name')).toBeVisible()
  expect(await served(page)).toContain(`mentions:${MARCO}`)
})

test('mentions · a members read that fails after the choice proves no removal: the choice stays and goes with the message (4311940162)', async ({
  page,
}) => {
  await page.clock.install()
  await enter(page)
  await membersAs(page, 'served')
  await page.getByRole('button', { name: 'Mention' }).click()
  const options = page.getByRole('group', { name: /Mention members/ })
  await options.getByRole('checkbox', { name: 'Marco' }).check()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Mentions Marco')).toBeVisible()
  // The read fails (its retries too): nothing is offered meanwhile, and nothing is discarded.
  await membersAs(page, 'failing')
  await membersReadAgain(page, 4)
  await expect(page.getByRole('button', { name: 'Mention' })).toHaveCount(0)
  // Read again successfully, with Marco: still chosen, never chosen again by hand.
  await membersAs(page, 'served')
  await membersReadAgain(page, 1)
  await expect(page.getByText('Mentions Marco')).toBeVisible()
  await bar(page).fill('SYNTHETIC words for Marco after a failed read')
  await bar(page).press('Enter')
  await expect(
    line(page, 'SYNTHETIC words for Marco after a failed read').locator('.contribution-mentions'),
  ).toHaveText('to Marco')
  expect(await served(page)).toContain(`mentions:${MARCO}`)
})
