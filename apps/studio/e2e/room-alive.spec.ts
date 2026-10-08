import { expect, test, type Page } from '@playwright/test'

// The demo's room, alive (docs/plans/room-alive.md): the team is there, and Sophia, asked in, says where the project
// stands, captioned as she says it; Marco answers aloud. Every name and word here is synthetic.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const press = (page: Page, name: string) => dock(page).getByRole('button', { name, exact: true })
const people = (page: Page) => page.getByRole('list', { name: 'In the room' }).getByRole('listitem')
const lines = (page: Page) => page.locator('.stage-captions .stage-caption')

const MARCOS = 'With the two that left. What would have kept them?'

async function enter(page: Page, query: string) {
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.goto(`/room.html?call=on&${query}`)
  await expect(press(page, 'Leave the room')).toBeVisible()
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

test('alive · in the demo the team is there: Marco and Lucía, unasked', async ({ page }) => {
  await enter(page, 'demo=1')
  await expect(people(page).filter({ hasText: 'Marco' })).toHaveCount(1)
  await expect(people(page).filter({ hasText: 'Lucía' })).toHaveCount(1)
})

test('alive · asked in, she says where the project stands, captioned; Marco answers; she listens', async ({ page }) => {
  await enter(page, 'demo=1')
  await press(page, 'Speak with Sophia').click()
  const hers = page.locator('.stage-captions .stage-caption[data-speaker="sophia"]')
  await expect(hers).toHaveAttribute('data-said', 'partial')
  await expect(hers.locator('.caption-who')).toHaveText('Sophia')
  // The stage keeps a long line's end: the whole of it is in the chat.
  await expect(hers.locator('.caption-words')).toHaveText(
    /the two that left both changed their admin in week three\. Where do you want to start\?$/u,
  )
  // Only the floor's holder is captioned: Marco takes it before he speaks, and she listens to him.
  const his = page.locator('.stage-captions .stage-caption[data-speaker="member"]')
  await expect(his.locator('.caption-who')).toHaveText('Marco')
  await expect(his.locator('.caption-words')).toHaveText(MARCOS)
  await expect(page.getByText('Sophia is listening to Marco').first()).toBeVisible()
})

test('alive · «Stop speaking» cuts her line, and nothing more is said', async ({ page }) => {
  await enter(page, 'demo=1')
  await press(page, 'Speak with Sophia').click()
  await expect(page.locator('.stage-captions .stage-caption[data-speaker="sophia"]')).toHaveCount(1)
  await press(page, 'Stop speaking').click()
  // Her line ends cut off where it was, and she listens to whoever asked.
  await expect(page.locator('.stage-captions .stage-caption[data-speaker="sophia"]')).toHaveAttribute(
    'data-said',
    'interrupted',
  )
  await expect(page.getByText('Sophia is listening to you').first()).toBeVisible()
  const said = await lines(page).allTextContents()
  // Longer than her whole line and Marco's would take: neither goes on.
  await page.waitForTimeout(6000)
  await expect(lines(page).filter({ hasText: MARCOS })).toHaveCount(0)
  expect((await lines(page).allTextContents()).join(' ').length).toBeLessThanOrEqual(said.join(' ').length)
})

test('alive · without the demo, she is asked in and says nothing', async ({ page }) => {
  await enter(page, '')
  await press(page, 'Speak with Sophia').click()
  await expect(page.getByText('Sophia is listening to you').first()).toBeVisible()
  await expect(lines(page)).toHaveCount(0)
})
