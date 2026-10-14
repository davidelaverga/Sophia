// The account menu says who you are (docs/plans/account-menu.md): the head names the account and how it signed in; the
// theme stands on one row; in a project the data item says it is your personal data; the demo's items answer.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const openMenu = async (page: Page) => {
  await page.goto('/room.html?demo=1&place=goals')
  await drawn(page, DRAWN.goals)
  await page.getByRole('button', { name: 'Account' }).click()
  return page.getByRole('menu', { name: 'Account' })
}

test('account · the head says the account and how it signed in', async ({ page }) => {
  const menu = await openMenu(page)
  const head = menu.locator('.menu-head')
  await expect(head).toContainText('luis@sophia.test')
  await expect(head).toContainText('Signed in with an email code')
})

test('account · the theme’s three choices stand on one row, and Light turns on', async ({ page }) => {
  const menu = await openMenu(page)
  const choices = menu.getByRole('group', { name: 'Theme' }).getByRole('menuitemradio')
  await expect(choices).toHaveCount(3)
  const tops = await choices.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  await menu.getByRole('menuitemradio', { name: 'Light' }).click()
  await page.getByRole('button', { name: 'Account' }).click()
  await expect(
    page.getByRole('menu', { name: 'Account' }).getByRole('menuitemradio', { name: 'Light' }),
  ).toHaveAttribute('aria-checked', 'true')
})

test('account · in a project the data item says it is your personal data', async ({ page }) => {
  const menu = await openMenu(page)
  await expect(menu.getByRole('menuitem', { name: 'Your personal data' })).toBeVisible()
})

test('account · the demo’s How privacy works opens its sheet, and Sign out reaches the sign-in', async ({ page }) => {
  let menu = await openMenu(page)
  await menu.getByRole('menuitem', { name: 'How privacy works' }).click()
  await expect(page.getByRole('dialog', { name: 'How privacy works' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Account' }).click()
  menu = page.getByRole('menu', { name: 'Account' })
  await menu.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/signin\.html/)
})
