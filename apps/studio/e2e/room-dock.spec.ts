import { expect, test, type Page } from '@playwright/test'

// The room's dock on a phone (docs/plans/phone-dock.md): icons in 42 px squares, one row, the box hugging them; on a
// computer, the words as before. Every name and stream is synthetic, and the page says it is a fixture.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })

async function enter(page: Page, query: string, width: number) {
  await page.setViewportSize({ width, height: 844 })
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
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

/** The dock's buttons as the eye sees them: their size, corners, row and the words they show. */
const seen = (page: Page) =>
  dock(page)
    .getByRole('button')
    .evaluateAll((all) =>
      all
        .filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => {
          const r = b.getBoundingClientRect()
          return {
            name: b.getAttribute('aria-label') ?? b.textContent,
            width: Math.round(r.width),
            height: Math.round(r.height),
            top: Math.round(r.top),
            corner: parseFloat(getComputedStyle(b).borderTopLeftRadius),
            // Words that take room on the screen: not a tip (shown on hover), not a name kept for screen readers.
            words: (() => {
              const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT)
              let shown = ''
              for (let n = walk.nextNode(); n; n = walk.nextNode()) {
                const host = n.parentElement
                if (!host || host.closest('.tip')) continue
                // The box the words sit in, clipped or not: a range's own box ignores the clip.
                const box = host.getBoundingClientRect()
                if (box.width > 1 && box.height > 1) shown += n.textContent ?? ''
              }
              return shown.trim()
            })(),
          }
        }),
    )

test('dock · on a phone: one row of 42 px squares, icons only, still named for what they do', async ({ page }) => {
  await enter(page, 'people=2', 390)
  for (const name of ['Microphone', 'Camera', 'Take the floor', 'Speak with Sophia', 'Leave the room']) {
    await expect(dock(page).getByRole('button', { name, exact: true })).toBeVisible()
  }
  const buttons = await seen(page)
  for (const b of buttons) {
    expect(b, b.name).toMatchObject({ width: 42, height: 42, words: '' })
    expect(b.corner, b.name).toBeGreaterThanOrEqual(8)
    expect(b.corner, b.name).toBeLessThanOrEqual(12)
  }
  expect(new Set(buttons.map((b) => b.top)).size).toBe(1)
})

test('dock · on a phone, passing the floor to one person shows whose it becomes: their initial', async ({ page }) => {
  await enter(page, 'people=1&floor=me', 390)
  const pass = dock(page).getByRole('button', { name: 'Pass to Marco', exact: true })
  await expect(pass).toBeVisible()
  await expect(pass.locator('.dock-badge')).toHaveText('M')
})

test('dock · on a phone, its box hugs the row: no empty sides', async ({ page }) => {
  await enter(page, 'people=2', 390)
  const gap = await dock(page).evaluate((nav) => {
    const shown = [...nav.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0)
    const first = shown[0]?.getBoundingClientRect()
    const last = shown.at(-1)?.getBoundingClientRect()
    const box = nav.getBoundingClientRect()
    return first && last ? box.width - (last.right - first.left) : Number.NaN
  })
  // Its padding and border, both sides: nothing more.
  expect(gap).toBeLessThanOrEqual(16)
})

test('dock · on a phone with Sophia in the conversation: her controls are icons too, and no «Sophia» label', async ({
  page,
}) => {
  // At 560 px: a phone held wide, past the 420 px where the labels already went.
  await enter(page, 'people=2&exchange=open&sophia=speaking', 560)
  await expect(dock(page).getByRole('button', { name: 'End', exact: true })).toBeVisible()
  await expect(dock(page).getByRole('button', { name: 'Stop speaking', exact: true })).toBeVisible()
  for (const b of await seen(page)) expect(b, b.name).toMatchObject({ width: 42, height: 42, words: '' })
  // Neither «Floor» nor «Sophia» shows: the icons say it.
  await expect(dock(page).locator('.floor-label:visible')).toHaveCount(0)
})

test('dock · on a computer, the words as before', async ({ page }) => {
  await enter(page, 'people=2', 1280)
  const words = (await seen(page)).map((b) => b.words)
  expect(words).toContain('Take the floor')
  expect(words).toContain('Speak with Sophia')
  // The phone's icons stay out of sight.
  await expect(dock(page).locator('.dock-icon:visible')).toHaveCount(0)
})
