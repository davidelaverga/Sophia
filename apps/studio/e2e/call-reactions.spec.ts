import { expect, test, type Page } from '@playwright/test'

// Reactions in the call (docs/plans/call-reactions.md): React in the dock offers Meet's six; one chosen floats up the
// room with who sent it, for everyone in the call, and goes after a few seconds. Over LiveKit's data channel, nothing
// kept. The fake LiveKit records what is sent and lets the others react (`window.fixture.reactFrom`).

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const layer = (page: Page) => page.getByRole('log', { name: 'Reactions' })
const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

async function enter(page: Page) {
  await page.goto('/room.html?call=on&people=2')
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
}

test('reactions · React offers the six; one chosen floats up with your name, is sent, and goes', async ({ page }) => {
  await enter(page)
  await dock(page).getByRole('button', { name: 'React', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'React' })
  await expect(menu.getByRole('menuitem')).toHaveText([
    '👍 Thumbs up',
    '❤️ Heart',
    '😂 Laugh',
    '🎉 Celebrate',
    '👏 Clap',
    '😮 Surprised',
  ])
  await menu.getByRole('menuitem', { name: '🎉 Celebrate' }).click()
  await expect(layer(page).getByRole('listitem')).toHaveText(['🎉 You reacted Celebrate'])
  await expect.poll(() => asked(page)).toContain('reaction:🎉')
  // It goes after a few seconds.
  await expect(layer(page).getByRole('listitem')).toHaveCount(0, { timeout: 8000 })
})

test('reactions · another’s reaction floats up with their name; one that isn’t of the six never shows', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.reactFrom?.('Marco', '👏'))
  await expect(layer(page).getByRole('listitem')).toHaveText(['👏 Marco reacted Clap'])
  await page.evaluate(() => window.fixture?.reactFrom?.('Marco', '💣'))
  await expect(layer(page).getByRole('listitem')).toHaveCount(1)
})

test('@phone · reactions · on a phone React is one more square in the dock’s row', async ({ page }) => {
  await enter(page)
  const react = dock(page).getByRole('button', { name: 'React', exact: true })
  await expect(react).toBeVisible()
  const box = await react.boundingBox()
  expect([Math.round(box?.width ?? 0), Math.round(box?.height ?? 0)]).toEqual([42, 42])
})

// A guest's room token carries media only (apps/api/src/livekit.ts), so a reaction would reach nobody: their dock
// doesn't offer React (docs/plans/guest-reactions.md).
test('reactions · a guest let in through the door is not offered React; a member in the call is', async ({ page }) => {
  await page.goto('/join.html')
  await page.getByPlaceholder('Your name').fill('Ana Ruiz')
  await page.getByRole('button', { name: 'Ask to come in' }).click()
  await page.evaluate(() => window.joinFixture?.answer('admit'))
  await expect(page.getByText('You’ve been let in')).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: 'Join the room' }).click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect(dock(page).getByRole('button', { name: 'React', exact: true })).toHaveCount(0)
  await enter(page)
  await expect(dock(page).getByRole('button', { name: 'React', exact: true })).toBeVisible()
})
