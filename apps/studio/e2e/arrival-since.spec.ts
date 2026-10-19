// A project says what changed since you last looked, once, as the person arrives (docs/plans/project-arrival-since.md):
// under the bar, where a newcomer's welcome goes, in Home's words and by Home's memory (since-said.ts), as a polite
// status with Open Updates. `seen=earlier` puts the viewer's seen mark after the Oct 2 meeting and reads as that viewer:
// since then Lucía and Sophia each kept a note, besides the viewer's own decision, readout and note. Every word is
// synthetic.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/room.html?demo=1&seen=earlier'
const LINE = 'Since you last looked: 2 notes kept.'
/** The arrival's status under the bar, mounted before its words. */
const arrival = (page: Page) => page.locator('.arrival-status')
const since = (page: Page) => page.getByRole('region', { name: 'Since you last looked' })
const sinceReads = (page: Page) => page.evaluate(() => window.fixture?.sinceReads() ?? 0)
const saidSince = (page: Page) => page.evaluate(() => window.fixture?.saidSince() ?? null)
const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' })

declare global {
  interface Window {
    /** What each status element held as it was put on the page (bornAs, below). */
    statusBorn?: (el: Element) => string | undefined
  }
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  // Each status as it is first put on the page: one announced must be there, empty, before its words.
  await page.addInitScript(() => {
    const born = new WeakMap<Element, string>()
    const note = (el: Element) => {
      if (el.getAttribute('role') === 'status' && !born.has(el)) born.set(el, el.textContent)
    }
    new MutationObserver((records) => {
      for (const node of records.flatMap((r) => [...r.addedNodes]))
        if (node instanceof Element) [node, ...node.querySelectorAll('[role="status"]')].forEach(note)
    }).observe(document, { childList: true, subtree: true })
    window.statusBorn = (el) => born.get(el)
  })
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The project's window was asked for (`more` reads past `before`) and has answered: the visit has decided by now. */
async function answered(page: Page, before = 0) {
  await expect.poll(() => sinceReads(page)).toBeGreaterThan(before)
  await page.waitForTimeout(400)
}

test('arrival · others’ news since the last look under the bar, a status mounted before its words; Open Updates ends it', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(arrival(page)).toContainText(LINE)
  await expect(arrival(page)).toHaveAttribute('role', 'status')
  expect(await arrival(page).evaluate((el) => window.statusBorn?.(el))).toBe('')
  // Said, not focused.
  expect(await arrival(page).evaluate((el) => el.contains(document.activeElement))).toBe(false)
  // Once drawn, its window is kept: neither Home nor the next open says it again.
  await expect.poll(() => saidSince(page)).toContain('n:00000000-0000-4000-8000-0000000005f4')
  await arrival(page).getByRole('button', { name: 'Open Updates' }).click()
  await expect(views(page).getByRole('link', { name: 'Updates' })).toHaveAttribute('aria-current', 'page')
  await expect(since(page).getByRole('region', { name: 'Kept' })).toContainText(
    'Both teams that left changed their admin in week three.',
  )
  await expect(arrival(page)).toHaveText('')
})

test('arrival · after Mark as seen and a reload, nothing is said', async ({ page }) => {
  await page.goto(PAGE)
  await expect(arrival(page)).toContainText(LINE)
  await arrival(page).getByRole('button', { name: 'Open Updates' }).click()
  await since(page).getByRole('button', { name: 'Mark as seen' }).click()
  await expect(since(page)).toContainText('Nothing new since you last looked.')
  await page.reload()
  await answered(page)
  await expect(arrival(page)).toHaveText('')
})

test('arrival · said on Home first: nothing is said on arrival', async ({ page }) => {
  await page.goto(`${PAGE}&said=home`)
  await answered(page)
  await expect(arrival(page)).toHaveText('')
})

test('arrival · Dismiss ends it: another view and back brings it no more, and reads nothing more', async ({ page }) => {
  await page.goto(PAGE)
  await expect(arrival(page)).toContainText(LINE)
  const read = await sinceReads(page)
  await arrival(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(arrival(page)).toHaveText('')
  await views(page).getByRole('link', { name: 'Knowledge' }).click()
  await views(page).getByRole('link', { name: 'Studio' }).click()
  await page.waitForTimeout(400)
  await expect(arrival(page)).toHaveText('')
  expect(await sinceReads(page)).toBe(read)
})

test('arrival · nothing is said where Updates is open', async ({ page }) => {
  await page.goto(`${PAGE}&place=updates`)
  await expect(since(page).getByRole('region', { name: 'Kept' })).toBeVisible()
  await page.waitForTimeout(400)
  await expect(arrival(page)).toHaveText('')
})

test('arrival · a join asked as the project opens (Join the room, Rejoin): nothing is read, said or kept', async ({
  page,
}) => {
  // A page of its own, Updates never opened before it: what Updates keeps would quiet the line by itself.
  await page.goto(`${PAGE}&call=on`)
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  // The call was on its way as the project drew: the visit was over before it read, so nothing hangs on a wait.
  expect(await sinceReads(page)).toBe(0)
  expect(await saidSince(page)).toBeNull()
  await expect(arrival(page)).toHaveText('')
})

test('arrival · never marked seen, the demo says nothing: its window is everything so far', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await answered(page)
  await expect(arrival(page)).toHaveText('')
})
