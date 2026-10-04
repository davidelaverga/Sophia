// Home, the Welcome (docs/plans/home-welcome.md): an editorial page that knows you. Its fixture page renders the
// Studio's own Welcome over labelled projects (fixtures/home.tsx).
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/home.html'
const id = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`
const pressed = (page: Page) => page.evaluate(() => window.homeFixture?.pressed ?? [])
/** The fixture's voice says its sentence now, if the microphone is still listening. */
const hear = (page: Page) => page.evaluate(() => window.homeFixture?.hear())
const index = (page: Page) => page.getByRole('list', { name: 'Your projects' })
const row = (page: Page, title: string) => index(page).getByRole('button', { name: new RegExp(title) })
const light = (page: Page) => page.locator('[data-door="personal"] .light')
const line = (page: Page) => page.getByRole('textbox', { name: 'Say something to Sophia' })

declare global {
  interface Window {
    homeFramesAsked?: number
  }
}

test('home · the greeting, and Sophia’s one sentence: the session about to start', async ({ page }) => {
  await page.goto(PAGE)
  await expect(page.locator('.hw-hello')).toHaveText(/,\s*Luis\.$/)
  await expect(page.locator('.hw-says')).toHaveText('Standup in Product launch starts in 10 min.')
  await expect(page.locator('.hw-says strong')).toHaveText('Product launch')
})

test('home · the index: Work’s first three, numbered, each saying quietly what matters, then all of them', async ({
  page,
}) => {
  await page.goto(PAGE)
  const rows = index(page).getByRole('listitem')
  await expect(rows).toHaveCount(4) // three projects, then "All 4 projects"
  await expect(rows.nth(0)).toContainText('01Product launchStandup starts in 10 min')
  await expect(rows.nth(1)).toContainText('02Launch planYou and 2 others')
  await expect(rows.nth(2)).toContainText('03Research notesYou and 1 other')
  await expect(page.getByText('Design review')).toHaveCount(0)
  await expect(rows.nth(0).locator('.hw-row')).toHaveAttribute('data-tone', 'soon')
  await row(page, 'Launch plan').click()
  await index(page)
    .getByRole('button', { name: /All 4 projects/ })
    .click()
  expect(await pressed(page)).toEqual([`open ${id(1)}`, 'work'])
})

test('home · a live room is said in Sophia’s sentence and on its row, and the row joins', async ({ page }) => {
  await page.goto(`${PAGE}?projects=live`)
  await expect(page.locator('.hw-says')).toHaveText('Davide and Sophia are in Pitch deck.')
  await expect(row(page, 'Pitch deck')).toContainText('Davide and Sophia are here')
  await row(page, 'Pitch deck').click()
  expect(await pressed(page)).toEqual([`join ${id(5)}`])
})

test('home · the call you are in: Sophia says so, and its row takes you back, never hangs up', async ({ page }) => {
  await page.goto(`${PAGE}?call=${id(1)}`)
  await expect(page.locator('.hw-says')).toHaveText('You’re in Launch plan’s room.')
  await expect(row(page, 'Launch plan')).toContainText('You’re in the room')
  await row(page, 'Launch plan').click()
  expect(await pressed(page)).toEqual([`back ${id(1)}`])
})

test('home · ↑ and ↓ move in the index, Enter opens', async ({ page }) => {
  await page.goto(PAGE)
  await row(page, 'Product launch').focus()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Launch plan')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp') // holds at the first
  await expect(row(page, 'Product launch')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  expect(await pressed(page)).toEqual([`open ${id(1)}`])
})

test('home · no projects: Sophia invites, one row starts the first; loading claims nothing; a failure says so', async ({
  page,
}) => {
  await page.goto(`${PAGE}?projects=none`)
  await expect(page.locator('.hw-says')).toHaveText('Start a project when you’re ready, or just talk to me.')
  await index(page)
    .getByRole('button', { name: /Start a project/ })
    .click()
  expect(await pressed(page)).toEqual(['new project'])
  await page.goto(`${PAGE}?projects=loading`)
  await expect(page.locator('.hw-row.placeholder')).toHaveCount(3)
  expect(
    await page
      .locator('.hw-row.placeholder')
      .first()
      .evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe('none')
  await expect(page.locator('.hw-says')).toHaveCount(0)
  await page.goto(`${PAGE}?projects=failed`)
  await expect(page.getByText('Couldn’t load your projects.')).toBeVisible()
  await expect(page.locator('.hw-row.placeholder')).toHaveCount(0)
})

test('home · “/” reaches the line; your words go to her conversation, which sends them as its own', async ({
  page,
}) => {
  await page.goto(PAGE)
  await page.keyboard.press('/')
  await expect(line(page)).toBeFocused()
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await page.keyboard.type('How did the launch go?')
  await page.keyboard.press('Enter')
  expect(await pressed(page)).toEqual(['say How did the launch go?'])
  await expect(line(page)).toHaveValue('') // handed, not kept: Personal's composer has them now
})

test('home · with a sheet open over Home, “/” leaves the focus where it is', async ({ page }) => {
  await page.goto(PAGE)
  await page.evaluate(() => {
    const sheet = Object.assign(document.createElement('div'), { role: 'dialog', tabIndex: -1 })
    sheet.setAttribute('aria-modal', 'true')
    sheet.textContent = 'A sheet'
    document.body.append(sheet)
    sheet.focus()
  })
  await page.keyboard.press('/')
  await expect(line(page)).not.toBeFocused()
})

test('home · you and Sophia: where you left off opens your conversation; your notes open them', async ({ page }) => {
  await page.goto(PAGE)
  const you = page.getByRole('list', { name: 'You and Sophia' })
  await expect(you.getByRole('button').first()).toContainText(/Continue.*the launch pressure/)
  await you.getByRole('button', { name: /Continue/ }).click()
  await you.getByRole('button', { name: /3 notes/ }).click()
  expect(await pressed(page)).toEqual(['personal', 'notes'])
  await page.goto(`${PAGE}?you=new`)
  await expect(you.getByRole('button')).toHaveCount(1)
  await expect(you.getByRole('button')).toContainText('Start talking')
})

test('home · locked, your row unlocks your space, and no line talks to her', async ({ page }) => {
  await page.goto(`${PAGE}?locked=1`)
  const unlock = page.getByRole('list', { name: 'You and Sophia' }).getByRole('button', { name: /Unlock/ })
  await expect(unlock).toContainText('Locked on this device')
  await expect(line(page)).toHaveCount(0)
  await unlock.click()
  expect(await pressed(page)).toEqual(['personal'])
})

test('home · speak instead: the line listens with her, what she heard lands in it, Enter sends it', async ({
  page,
}) => {
  await page.goto(PAGE)
  const mic = page.getByRole('button', { name: 'Speak instead' })
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await expect(line(page)).toHaveAttribute('placeholder', 'Listening…')
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await hear(page)
  await expect(line(page)).toHaveValue('the launch felt rushed')
  await expect(line(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => pressed(page)).toEqual(['say the launch felt rushed'])
})

test('home · stepping away from Home stops the microphone: nothing heard lands out of sight', async ({ page }) => {
  await page.goto(PAGE)
  const mic = page.getByRole('button', { name: 'Speak instead' })
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Leave Home' }).click()
  await expect(page.locator('.c-home')).toBeHidden()
  await hear(page) // what the voice says now, out of sight, must not land
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
  await expect(line(page)).toHaveValue('')
})

test('home · pressed again, the microphone stops, and nothing it would have heard lands', async ({ page }) => {
  await page.goto(PAGE)
  const mic = page.getByRole('button', { name: 'Speak instead' })
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
  await expect(line(page)).toHaveAttribute('placeholder', 'Say something to Sophia')
  await hear(page)
  await expect(line(page)).toHaveValue('')
})

test('home · without speech on this device, there is no microphone', async ({ page }) => {
  await page.goto(`${PAGE}?voice=none`)
  await expect(line(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Speak instead' })).toHaveCount(0)
})

test('home · Sophia’s light turns to you as you move, and rests when you leave', async ({ page }) => {
  await page.goto(PAGE)
  await expect(light(page)).toHaveAttribute('data-mode', 'rest')
  await page.mouse.move(300, 300)
  await page.mouse.move(340, 320)
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await expect(light(page)).toHaveAttribute('data-attention', /-?\d+ -?\d+/)
  await page.mouse.move(-10, -10)
  await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent('pointerleave')))
  await expect(light(page)).toHaveAttribute('data-mode', 'rest')
})

test('home · with less motion asked for, her light stays at rest, nothing arrives or slides', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(PAGE)
  await page.mouse.move(300, 300)
  await page.mouse.move(340, 320)
  await page.waitForTimeout(300)
  await expect(light(page)).toHaveAttribute('data-mode', 'rest')
  const moving = await page
    .locator('.hw-col')
    .evaluate((c) => c.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)
  expect(moving).toBe(0)
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
  await expect(light(page)).toBeAttached()
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

test('@phone · home · one column, every project one press, a join said before the tap, nothing past the screen', async ({
  page,
}) => {
  await page.goto(`${PAGE}?projects=live`)
  await expect(row(page, 'Pitch deck')).toBeInViewport()
  // Said in words of their own width, not only to a screen reader.
  const join = await row(page, 'Pitch deck').getByText('Join the room').boundingBox()
  expect(join?.width).toBeGreaterThan(40)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
