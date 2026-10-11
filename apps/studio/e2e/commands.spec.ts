// Commands (docs/plans/commands.md): the palette on Ctrl+K, the index of keys on Ctrl+/ and ?, both from one registry
// fed by the parts on screen, on the room fixture.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const PAGE = '/room.html?demo=1'
const palette = (page: Page) => page.getByRole('dialog', { name: 'Commands' })
const index = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' })
const field = (page: Page) => page.getByRole('combobox', { name: 'Command' })
const options = (page: Page) => palette(page).getByRole('option')

test('commands · Ctrl+K opens the palette in its field; a view by its words, Enter goes there; Escape closes', async ({
  page,
}) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await page.keyboard.press('Control+k')
  await expect(palette(page)).toBeVisible()
  await expect(field(page)).toBeFocused()
  await field(page).fill('tas')
  await expect(options(page).first()).toHaveText(/Go to Tasks/)
  await page.keyboard.press('Enter')
  await expect(palette(page)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Control+k')
  await expect(palette(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette(page)).toHaveCount(0)
})

test('commands · the palette offers what the page takes now: the Studio view’s brief, said by its state; not in Tasks; ↓ moves', async ({
  page,
}) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await page.keyboard.press('Control+k')
  await field(page).fill('brief')
  await expect(options(page).first()).toHaveText(/Open the brief\s*B$/)
  await page.keyboard.press('Enter')
  await expect(palette(page)).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await field(page).fill('brief')
  await expect(options(page).first()).toHaveText(/Close the brief/)
  await field(page).fill('')
  await expect(options(page).first()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await page.goto(`${PAGE}&place=work`)
  await drawn(page, DRAWN.tasks)
  await page.keyboard.press('Control+k')
  expect((await options(page).allInnerTexts()).join('\n')).not.toMatch(/brief|lens/)
  await expect(options(page).first()).toHaveText(/Home\s*H$/)
})

test('commands · the index of keys: ? where nothing takes stray typing, Ctrl+/ from anywhere; the keys the page takes', async ({
  page,
}) => {
  await page.goto(`${PAGE}&place=work`)
  await drawn(page, DRAWN.tasks)
  await page.keyboard.press('Shift+/')
  await expect(index(page)).toBeVisible()
  // Tasks has a search of its own on `/`: the index names it, and the project's search keeps no key here.
  await expect(index(page).locator('.keys-list li')).toHaveText([
    /Home\s*H$/,
    /Your projects\s*W$/,
    /Search goals and tasks\s*\/$/,
    /Commands\s*Ctrl\+K$/,
    /Keyboard shortcuts\s*Ctrl\+\/$/,
    /Invite someone\s*I$/,
  ])
  await page.keyboard.press('Escape')
  await expect(index(page)).toHaveCount(0)
  // In the Studio view the message bar takes stray typing: ? is text for it; Ctrl+/ opens the index from the field.
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await page.keyboard.press('Shift+/')
  await expect(page.locator('[data-typing-sink]').first()).toHaveValue('?')
  await expect(index(page)).toHaveCount(0)
  await page.keyboard.press('Control+/')
  await expect(index(page)).toBeVisible()
  await expect(index(page).locator('.keys-list li')).toContainText([
    /Converse lens\s*1$/,
    /Explore lens\s*2$/,
    /Build lens\s*3$/,
    /Open the chat\s*C$/,
    /Open the brief\s*B$/,
  ])
})

test('commands · the index has a visible control too: «Keyboard shortcuts» in the account menu, with its key', async ({
  page,
}) => {
  await page.goto(`${PAGE}&place=work`)
  await drawn(page, DRAWN.tasks)
  await page.getByRole('button', { name: 'Account' }).click()
  const item = page.getByRole('menuitem', { name: /Keyboard shortcuts/ })
  await expect(item).toContainText('Ctrl+/')
  await item.click()
  await expect(index(page)).toBeVisible()
})

test('commands · the row the keys choose stays in the list’s view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await page.keyboard.press('Control+k')
  await expect(options(page).first()).toBeVisible()
  for (let i = 0; i < 14; i += 1) await page.keyboard.press('ArrowDown')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const list = document.querySelector('.palette-list')
        const active = list?.querySelector('[aria-selected="true"]')
        if (!list || !active) return null
        const box = list.getBoundingClientRect()
        const row = active.getBoundingClientRect()
        return row.top >= box.top - 1 && row.bottom <= box.bottom + 1
      }),
    )
    .toBe(true)
  await expect(field(page)).toBeFocused()
})

test('commands · the light by a key: Ctrl+Shift+L puts the light page on the root, again the dark room; the palette says which comes next', async ({
  page,
}) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await page.keyboard.press('Control+k')
  await field(page).fill('light')
  await expect(options(page).first()).toHaveText(/Switch to the light page\s*Ctrl\+Shift\+L$/)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Shift+l')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.keyboard.press('Control+k')
  await field(page).fill('dark')
  await expect(options(page).first()).toHaveText(/Switch to the dark room/)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Shift+l')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
})
