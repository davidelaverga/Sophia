import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// What stays in place (docs/plans/visual-fit.md): an address the page can't send says why under its field, in the
// page's words; a goal's tips never cover its criteria; and the room's dock keeps one row with the panel open beside it,
// its words giving way to their icons first. Every name and stream is synthetic, and the pages say they are fixtures.

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('invite · an address without an @ is said under its field, and the field keeps the focus', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  const members = page.getByRole('tabpanel', { name: 'Members' })
  const field = members.getByRole('textbox', { name: 'Email' })
  await field.fill('ana')
  await members.getByRole('button', { name: 'Send invitation' }).click()
  const said = members.getByRole('alert')
  await expect(said).toHaveText('Check the address: it needs a name, an @ and a domain.')
  await expect(field).toBeFocused()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveAttribute('aria-describedby', (await said.getAttribute('id')) ?? 'none')
  // Not the browser's bubble: the form checks nothing on its own.
  expect(await field.evaluate((f: HTMLInputElement) => f.form?.noValidate)).toBe(true)
  // Nothing was sent, and the words go once the address changes.
  await expect(members.locator('.invitation-list li', { hasText: 'ana' })).toHaveCount(0)
  await field.fill('ana@example.test')
  await expect(said).toHaveCount(0)
  await expect(field).not.toHaveAttribute('aria-invalid', 'true')
})

/** Each of a goal's tips against the words of the page that aren't tips: the ones its box would cover. */
const covered = (page: Page, goal: string) =>
  page
    .locator('li.goal')
    .filter({ hasText: goal })
    .evaluate((card) =>
      [...card.querySelectorAll<HTMLElement>('.control-row .tip')].flatMap((tip) => {
        const t = tip.getBoundingClientRect()
        const words: string[] = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent?.trim() || n.parentElement?.closest('.tip')) continue
          const range = document.createRange()
          range.selectNodeContents(n)
          for (const r of range.getClientRects()) {
            const across = Math.min(r.right, t.right) - Math.max(r.left, t.left)
            const down = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top)
            if (across > 0 && down > 0) words.push(`${tip.textContent} covers ${n.textContent.trim()}`)
          }
        }
        return words
      }),
    )

test('tasks · a goal without a plan: its controls’ tips open below and cover none of its criteria', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/work.html?unplanned=1')
  const goal = page.locator('li.goal').filter({ hasText: 'Exports keep their fonts' })
  await expect(goal.getByRole('button', { name: 'Hold' })).toBeVisible()
  await expect(goal.locator('.control-row .tip[data-side="bottom"]')).not.toHaveCount(0)
  expect(await covered(page, 'Exports keep their fonts')).toEqual([])
  // Pressed, its outcome stands under the row: the tips below wait, so they never cover it.
  await goal.getByRole('button', { name: 'Hold' }).click()
  await expect(goal.locator('.outcome')).not.toBeEmpty()
  await goal.getByRole('button', { name: /^(Hold|Resume)$/ }).hover()
  for (const tip of await goal.locator('.control-row .tip').all()) await expect(tip).toBeHidden()
  // Over its plan, the goal's row stands at the top: its tips still open above.
  await expect(page.locator('li.goal.compact .control-row .tip[data-side="top"]')).not.toHaveCount(0)
})

/** The dock's own controls: whether they stand on one line, and the height the room keeps clear for it. */
const dockRow = (page: Page) =>
  page.getByRole('navigation', { name: 'Room controls' }).evaluate((dock) => {
    const boxes = [...dock.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0)
    const oneRow = Math.max(...boxes.map((b) => b.top)) < Math.min(...boxes.map((b) => b.bottom))
    const room = dock.closest<HTMLElement>('.room-stage')
    return { oneRow, tight: dock.hasAttribute('data-tight'), height: room?.style.getPropertyValue('--dock-h') }
  })

test('dock · at 1280 px with the panel open, the words give way to icons and the dock keeps one row', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/room.html?call=on&people=2')
  const dock = page.getByRole('navigation', { name: 'Room controls' })
  await expect(dock.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect.poll(() => dockRow(page)).toEqual({ oneRow: true, tight: false, height: '48px' })
  const chat = page.getByRole('button', { name: 'Chat', exact: true })
  await chat.click()
  await expect(chat).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => dockRow(page)).toEqual({ oneRow: true, tight: true, height: '48px' })
  // Their names stay theirs; the hand's tip says the words the square no longer shows.
  const take = dock.getByRole('button', { name: 'Take the floor', exact: true })
  await expect(take).toBeVisible()
  await expect(dock.getByRole('button', { name: 'Speak with Sophia', exact: true })).toBeVisible()
  await expect(take.locator('.dock-icon')).toBeVisible()
  await take.hover()
  await expect(take.locator('.dock-tip')).toHaveCSS('opacity', '1')
  // Sophia in: her caption and the separators give way too, and the dock still keeps one row.
  await dock.getByRole('button', { name: 'Speak with Sophia', exact: true }).click()
  await expect(dock.getByRole('button', { name: 'End', exact: true })).toBeVisible()
  await expect.poll(() => dockRow(page)).toEqual({ oneRow: true, tight: true, height: '48px' })
  // The panel closed, the words come back.
  await chat.click()
  await expect.poll(() => dockRow(page)).toEqual({ oneRow: true, tight: false, height: '48px' })
})
