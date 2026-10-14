// The call's keys from every view, as its switches there allow (docs/plans/call-keys-anywhere.md): beyond the dock the
// microphone goes both ways on Ctrl+D, the camera and the screen only turn off, and Leave is in the palette.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const IN_CALL = '/room.html?demo=1&call=on&people=2&floor=1&sophia=listening'
const dock = (page: Page) => page.getByRole('group', { name: 'Project room' })
const palette = (page: Page) => page.getByRole('dialog', { name: 'Commands' })
const field = (page: Page) => page.getByRole('combobox', { name: 'Command' })

test('call keys · in a call, from Tasks, Ctrl+D turns the microphone off and on again', async ({ page }) => {
  await page.goto(`${IN_CALL}&place=work`)
  await drawn(page, DRAWN.tasks)
  const mic = dock(page).getByRole('button', { name: 'Microphone' })
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+d')
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Control+d')
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
})

test('call keys · from Tasks, Ctrl+E with the camera off starts nothing', async ({ page }) => {
  await page.goto(`${IN_CALL}&place=work`)
  await drawn(page, DRAWN.tasks)
  await page.keyboard.press('Control+e')
  await expect(dock(page).getByRole('button', { name: 'Camera' })).toHaveCount(0)
})

test('call keys · the camera turned on in the Studio view, Ctrl+E from Tasks turns it off', async ({ page }) => {
  await page.goto(IN_CALL)
  // In a call the stage shows the dock's switches, not «The room is ready».
  await expect(page.getByRole('button', { name: 'Microphone' }).first()).toBeVisible()
  await page.keyboard.press('Control+e')
  await expect(page.getByRole('button', { name: 'Camera' }).first()).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Tasks' }).click()
  await drawn(page, DRAWN.tasks)
  const camera = dock(page).getByRole('button', { name: 'Camera' })
  await expect(camera).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+e')
  await expect(camera).toHaveCount(0)
})

test('call keys · from Tasks the palette offers the microphone and Leave; Enter on Leave leaves', async ({ page }) => {
  await page.goto(`${IN_CALL}&place=work`)
  await drawn(page, DRAWN.tasks)
  await page.keyboard.press('Control+k')
  await field(page).fill('microphone')
  await expect(palette(page).getByRole('option').first()).toHaveText(/Microphone off/)
  await field(page).fill('leave')
  await expect(palette(page).getByRole('option').first()).toHaveText(/Leave the room/)
  await page.keyboard.press('Enter')
  await expect(palette(page)).toHaveCount(0)
  await expect(dock(page).getByRole('button', { name: /Join the room/ })).toBeVisible()
})

test('call keys · the header microphone’s tip says its key', async ({ page }) => {
  await page.goto(`${IN_CALL}&place=work`)
  await drawn(page, DRAWN.tasks)
  const mic = dock(page).getByRole('button', { name: 'Microphone' })
  await mic.focus()
  await expect(mic.locator('.tip kbd')).toHaveText(/Ctrl\+D|⌘D/)
})
