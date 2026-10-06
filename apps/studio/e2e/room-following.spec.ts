import { expect, test, type Page } from '@playwright/test'

// Who follows what is shown (docs/plans/room-following.md): A14's «N following», from the members-only data packet
// each client sends (following-signal.ts), behind the vision flag the fixture pages set. Every word is synthetic.

const V1 = '00000000-0000-4000-8000-0000000000d1'

const presented = (page: Page) => page.getByRole('region', { name: /^Fixture report, shown by/ })
const meta = (page: Page) => presented(page).locator('.report-main-meta')
const card = (page: Page) => page.locator('.stage-showing')
const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto('/room.html?call=on&people=3&floor=1&sophia=listening')
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
})

test('following · showing a report, the people following it are counted, and the count follows them', async ({
  page,
}) => {
  await page.evaluate(() => window.fixture?.show('me'))
  await expect(meta(page)).toHaveText('v1 · Shown by you')
  await page.evaluate(() => window.fixture?.followers([1, 2]))
  await expect(meta(page)).toHaveText('v1 · Shown by you · 2 following')
  await page.evaluate(() => window.fixture?.followers([2]))
  await expect(meta(page)).toHaveText('v1 · Shown by you · 1 following')
  // Showing it is not following it: the person showing says they follow nothing.
  expect(await asked(page)).not.toContain(`following:${V1}`)
})

test('following · following someone’s report says so to the room, and Stop following unsays it', async ({ page }) => {
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect(presented(page)).toBeVisible()
  await expect.poll(() => asked(page)).toContain(`following:${V1}`)
  // A follower sees no count: for them, it would be ambiguous.
  await page.evaluate(() => window.fixture?.followers([2]))
  await expect(presented(page).locator('.report-main-meta')).not.toContainText('following')
  await presented(page).getByRole('button', { name: 'Stop following' }).click()
  await expect.poll(async () => (await asked(page)).at(-1)).toBe('following:')
  // Said once per change, never on a render: the room's other events re-render the stage meanwhile.
  expect((await asked(page)).filter((a) => a.startsWith('following:'))).toEqual([`following:${V1}`, 'following:'])
})

test('following · going to another view while following says nothing is followed; the call stays', async ({ page }) => {
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect.poll(() => asked(page)).toContain(`following:${V1}`)
  const nav = page.getByRole('navigation', { name: 'Project views' })
  await nav.getByRole('link', { name: 'Knowledge' }).click()
  await expect.poll(async () => (await asked(page)).at(-1)).toBe('following:')
  expect(await asked(page)).not.toContain('leave')
})

test('following · a rejoin is another call: nothing is followed in it until Follow, which the new connection hears', async ({
  page,
}) => {
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect.poll(() => asked(page)).toContain(`following:${V1}`)
  await page.getByRole('button', { name: 'Leave the room' }).first().click()
  await page.keyboard.press('Escape') // the recap goes
  await page.getByRole('button', { name: 'Join the room' }).first().click()
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  // What the last call followed stays with it (Codex on #130): the report is offered, not presented, and not said.
  const follow = card(page).getByRole('button', { name: 'Follow' })
  await expect(follow).toBeVisible()
  await expect(presented(page)).toHaveCount(0)
  expect((await asked(page)).filter((a) => a === `following:${V1}`)).toHaveLength(1)
  await follow.click()
  await expect(presented(page)).toBeVisible()
  await expect.poll(async () => (await asked(page)).filter((a) => a === `following:${V1}`).length).toBe(2)
})

test('following · leaving the project for home, the call still on, says nothing is followed; back, it says it again', async ({
  page,
}) => {
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect.poll(() => asked(page)).toContain(`following:${V1}`)
  await page.evaluate(() => window.fixture?.away())
  await expect.poll(async () => (await asked(page)).at(-1)).toBe('following:')
  await page.evaluate(() => window.fixture?.back())
  await expect.poll(async () => (await asked(page)).at(-1)).toBe(`following:${V1}`)
})

test('following · back from another view, what was followed is followed again', async ({ page }) => {
  await page.evaluate(() => window.fixture?.show(1))
  await card(page).getByRole('button', { name: 'Follow' }).click()
  await expect.poll(() => asked(page)).toContain(`following:${V1}`)
  const nav = page.getByRole('navigation', { name: 'Project views' })
  await nav.getByRole('link', { name: 'Knowledge' }).click()
  await expect.poll(async () => (await asked(page)).at(-1)).toBe('following:')
  await nav.getByRole('link', { name: 'Studio' }).click()
  await expect(presented(page)).toBeVisible()
  await expect.poll(async () => (await asked(page)).at(-1)).toBe(`following:${V1}`)
})
