import { expect, test, type Page } from '@playwright/test'

// Each person's volume, for you alone (docs/plans/people-volume.md): on each other person's row in People, a menu of
// levels from 100% to Off, shown on the row and put on their sounds by the call's connection (the fixture's records
// `volume:<identity>:<level>`). Leaving the call sets everyone back to full. Every name is synthetic.

const MARCO = '00000000-0000-4000-8000-0000000000b1'
const LUCIA = '00000000-0000-4000-8000-0000000000b2'
const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const list = (page: Page) => page.getByRole('list', { name: 'People in the call' })
const row = (page: Page, name: string) => list(page).locator('li', { hasText: name })
const volume = (page: Page, name: string) => list(page).getByRole('button', { name: new RegExp(`^Volume for ${name}`) })
const menu = (page: Page, name: string) => page.getByRole('menu', { name: `Volume for ${name}` })
const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])
/** Every part of a row's volume control stays inside its row: nothing of it reaches the next one. */
const inside = (page: Page, name: string) =>
  row(page, name).evaluate((li) => {
    const box = li.getBoundingClientRect()
    return [...li.querySelectorAll('.person-volume, .person-volume button, .person-volume-level')].every((el) => {
      const part = el.getBoundingClientRect()
      return part.top >= box.top - 0.5 && part.bottom <= box.bottom + 0.5 && part.right <= box.right + 0.5
    })
  })

async function enter(page: Page, query = '') {
  await page.goto(`/room.html?call=on&people=2${query}`)
  await expect(leave(page).first()).toBeVisible()
  await page.locator('.panel-toggles [data-panel="people"]').click()
  await expect(list(page)).toBeVisible()
}

async function choose(page: Page, name: string, level: string) {
  await volume(page, name).click()
  await menu(page, name).getByRole('menuitemradio', { name: level, exact: true }).click()
  await expect(menu(page, name)).toBeHidden()
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

test('volume · each other person’s row turns their sound down for you alone, and says how far', async ({ page }) => {
  await enter(page)
  await expect(row(page, 'Fixture · you').getByRole('button', { name: /^Volume for/ })).toHaveCount(0)
  await expect(volume(page, 'Marco')).toHaveAccessibleName('Volume for Marco: 100%')
  await volume(page, 'Marco').click()
  await expect(menu(page, 'Marco')).toContainText('For you alone')
  const levels = menu(page, 'Marco').getByRole('menuitemradio')
  await expect(levels).toHaveText(['100%', '75%', '50%', '25%', 'Off'])
  await expect(levels.first()).toHaveAttribute('aria-checked', 'true')
  await levels.nth(2).click()
  await expect.poll(() => asked(page)).toContain(`volume:${MARCO}:0.5`)
  await expect(volume(page, 'Marco')).toHaveAccessibleName('Volume for Marco: 50%')
  await expect(row(page, 'Marco').locator('.person-volume-level')).toHaveText('50%')
  expect(await inside(page, 'Marco')).toBe(true)
  // Lucía's stays full, with nothing shown beside her speaker.
  await expect(volume(page, 'Lucía')).toHaveAccessibleName('Volume for Lucía: 100%')
  await expect(row(page, 'Lucía').locator('.person-volume-level')).toHaveCount(0)
  // Off, then back: the menu checks the level chosen.
  await choose(page, 'Marco', 'Off')
  await expect(volume(page, 'Marco')).toHaveAccessibleName('Volume for Marco: Off')
  await volume(page, 'Marco').click()
  await expect(menu(page, 'Marco').getByRole('menuitemradio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(menu(page, 'Marco')).toBeHidden()
  await expect(list(page)).toBeVisible() // Escape closed the menu only, not the panel
  expect((await asked(page)).filter((a) => a.startsWith('volume:'))).toEqual([
    `volume:${MARCO}:0.5`,
    `volume:${MARCO}:0`,
  ])
})

test('volume · a guest can be turned down too; leaving the call sets everyone back to full', async ({ page }) => {
  await enter(page, '&guest=1')
  await choose(page, 'Lucía', '25%')
  await expect.poll(() => asked(page)).toContain(`volume:${LUCIA}:0.25`)
  await expect(volume(page, 'Lucía')).toHaveAccessibleName('Volume for Lucía: 25%')
  await leave(page).first().click()
  await page.getByRole('dialog', { name: 'This meeting' }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: /^Join the room/ }).click()
  await expect(leave(page).first()).toBeVisible()
  if (!(await list(page).isVisible())) await page.locator('.panel-toggles [data-panel="people"]').click()
  await expect(volume(page, 'Lucía')).toHaveAccessibleName('Volume for Lucía: 100%')
})

test('@phone · volume · on a phone the levels are in reach, and the row keeps its names', async ({ page }) => {
  await enter(page)
  await volume(page, 'Marco').click()
  const off = menu(page, 'Marco').getByRole('menuitemradio', { name: 'Off' })
  await expect(off).toBeInViewport()
  await off.click()
  await expect(volume(page, 'Marco')).toHaveAccessibleName('Volume for Marco: Off')
  expect(await inside(page, 'Marco')).toBe(true)
  await choose(page, 'Lucía', '25%')
  expect(await inside(page, 'Lucía')).toBe(true)
  await expect(row(page, 'Marco').locator('.person-name')).toHaveText('Marco')
  const name = await row(page, 'Marco').locator('.person-name').boundingBox()
  expect(name?.width ?? 0).toBeGreaterThan(40)
})

test('@phone · volume · on touch each volume is a finger’s 40 px square inside its row, at 390 and 320 px (Codex P2 on #425)', async ({
  page,
}) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await enter(page)
    // Lucía's turned down: the level stands in the square, Marco's keeps the speaker.
    await choose(page, 'Lucía', '25%')
    const squares = await list(page)
      .locator('.person-volume .round')
      .evaluateAll((all) =>
        all.map((el) => {
          const box = el.getBoundingClientRect()
          return box.width >= 40 && box.height >= 40
        }),
      )
    expect({ width, squares }).toEqual({ width, squares: [true, true] })
    expect({ width, marco: await inside(page, 'Marco'), lucia: await inside(page, 'Lucía') }).toEqual({
      width,
      marco: true,
      lucia: true,
    })
    const name = await row(page, 'Marco').locator('.person-name').boundingBox()
    expect(name?.width ?? 0).toBeGreaterThan(40)
  }
})
