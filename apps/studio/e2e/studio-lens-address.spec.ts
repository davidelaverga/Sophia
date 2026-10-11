// The lens in the address, and the background's work one press away (docs/plans/studio-lens-address.md), on the room
// fixture.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const PAGE = '/room.html?demo=1'
const lens = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) })
const search = (page: Page) => page.evaluate(() => window.location.search)

test('lens · the address names the lens: named at load it wins; chosen, it is written; Converse by its absence', async ({
  page,
}) => {
  await page.goto(`${PAGE}&lens=explore`)
  await drawn(page, DRAWN.room)
  await expect(lens(page, 'Explore')).toHaveAttribute('aria-selected', 'true')
  await lens(page, 'Build').click()
  await expect(lens(page, 'Build')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => search(page)).toBe('?demo=1&lens=build')
  await lens(page, 'Converse').click()
  await expect.poll(() => search(page)).toBe('?demo=1')
  // Kept as Converse; a link naming Build still shows Build.
  await page.goto(`${PAGE}&lens=build`)
  await drawn(page, DRAWN.room)
  await expect(lens(page, 'Build')).toHaveAttribute('aria-selected', 'true')
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  await expect(lens(page, 'Build')).toHaveAttribute('aria-selected', 'true') // the last chosen, stored
  await lens(page, 'Converse').click()
})

test('lens · «Working on … in the background» is a press: Tasks, with the task named when one is working', async ({
  page,
}) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.room)
  const note = page.getByRole('button', { name: /^Working on \d+ tasks? in the background$/ })
  await expect(note).toBeVisible()
  await note.click()
  await expect(page.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page')
})
