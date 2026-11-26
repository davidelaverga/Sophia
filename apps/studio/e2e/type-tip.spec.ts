// Typing anywhere in the room says so, once (docs/plans/type-anywhere-tip.md): with the chat open, the bar writing to
// the room and a letter typed now landing in it, «Tip: just start typing to message the room.», over no control,
// announced the first time it comes and never taking the focus; Dismiss, or a message started by typing, ends it for
// this browser. The keys' tip goes first, in an earlier visit; never both. Not on a touch screen. On the fixture page,
// with the keys' tip seen and this one not (the other checks start with both seen, e2e/tip-seen.ts).
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const ORIGIN = 'http://127.0.0.1:5199'
test.use({
  storageState: {
    cookies: [],
    origins: [{ origin: ORIGIN, localStorage: [{ name: 'sophia.keys-tip', value: 'seen' }] }],
  },
})

const PAGE = '/room.html?demo=1'
const LINE = 'Tip: just start typing to message the room.'
const KEYS_LINE = 'Tip: press ? to see the keys for this view.'
/** The tip on screen, announced or not (the measure that waits unseen is not it). */
const tip = (page: Page) => page.locator('.keys-tip:not(.keys-tip-measure)').filter({ hasText: LINE })
/** The status that announces it (its box is the line's: the status itself is a frame of no size, always mounted). */
const said = (page: Page) => page.getByRole('status').filter({ hasText: LINE }).getByText(LINE, { exact: true })
const dismiss = (page: Page) => tip(page).getByRole('button', { name: 'Dismiss' })
const keysTip = (page: Page) => page.getByRole('status').getByText(KEYS_LINE, { exact: true })
const bar = (page: Page) => page.locator('[data-chat-entry]')

/** Two frames on: past the one the tip waits for before it shows (it reads the page first). */
const settled = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))

/** The chat opened by its key, which puts the caret in the bar; then the bar left, the focus on no control. */
async function openChatAndLeaveBar(page: Page) {
  await page.keyboard.press('c')
  await expect(bar(page)).toBeFocused()
  await bar(page).blur()
  await expect(bar(page)).not.toBeFocused()
}

/** The room, drawn, with its chat open and the focus on no control: where typing anywhere goes to the bar. */
async function chatOpen(page: Page) {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await openChatAndLeaveBar(page)
}

const focusOnNothing = (page: Page) => page.evaluate(() => document.activeElement === document.body)

/** The controls on screen whose box the tip's box meets: none, so it covers nothing a person works with. */
const coveredControls = (page: Page) =>
  page.evaluate((line) => {
    const own = [...document.querySelectorAll('.keys-tip')].find((el) => el.textContent.includes(line))
    const box = own?.getBoundingClientRect()
    if (!own || !box) return ['no tip']
    const controls = document.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [role="button"]')
    return [...controls]
      .filter((el) => !own.contains(el) && el.checkVisibility())
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top
      })
      .map((el) => el.getAttribute('aria-label') ?? (el.textContent.trim() || el.tagName))
  }, LINE)

test('type tip · chat shut, it waits; open, it says it over no control, without the focus; Dismiss ends it', async ({
  page,
}) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await settled(page)
  // The chat shut: letters are shortcuts here, so the line would not be true.
  await expect(tip(page)).toHaveCount(0)
  // Opened by its key, the caret is in the bar: typing already goes there, so it waits until the bar is left.
  await page.keyboard.press('c')
  await expect(bar(page)).toBeFocused()
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
  await bar(page).blur()
  await expect(said(page)).toHaveText(LINE)
  expect(await coveredControls(page)).toEqual([])
  expect(await focusOnNothing(page)).toBe(true)
  await dismiss(page).click()
  await expect(tip(page)).toHaveCount(0)
  await chatOpen(page)
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
})

test('type tip · a message started by typing lands in the bar and ends it, after a reload too', async ({ page }) => {
  await chatOpen(page)
  await expect(tip(page)).toBeVisible()
  await page.keyboard.type('hi')
  await expect(bar(page)).toHaveValue('hi')
  await expect(bar(page)).toBeFocused()
  await expect(tip(page)).toHaveCount(0)
  await bar(page).fill('')
  await bar(page).blur()
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
  await chatOpen(page)
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
})

test('type tip · the caret in the bar: it waits, unended; back once the bar is left, it is not announced again', async ({
  page,
}) => {
  await chatOpen(page)
  await expect(said(page)).toBeVisible()
  await bar(page).click()
  await expect(bar(page)).toBeFocused()
  await expect(tip(page)).toHaveCount(0)
  await bar(page).blur()
  await expect(tip(page)).toBeVisible()
  // Announced once per page: coming and going with the caret, it is shown again but not said again.
  await expect(said(page)).toHaveCount(0)
})

test('type tip · a letter typed on the panel’s tab still lands in the bar, and ends it', async ({ page }) => {
  await chatOpen(page)
  await expect(tip(page)).toBeVisible()
  const chatTab = page.getByRole('tab', { name: 'Chat', exact: true })
  await chatTab.focus()
  await expect(chatTab).toBeFocused()
  await settled(page)
  await expect(tip(page)).toBeVisible()
  await page.keyboard.type('h')
  await expect(bar(page)).toHaveValue('h')
  await expect(bar(page)).toBeFocused()
  await expect(tip(page)).toHaveCount(0)
  await chatOpen(page)
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
})

test('type tip · the focus on a control outside the panel: a letter would run a shortcut there, so it waits', async ({
  page,
}) => {
  await chatOpen(page)
  await expect(tip(page)).toBeVisible()
  const invite = page.getByRole('button', { name: 'Invite' })
  await invite.focus()
  await expect(invite).toBeFocused()
  await expect(tip(page)).toHaveCount(0)
  await invite.blur()
  await expect(tip(page)).toBeVisible()
})

test('type tip · while the bar writes to Sophia («Message Sophia…») it says nothing; switched to the room, it does', async ({
  page,
}) => {
  // Wide enough that the call's dock, centred on the stage, leaves the corner free (at 1280 the tip's box meets it, and
  // it rightly waits): so its silence while the bar writes to Sophia is the target's doing.
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/room.html?call=on&exchange=open')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(bar(page)).toHaveAttribute('placeholder', 'Message Sophia…')
  await bar(page).blur()
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
  await page.getByRole('button', { name: /^To Sophia\. Send to the room instead/ }).click()
  await expect(bar(page)).toHaveAttribute('placeholder', 'Message the room…')
  await expect(tip(page)).toBeVisible()
})

test('type tip · Tab reaches it last: its Dismiss follows every other control of the page', async ({ page }) => {
  await chatOpen(page)
  await expect(tip(page)).toBeVisible()
  const before = await page.evaluate((line) => {
    const own = [...document.querySelectorAll('.keys-tip:not(.keys-tip-measure)')].find((el) =>
      el.textContent.includes(line),
    )
    const dismissed = own?.querySelector('button')
    if (!dismissed) return ['no Dismiss']
    const tabbable = document.querySelectorAll<HTMLElement>(
      'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
    )
    return [...tabbable]
      .filter((el) => el !== dismissed && el.checkVisibility())
      .filter((el) => (dismissed.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
      .map((el) => el.getAttribute('aria-label') ?? (el.textContent.trim() || el.tagName))
  }, LINE)
  expect(before).toEqual([])
})

test.describe('with an empty store', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test('type tip · never with the keys’ tip: that one goes first, and with the chat open neither shows', async ({
    page,
  }) => {
    await page.goto(PAGE)
    await drawn(page, DRAWN.room)
    await expect(keysTip(page)).toBeVisible()
    await expect(tip(page)).toHaveCount(0)
    await openChatAndLeaveBar(page)
    await settled(page)
    await expect(keysTip(page)).toHaveCount(0)
    await expect(tip(page)).toHaveCount(0)
  })
  test('type tip · one lesson per visit: the keys’ tip dismissed, the typing tip waits for the next visit', async ({
    page,
  }) => {
    await page.goto(PAGE)
    await drawn(page, DRAWN.room)
    await page.getByRole('status').filter({ hasText: KEYS_LINE }).getByRole('button', { name: 'Dismiss' }).click()
    await expect(keysTip(page)).toHaveCount(0)
    await openChatAndLeaveBar(page)
    await settled(page)
    await expect(tip(page)).toHaveCount(0)
    await page.reload()
    await drawn(page, DRAWN.room)
    // The open chat is in the address (`?panel=chat`, focus-kept.md): the reload opens it again.
    await expect(bar(page)).toBeVisible()
    await bar(page).blur()
    await expect(tip(page)).toBeVisible()
  })
})

test('type tip · storage blocked: nothing shown, nothing thrown, and typing still lands in the bar', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      configurable: true,
    })
  })
  await chatOpen(page)
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
  await page.keyboard.type('hi')
  await expect(bar(page)).toHaveValue('hi')
  expect(errors).toEqual([])
})

test('@phone · type tip · never on a touch screen: the chat open and the bar left, still nothing', async ({ page }) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Chat', exact: true }).tap()
  await expect(bar(page)).toBeVisible()
  await bar(page).blur()
  await expect(bar(page)).not.toBeFocused()
  await settled(page)
  await expect(page.locator('.keys-tip')).toHaveCount(0)
})
