// Home, the Welcome (docs/plans/home-welcome.md): a place that knows where you'll go. Its fixture page renders the
// Studio's own HomeDoors over labelled projects (fixtures/home.tsx).
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/home.html'
const id = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`
const pressed = (page: Page) => page.evaluate(() => window.homeFixture?.pressed ?? [])
const rows = (page: Page) => page.getByRole('list', { name: 'Your projects' }).getByRole('listitem')
const row = (page: Page, title: string) => page.getByRole('button', { name: new RegExp(`^${title}`) })

declare global {
  interface Window {
    homeTops?: number[]
    homeFramesAsked?: number
  }
}

test('home · your likeliest projects, one press each, in Work’s order', async ({ page }) => {
  await page.goto(PAGE)
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(0)).toContainText('Product launch')
  await expect(rows(page).nth(0)).toContainText('session starts in 10 min')
  await expect(rows(page).nth(1)).toContainText('Launch plan')
  await expect(rows(page).nth(2)).toContainText('Research notes')
  await expect(page.getByText('Design review')).toHaveCount(0) // the fourth waits in Work
  await row(page, 'Launch plan').click()
  expect(await pressed(page)).toEqual([`open ${id(1)}`])
  await page.getByRole('button', { name: /^All projects/ }).click()
  expect(await pressed(page)).toEqual([`open ${id(1)}`, 'work'])
})

test('home · a room with people in it says who, and its row joins', async ({ page }) => {
  await page.goto(`${PAGE}?projects=live`)
  const live = row(page, 'Pitch deck')
  await expect(live).toContainText('Davide and Sophia are in the room')
  await live.click()
  expect(await pressed(page)).toEqual([`join ${id(5)}`])
})

test('home · ↑ and ↓ move between the projects, Enter opens', async ({ page }) => {
  await page.goto(PAGE)
  await row(page, 'Product launch').focus()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Launch plan')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown') // stays on the last
  await expect(row(page, 'Research notes')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  expect(await pressed(page)).toEqual([`open ${id(1)}`])
})

test('home · the head sums up; a session about to start is said once, and its Join joins', async ({ page }) => {
  await page.goto(PAGE)
  await expect(page.locator('.c2-hello')).toContainText('4 projects · Standup starts in 10 min')
  const attention = page.locator('.c2-attention')
  await expect(attention).toContainText('Standup in Product launch starts in 10 min')
  await attention.getByRole('button', { name: 'Join' }).click()
  expect(await pressed(page)).toEqual([`join ${id(4)}`])
  // Already in a call: the bar's room pill says so; Home doesn't again.
  await page.goto(`${PAGE}?call=${id(1)}`)
  await expect(rows(page)).toHaveCount(3)
  await expect(page.locator('.c2-attention')).toHaveCount(0)
})

test('home · no projects: one quiet row starts the first; while they load, nothing says there are none', async ({
  page,
}) => {
  await page.goto(`${PAGE}?projects=none`)
  await page.getByRole('button', { name: /^Start a project/ }).click()
  expect(await pressed(page)).toEqual(['new project'])
  await page.goto(`${PAGE}?projects=loading`)
  await expect(page.getByRole('button', { name: /^Start a project/ })).toHaveCount(0)
  await expect(page.getByText('No projects yet')).toHaveCount(0)
})

/** The Work door's top, each frame from the press until the note has gone and a few frames after. */
async function foldTops(page: Page, fold: () => Promise<void>): Promise<number[]> {
  // Measured once the page has settled: its own face of the font in, its arrival done.
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.waitForTimeout(700)
  await page.evaluate(() => {
    const tops: number[] = []
    window.homeTops = tops
    const door = document.querySelector('[data-door="work"]')
    let after = 0
    const look = () => {
      if (door) tops.push(door.getBoundingClientRect().top)
      if (!document.querySelector('.c2-intro')) after++
      if (after < 6) requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
  await fold()
  await expect(page.getByRole('note').filter({ hasText: 'Private on the left' })).toHaveCount(0)
  await page.waitForTimeout(200)
  return page.evaluate(() => window.homeTops ?? [])
}

/**
 * It glides: no frame moves it more than a third of the way (a jump would be all of it at once), the last frames don't
 * move it at all (no step as the note goes), and it ends higher.
 */
function expectGlide(tops: number[]) {
  const steps = tops.slice(1).map((y, i) => Math.abs(y - (tops[i] ?? y)))
  const travel = Math.abs((tops[0] ?? 0) - (tops.at(-1) ?? 0))
  expect(travel).toBeGreaterThan(20)
  expect(Math.max(...steps)).toBeLessThan(travel / 3)
  expect(Math.max(...steps.slice(-5))).toBeLessThan(1)
  expect(tops.at(-1) ?? 0).toBeLessThan(tops[0] ?? 0)
}

test('home · “Got it” folds the note away smoothly: the doors glide up, they never jump', async ({ page }) => {
  await page.goto(`${PAGE}?explain=1`)
  await expect(page.getByRole('note').filter({ hasText: 'Private on the left' })).toBeVisible()
  expectGlide(await foldTops(page, () => page.getByRole('button', { name: 'Got it' }).click()))
})

test('home · Esc folds the note the same way', async ({ page }) => {
  await page.goto(`${PAGE}?explain=1`)
  await expect(page.getByRole('note').filter({ hasText: 'Private on the left' })).toBeVisible()
  expectGlide(await foldTops(page, () => page.keyboard.press('Escape')))
})

test('@phone · home · on a phone too, the note folds away without a step', async ({ page }) => {
  await page.goto(`${PAGE}?explain=1`)
  await expect(page.getByRole('note').filter({ hasText: 'Private on the left' })).toBeVisible()
  expectGlide(await foldTops(page, () => page.getByRole('button', { name: 'Got it' }).click()))
})

test('home · the call you are in: its row takes you back to the room, it never hangs up', async ({ page }) => {
  await page.goto(`${PAGE}?call=${id(1)}`)
  const yours = row(page, 'Launch plan')
  await expect(yours).toContainText('Back to the room')
  await yours.click()
  expect(await pressed(page)).toEqual([`back ${id(1)}`])
})

test('home · while the projects load, their placeholders can’t be pressed', async ({ page }) => {
  await page.goto(`${PAGE}?projects=loading`)
  const placeholder = page.locator('.c2-row.placeholder').first()
  await expect(placeholder).toBeVisible()
  expect(await placeholder.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
})

test('@phone · home · on touch, a row that joins a room says so before it is tapped', async ({ page }) => {
  await page.goto(`${PAGE}?projects=live`)
  await expect(row(page, 'Pitch deck').getByText('Join the room')).toBeVisible()
})

test('home · Sophia’s light turns to you while you point at her door, and rests when you leave', async ({ page }) => {
  await page.goto(PAGE)
  const light = page.locator('[data-door="personal"] .light')
  await expect(light).toHaveAttribute('data-mode', 'rest')
  const box = await page.locator('[data-door="personal"]').boundingBox()
  await page.mouse.move((box?.x ?? 0) + 40, (box?.y ?? 0) + 120)
  await expect(light).toHaveAttribute('data-mode', 'listen')
  await expect(light).toHaveAttribute('data-attention', /\d+ \d+/)
  await page.mouse.move(5, 5)
  await expect(light).toHaveAttribute('data-mode', 'rest')
  await page.locator('[data-door="personal"]').click()
  expect(await pressed(page)).toEqual(['personal'])
})

test('home · locked, Sophia rests behind the padlock and her door unlocks', async ({ page }) => {
  await page.goto(`${PAGE}?locked=1`)
  const door = page.locator('[data-door="personal"]')
  await expect(door).toContainText('Unlock')
  await expect(door.locator('.c2-locked')).toBeVisible()
  const box = await door.boundingBox()
  await page.mouse.move((box?.x ?? 0) + 40, (box?.y ?? 0) + 120)
  await expect(door.locator('.light')).toHaveAttribute('data-mode', 'rest')
})

test('home · with less motion asked for, the rows don’t lift', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(PAGE)
  await row(page, 'Launch plan').hover()
  await page.waitForTimeout(300)
  expect(await row(page, 'Launch plan').evaluate((el) => getComputedStyle(el).transform)).toBe('none')
})

test('@phone · home · one column, every project one press, nothing past the screen', async ({ page }) => {
  await page.goto(PAGE)
  await expect(rows(page)).toHaveCount(3)
  for (const title of ['Product launch', 'Launch plan', 'Research notes'])
    await expect(row(page, title)).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('home · hidden, Sophia’s light asks for no frames; shown again, she is back', async ({ page }) => {
  await page.addInitScript(() => {
    window.homeFramesAsked = 0
    const ask = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (fn) => {
      window.homeFramesAsked = (window.homeFramesAsked ?? 0) + 1
      return ask(fn)
    }
  })
  await page.goto(PAGE)
  await expect(page.locator('[data-door="personal"] .light')).toBeAttached()
  const count = () => page.evaluate(() => window.homeFramesAsked ?? 0)
  await page.evaluate(() => document.querySelector('.c-home')?.setAttribute('hidden', ''))
  await page.waitForTimeout(300)
  const hidden = await count()
  await page.waitForTimeout(500)
  expect((await count()) - hidden).toBeLessThan(3)
  await page.evaluate(() => document.querySelector('.c-home')?.removeAttribute('hidden'))
  await page.waitForTimeout(500)
  expect((await count()) - hidden).toBeGreaterThan(10)
})
