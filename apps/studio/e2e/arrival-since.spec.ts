// A project says what changed since you last looked, once, as the person arrives (docs/plans/project-arrival-since.md):
// under the bar, where a newcomer's welcome goes, in Home's words and by Home's memory (since-said.ts), as a polite
// status with Open Updates. `seen=earlier` puts the viewer's seen mark after the Oct 2 meeting and reads as that viewer:
// since then Lucía and Sophia each kept a note, besides the viewer's own decision, readout and note. Every word is
// synthetic.
import { expect, test, type Locator, type Page } from '@playwright/test'

const PAGE = '/room.html?demo=1&seen=earlier'
const LINE = 'Since you last looked: 2 notes kept.'
/** The arrival's status under the bar, mounted before its words. */
const arrival = (page: Page) => page.locator('.arrival-status')
const since = (page: Page) => page.getByRole('region', { name: 'Since you last looked' })
const sinceReads = (page: Page) => page.evaluate(() => window.fixture?.sinceReads() ?? 0)
const saidSince = (page: Page) => page.evaluate(() => window.fixture?.saidSince() ?? null)
const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' })
/** The lobby: it floats in the same corner under the bar. */
const door = (page: Page) => page.getByRole('complementary', { name: 'Waiting to come in' })
/** The arrival's card itself, inside its status. */
const card = (page: Page) => arrival(page).locator('.arrival-band')
/** A press at the middle of this control reaches it, with nothing drawn over it. */
const reached = (el: Locator) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect()
    return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
  })

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

test('arrival · a door that closes under the line takes it: the notice stands alone, offering nothing of the project', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(arrival(page)).toContainText(LINE)
  // Removed from the project while it is open: the next snapshot read is refused.
  await page.evaluate(() => window.fixture?.shutDoor())
  await expect(page.locator('.page.notice h2')).toBeVisible()
  await expect(arrival(page)).toHaveText('')
  await expect(page.getByRole('button', { name: 'Open Updates' })).toHaveCount(0)
})

test('arrival · someone at the door as it opens: the door has the corner, nothing is read until it is answered', async ({
  page,
}) => {
  await page.goto(`${PAGE}&lobby=waiting`)
  const letIn = door(page).getByRole('button', { name: 'Let in' })
  await expect(letIn).toBeVisible()
  // The project drew with someone already waiting: the visit holds before it reads, so nothing hangs on a wait.
  expect(await sinceReads(page)).toBe(0)
  await expect(arrival(page)).toHaveText('')
  await letIn.click()
  await expect(door(page)).toHaveCount(0)
  await expect(arrival(page)).toContainText(LINE)
  await expect(card(page)).toBeVisible()
})

test('arrival · a knock while the line is said: the door takes the corner and the line goes for good', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(arrival(page)).toContainText(LINE)
  const read = await sinceReads(page)
  await page.evaluate(() => window.fixture?.knock())
  const letIn = door(page).getByRole('button', { name: 'Let in' })
  await expect(letIn).toBeVisible()
  await expect(arrival(page)).toHaveText('')
  expect(await reached(letIn)).toBe(true)
  await letIn.click()
  await expect(door(page)).toHaveCount(0)
  // Answered, the door gives the corner back to nothing: the line was said, and isn't read or said again.
  await expect(arrival(page)).toHaveText('')
  expect(await sinceReads(page)).toBe(read)
})

test('arrival · a guest declined: while the door offers to let them in instead, the line keeps out of its way', async ({
  page,
}) => {
  await page.goto(`${PAGE}&lobby=waiting`)
  await door(page).getByRole('button', { name: 'Decline', exact: true }).click()
  const instead = door(page).getByRole('button', { name: 'Let in instead' })
  await expect(instead).toBeVisible()
  // No one waits now, so the window is read and the line said; the door's last offer still holds the corner.
  await expect(arrival(page)).toContainText(LINE)
  await expect(card(page)).toBeHidden()
  expect(await reached(instead)).toBe(true)
  // The offer lasts 8 s; then the line has the corner.
  await expect(door(page)).toHaveCount(0, { timeout: 12_000 })
  await expect(card(page)).toBeVisible()
})

test('arrival · never marked seen, the demo says nothing: its window is everything so far', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await answered(page)
  await expect(arrival(page)).toHaveText('')
})
