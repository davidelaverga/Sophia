import { expect, test, type Locator, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// The room's dock on a phone (docs/plans/phone-dock.md): icons in 42 px squares, one row, the box hugging them; on a
// computer, the words as before. Leave is the way out, rose and last (docs/plans/room-dock-people.md). Every name and
// stream is synthetic, and the page says it is a fixture.

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

test('dock · at 390 px, from the keyboard or under a hovering pointer, an icon says what it does', async ({ page }) => {
  await enter(page, 'people=2', 390)
  const take = dock(page).getByRole('button', { name: 'Take the floor', exact: true })
  const tip = take.locator('.tip')
  await expect(tip).toBeHidden()
  // A narrow window on a computer: the pointer hovers.
  await take.hover()
  await expect(tip).toBeVisible()
  await expect(tip).toHaveCSS('opacity', '1')
  await expect(tip).toHaveText('Take the floor')
  await page.mouse.move(0, 0)
  await expect(tip).toBeHidden()
  // From the keyboard: back a stop, and Tab to it again.
  await take.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(take).toBeFocused()
  await expect(tip).toBeVisible()
  await expect(tip).toHaveCSS('opacity', '1')
})

test('dock · at 360 px, the tips of the outer squares stay on the screen', async ({ page }) => {
  await enter(page, 'people=2', 360)
  const squares = dock(page).locator('button:visible')
  for (const square of [squares.first(), squares.last()]) {
    await square.hover()
    const tip = square.locator('.tip')
    await expect(tip).toBeVisible()
    await expect(tip).toHaveCSS('opacity', '1')
    const box = await tip.boundingBox()
    if (!box) throw new Error('no tip')
    expect(box.x, 'its left edge on the screen').toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, 'its right edge on the screen').toBeLessThanOrEqual(360)
    await page.mouse.move(0, 0)
  }
})

test('dock · at 390 px, one tip at a time: the pointer on one square, the keyboard on another, the keyboard’s shows', async ({
  page,
}) => {
  await enter(page, 'people=2', 390)
  const squares = dock(page).locator('button:visible')
  await squares.first().hover()
  await expect(squares.first().locator('.tip')).toHaveCSS('opacity', '1')
  // The keyboard reaches the last square while the pointer stays on the first.
  await squares.last().focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(squares.last()).toBeFocused()
  await expect(squares.last().locator('.tip')).toHaveCSS('opacity', '1')
  await expect(squares.first().locator('.tip')).toBeHidden()
})

test('dock · on a phone, passing the floor to one person shows whose it becomes: their initial', async ({ page }) => {
  await enter(page, 'people=1&floor=me', 390)
  const pass = dock(page).getByRole('button', { name: 'Pass to Marco', exact: true })
  await expect(pass).toBeVisible()
  await expect(pass.locator('.dock-badge')).toHaveText('M')
})

for (const [state, query, shows] of [
  ['Sophia speaking, the floor yours', 'people=1&floor=me&exchange=open&sophia=speaking', 'Stop speaking'],
  ['Sophia paused', 'people=1&floor=me&exchange=open&sophia=here&paused=holder_left', 'Resume'],
] as const) {
  test(`dock · on a phone, every control has words to show while pressed and held (${state})`, async ({ page }) => {
    await enter(page, query, 390)
    await expect(dock(page).getByRole('button', { name: shows, exact: true })).toBeVisible()
    const bare = await dock(page)
      .getByRole('button')
      .evaluateAll((all) =>
        all
          .filter((b) => b.getBoundingClientRect().width > 0 && !b.querySelector(':scope > .tip'))
          .map((b) => b.getAttribute('aria-label') ?? b.textContent),
      )
    expect(bare).toEqual([])
  })
}

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

test('dock · on a phone, End is her light going out, not a square beside Leave (docs/plans/dock-end-icon.md)', async ({
  page,
}) => {
  await enter(page, 'people=2&exchange=open&sophia=speaking', 390)
  const icon = (name: string) =>
    dock(page)
      .getByRole('button', { name, exact: true })
      .locator('svg')
      .first()
      .evaluate((s) => s.innerHTML)
  const [end, exit, pass] = await Promise.all([icon('End'), icon('Leave the room'), icon('Pass to…')])
  // Her light's point, filled, as on «Speak with Sophia», struck through as an «off» is; no stop square.
  expect(end).toMatch(/<circle[^>]*fill="currentColor"/)
  expect(end).toContain('M4 4l16 16')
  expect(end).not.toMatch(/<rect/)
  expect(end).not.toBe(exit)
  expect(end).not.toBe(pass)
})

test('dock · on a computer, the words as before', async ({ page }) => {
  await enter(page, 'people=2', 1280)
  const words = (await seen(page)).map((b) => b.words)
  expect(words).toContain('Take the floor')
  expect(words).toContain('Speak with Sophia')
  // The phone's icons stay out of sight.
  await expect(dock(page).locator('.dock-icon:visible')).toHaveCount(0)
})

/** A press's ink, plane and edge as drawn, and the room's rose as the page computes it. */
const inkOf = (button: Locator) =>
  button.evaluate((b) => {
    const s = getComputedStyle(b)
    const probe = document.createElement('span')
    probe.style.color = 'var(--rose)'
    document.body.append(probe)
    const rose = getComputedStyle(probe).color
    probe.remove()
    return { color: s.color, plane: s.backgroundColor, edge: s.borderTopColor, rose }
  })
/** `rgb(r, g, b)` at an opacity, as the browser writes it. */
const at = (rgb: string, alpha: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
/** The name of the last press drawn in a group. */
const lastPress = (group: Locator) =>
  group.getByRole('button').evaluateAll((all) =>
    all
      .filter((b) => b.getBoundingClientRect().width > 0)
      .at(-1)
      ?.getAttribute('aria-label'),
  )

test('dock · Leave is the way out: the door behind its arrow, on a computer and a phone (room-dock-people.md)', async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await enter(page, 'people=2', width)
    const stroked = await leave(page)
      .locator('svg path')
      .first()
      .evaluate((p: SVGPathElement) => [
        p.isPointInStroke(new DOMPoint(4.5, 9)),
        p.isPointInStroke(new DOMPoint(19.5, 9)),
      ])
    // The door's upright on the left, nothing on the right: the arrow leaves the door, it does not walk into one.
    expect(stroked, `${width}px`).toEqual([true, false])
  }
})

for (const [query, width] of [
  ['people=2', 1280],
  ['people=2', 390],
  ['people=2&theme=light', 1280],
] as const) {
  test(`dock · Leave is rose at rest, not only under a pointer, and last (${query}, ${width}px)`, async ({ page }) => {
    await enter(page, query, width)
    await page.mouse.move(0, 0)
    const camera = dock(page).getByRole('button', { name: 'Camera', exact: true })
    const [rest, other] = await Promise.all([inkOf(leave(page)), inkOf(camera)])
    expect(rest.color).toBe(rest.rose)
    expect(rest.plane).toBe(at(rest.rose, 0.08))
    expect(rest.edge).toBe(at(rest.rose, 0.4))
    expect(other.color).not.toBe(rest.color)
    expect(await lastPress(dock(page))).toBe('Leave the room')
    // Under the pointer it still answers: one step deeper.
    await leave(page).hover()
    await expect(leave(page)).toHaveCSS('background-color', at(rest.rose, 0.16))
  })
}

test('dock · in the header on Tasks, Leave is rose and last', async ({ page }) => {
  await page.goto('/room.html?demo=1&call=on&people=2&floor=1&sophia=listening&place=work')
  await drawn(page, DRAWN.tasks)
  await page.mouse.move(0, 0)
  const group = page.getByRole('group', { name: 'Project room' })
  const out = group.getByRole('button', { name: 'Leave the room' })
  await expect(out).toBeVisible()
  const ink = await inkOf(out)
  expect(ink.color).toBe(ink.rose)
  expect(await lastPress(group)).toBe('Leave the room')
})
