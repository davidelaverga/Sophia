import { expect, test, type Page } from '@playwright/test'

// Raise hand in the call (docs/plans/raise-hand.md): a member raises and lowers their hand from the dock, and «Hand
// raised» shows on their tile for everyone in the call. Over LiveKit's data channel, client only. The fake LiveKit runs
// the Studio's own hand signal (hand-signal.ts), records what is sent, and can deliver what this page sent as from
// another person (`window.fixture.echoHand`), which is what a second participant's page would receive.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const room = (page: Page) => page.getByRole('list', { name: 'In the room' })
const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])
const raise = (page: Page) => dock(page).getByRole('button', { name: 'Raise hand', exact: true })
/** A person's place in the room, by the name it shows: a seat around the light, or a tile. */
const seat = (page: Page, name: string) => room(page).getByRole('listitem').filter({ hasText: name })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

async function enter(page: Page, query = 'people=2') {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
}

test('hand · raised from the dock it is sent, reads as pressed with «Lower hand» as its tip, and shows on your tile and in another’s view; lowered, it clears', async ({
  page,
}) => {
  await enter(page)
  await expect(seat(page, 'you')).not.toContainText('Hand raised')
  await raise(page).click()
  // One name, as the dock's other toggles keep theirs; pressed says it is up, and the tip what a press does now.
  await expect(raise(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(raise(page).locator('.tip')).toHaveText('Lower hand')
  await expect.poll(() => asked(page)).toContain('hand:up')
  await expect(seat(page, 'you')).toContainText('Hand raised')
  // What was sent, as Marco's page would receive it from him: his place says it.
  await page.evaluate(() => window.fixture?.echoHand?.(1))
  await expect(seat(page, 'Marco')).toContainText('Hand raised')
  await expect(seat(page, 'Lucía')).not.toContainText('Hand raised')

  await raise(page).click()
  await expect(raise(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(raise(page).locator('.tip')).toHaveText('Raise hand')
  await expect.poll(() => asked(page)).toContain('hand:down')
  await expect(seat(page, 'you')).not.toContainText('Hand raised')
  await page.evaluate(() => window.fixture?.echoHand?.(1))
  await expect(seat(page, 'Marco')).not.toContainText('Hand raised')
})

test('hand · in the gallery, a raised hand shows in the tile’s chip after the name', async ({ page }) => {
  await enter(page, 'people=2&video=camera')
  await raise(page).click()
  await page.evaluate(() => window.fixture?.echoHand?.(2))
  const lucia = room(page).locator('.tile', { hasText: 'Lucía' })
  await expect(lucia.locator('.tile-name')).toContainText('Hand raised')
  await expect(room(page).locator('.tile', { hasText: 'Marco' }).locator('.tile-name')).not.toContainText('Hand raised')
})

test('hand · back from a dropped link, your hand is down, for you and said down to the room', async ({ page }) => {
  await enter(page)
  await raise(page).click()
  await expect(seat(page, 'you')).toContainText('Hand raised')
  await page.evaluate(() => window.fixture?.linkLost(true))
  await page.evaluate(() => window.fixture?.linkLost(false))
  await expect(raise(page)).toBeVisible()
  await expect(seat(page, 'you')).not.toContainText('Hand raised')
  await expect
    .poll(async () => (await asked(page)).filter((a) => a.startsWith('hand:')))
    .toEqual(['hand:up', 'hand:down', 'hand:ask'])
})

test('hand · back from a dropped link, a lowering the room refused is sent again until it goes', async ({ page }) => {
  await enter(page)
  await raise(page).click()
  await expect.poll(() => asked(page)).toContain('hand:up')
  // The first send after the link is back is refused, as a data channel still coming back refuses it.
  await page.evaluate(() => window.fixture?.failHandSends?.(1))
  await page.evaluate(() => window.fixture?.linkLost(true))
  await page.evaluate(() => window.fixture?.linkLost(false))
  await expect(seat(page, 'you')).not.toContainText('Hand raised')
  await expect
    .poll(async () => (await asked(page)).filter((a) => a.startsWith('hand:')), { timeout: 8000 })
    .toEqual(['hand:up', 'hand:down!', 'hand:ask', 'hand:down'])
})

test('hand · leaving lowers it: joined again, the hand is down', async ({ page }) => {
  await enter(page)
  await raise(page).click()
  await dock(page).getByRole('button', { name: 'Leave the room' }).click()
  // Leaving opens what the meeting left; put away, the room is back.
  await page.getByRole('dialog', { name: 'This meeting' }).getByRole('button', { name: 'Close', exact: true }).click()
  await dock(page)
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(raise(page)).toBeVisible()
  await expect(room(page)).not.toContainText('Hand raised')
})

// On a phone the dock keeps its one row of seven (phone-dock.md): the hand goes in React's menu, as Meet's phone has it.
test('hand · at 390 px the hand is raised from React’s menu, and the dock keeps one row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await enter(page)
  await expect(raise(page)).toHaveCount(0)
  await dock(page).getByRole('button', { name: 'React', exact: true }).click()
  await page.getByRole('menu', { name: 'React' }).getByRole('menuitem', { name: 'Raise hand' }).click()
  await expect.poll(() => asked(page)).toContain('hand:up')
  await expect(seat(page, 'you')).toContainText('Hand raised')
  await dock(page).getByRole('button', { name: 'React', exact: true }).click()
  await page.getByRole('menu', { name: 'React' }).getByRole('menuitem', { name: 'Lower hand' }).click()
  await expect.poll(() => asked(page)).toContain('hand:down')
  const tops = await dock(page)
    .getByRole('button')
    .evaluateAll((all) =>
      all.filter((b) => b.getBoundingClientRect().width > 0).map((b) => Math.round(b.getBoundingClientRect().top)),
    )
  expect(new Set(tops).size).toBe(1)
})

// A guest's room token carries media only (apps/api/src/livekit.ts): a raised hand would reach nobody.
test('hand · a guest let in through the door is not offered Raise hand', async ({ page }) => {
  await page.goto('/join.html')
  await page.getByPlaceholder('Your name').fill('Ana Ruiz')
  await page.getByRole('button', { name: 'Ask to come in' }).click()
  await page.evaluate(() => window.joinFixture?.answer('admit'))
  await expect(page.getByText('You’ve been let in')).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: 'Join the room' }).click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect(raise(page)).toHaveCount(0)
})

// A raised hand is said to a screen reader (docs/plans/hand-and-sync-announced.md): politely, from a line mounted all
// along, never taking the focus; only another's hand rising, never your own or a lowering.
test('hand · another’s raised hand is said politely, once, and the focus stays where it was; yours and a lowering say nothing', async ({
  page,
}) => {
  await enter(page)
  const said = page.locator('.hand-said[role="status"]')
  // There before it speaks, so what it says is read; out of sight.
  await expect(said).toHaveCount(1)
  await expect(said).toHaveText('')
  await raise(page).focus()
  await page.keyboard.press('Enter')
  await expect(raise(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(said, 'your own hand is not said: your button reads as pressed').toHaveText('')
  // What was sent, as Marco's page would receive it from him.
  await page.evaluate(() => window.fixture?.echoHand?.(1))
  await expect(said).toHaveText('Marco raised their hand.')
  await expect(raise(page), 'the focus stays on the dock’s button').toBeFocused()
  // The line goes quiet after a few seconds (as a reaction goes); then a lowering says nothing.
  await expect(said).toHaveText('', { timeout: 8000 })
  await page.keyboard.press('Enter')
  await expect(raise(page)).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.fixture?.echoHand?.(1))
  await expect(seat(page, 'Marco')).not.toContainText('Hand raised')
  await page.waitForTimeout(1000)
  await expect(said, 'a lowering is not said').toHaveText('')
})

// One line for the whole call (review P2): said on another view too, where the call goes on in the header's dock.
test('hand · on Tasks, with the call in the header, another’s raised hand is still said, from one line', async ({
  page,
}) => {
  await enter(page)
  await raise(page).click()
  await expect(raise(page)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Tasks' }).click()
  await expect(page.getByRole('group', { name: 'Project room' })).toBeVisible()
  await expect(dock(page)).toHaveCount(0)
  const said = page.locator('.hand-said[role="status"]')
  await expect(said).toHaveCount(1)
  await page.evaluate(() => window.fixture?.echoHand?.(1))
  await expect(said).toHaveText('Marco raised their hand.')
})
