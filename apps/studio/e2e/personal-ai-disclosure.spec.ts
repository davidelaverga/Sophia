import { expect, test, type Page } from '@playwright/test'

// Personal says Sophia is an AI, and help is one press away (docs/plans/personal-ai-disclosure.md): a line that stays
// under the field and in a talk by voice, and «Help now», a sheet of crisis lines to call, text or open.

const line = (page: Page) => page.locator('.c3-ai-line').first()
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Help now' })
const way = (page: Page, name: string) => sheet(page).getByRole('link', { name, exact: true })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('ai · under the field, a line says Sophia is an AI, not a person', async ({ page }) => {
  await page.goto('/personal.html')
  await expect(page.locator('#c-input')).toBeVisible()
  await expect(line(page)).toContainText('Sophia is an AI, not a person.')
  const field = await page.locator('#c-input').boundingBox()
  const said = await line(page).boundingBox()
  expect(said && field && said.y >= field.y + field.height, 'the line under the field').toBe(true)
})

test('ai · «Help now» opens the crisis lines, each one press away; Esc gives the focus back', async ({ page }) => {
  await page.goto('/personal.html')
  const help = line(page).getByRole('button', { name: 'Help now' })
  await help.click()
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page)).toContainText('911 in the US and Canada, 112 in Europe')
  await expect(sheet(page).getByRole('listitem')).toHaveCount(5)
  await expect(way(page, 'Call 988').first()).toHaveAttribute('href', 'tel:988')
  await expect(way(page, 'Text 988').first()).toHaveAttribute('href', 'sms:988')
  await expect(way(page, 'Call 116 123')).toHaveAttribute('href', 'tel:116123')
  await expect(way(page, 'Call 024')).toHaveAttribute('href', 'tel:024')
  const elsewhere = way(page, 'findahelpline.com')
  await expect(elsewhere).toHaveAttribute('href', 'https://findahelpline.com')
  await expect(elsewhere).toHaveAttribute('target', '_blank')
  await expect(elsewhere).toHaveAttribute('rel', 'noopener noreferrer')
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(help).toBeFocused()
})

test('ai · in a talk by voice, the line is there too', async ({ page }) => {
  await page.goto('/personal.html?voice=1&step=150')
  await page.getByRole('button', { name: 'Talk with her' }).click()
  const talk = page.getByRole('dialog', { name: 'Talking with Sophia' })
  await expect(talk).toBeVisible()
  await expect(talk.locator('.c3-ai-line')).toHaveText('Sophia is an AI, not a person.')
})

test('@phone · ai · on a touch screen, «Help now» is a full-size target, and the line keeps its height', async ({
  page,
}) => {
  await page.goto('/personal.html')
  const help = await line(page).getByRole('button', { name: 'Help now' }).boundingBox()
  expect(help?.height ?? 0).toBeGreaterThanOrEqual(40)
  expect((await line(page).boundingBox())?.height ?? 0).toBeLessThanOrEqual(28)
})
