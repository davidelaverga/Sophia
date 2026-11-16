// The shortcuts announce themselves once (docs/plans/keys-tip.md): on the first page with keys, «Tip: press ? to see
// the keys for this view.», over no control, announced and never taking the focus; Dismiss, or the index opened, ends
// it for this browser. Not on a touch screen. On the fixture page, with an empty store: the other checks start with
// the tip seen (playwright.config.ts).
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

test.use({ storageState: { cookies: [], origins: [] } })

const PAGE = '/room.html?demo=1'
const LINE = 'Tip: press ? to see the keys for this view.'
/** The status that says it (its box is the line's: the status itself is a frame of no size, always mounted). */
const said = (page: Page) => page.getByRole('status').filter({ hasText: LINE })
const tip = (page: Page) => said(page).getByText(LINE, { exact: true })
const index = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' })

/** Two frames on: past the one the tip waits for before it shows (it reads the page first). */
const settled = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))

/** The controls on screen whose box the tip's box meets: none, so it covers nothing a person works with. */
const coveredControls = (page: Page) =>
  page.evaluate(() => {
    const own = document.querySelector('.keys-tip')
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
  })

test('keys tip · the first visit says it, over no control, without the focus; Dismiss ends it, after a reload too', async ({
  page,
}) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await expect(tip(page)).toHaveText(LINE)
  await expect(said(page).locator('kbd')).toHaveText('?')
  expect(await coveredControls(page)).toEqual([])
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  await said(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(tip(page)).toHaveCount(0)
  await page.reload()
  await drawn(page, DRAWN.room)
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
  // Once per browser, not per view: Conversations doesn't say it either.
  await page.goto('/room.html?place=conversations&conversations=1')
  await expect(page.getByRole('region', { name: 'All conversations' })).toBeVisible()
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
})

test('keys tip · opening the index by ? ends it as Dismiss does', async ({ page }) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await expect(tip(page)).toBeVisible()
  await page.keyboard.press('?')
  await expect(index(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(index(page)).toHaveCount(0)
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
  await page.reload()
  await drawn(page, DRAWN.room)
  await settled(page)
  await expect(tip(page)).toHaveCount(0)
})

test('keys tip · where ? is text (the chat open) it waits, unseen, and says it again once ? opens the index', async ({
  page,
}) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await expect(tip(page)).toBeVisible()
  await page.keyboard.press('c')
  await expect(page.locator('[data-typing-sink]').first()).toBeVisible()
  await expect(tip(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect(page.locator('[data-typing-sink]:visible')).toHaveCount(0)
  await expect(tip(page)).toBeVisible()
})

test('@phone · keys tip · never on a touch screen, with no keyboard to press it on', async ({ page }) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await settled(page)
  await expect(page.locator('.keys-tip')).toHaveCount(0)
  await expect(tip(page)).toHaveCount(0)
})
