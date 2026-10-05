import { expect, test, type Page } from '@playwright/test'

// The room's fixture shows what its fake LiveKit couldn't (docs/plans/room-fixture-people.md): other people, who
// holds the floor and who speaks, Sophia's states, a blocked sound, the gallery and a shared screen. Every name and
// stream is synthetic, and the page says it is a fixture.

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const line = (page: Page) => page.locator('.sophia-line .line-text')
const people = (page: Page) => page.getByRole('list', { name: 'In the room' }).getByRole('listitem')
const light = (page: Page) => page.locator('.light')
const unexpected = (page: Page) => page.evaluate(() => [...(window.fixture?.unexpected ?? [])])

/** Opens the room in the call, with what the query string asks. */
async function enter(page: Page, query: string) {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await unexpected(page)).toEqual([])
})

test('people · two others around the light, one of them holding the floor', async ({ page }) => {
  await enter(page, 'people=2&floor=1')
  await expect(people(page)).toHaveCount(3)
  await expect(people(page).filter({ hasText: 'Marco' })).toContainText('has the floor')
  await expect(people(page).filter({ hasText: 'Lucía' })).toBeVisible()
  await expect(line(page)).toHaveText('Marco has the floor')
})

test('people · the floor passed on through the API: it moves, asked once', async ({ page }) => {
  await enter(page, 'people=2&floor=me')
  await page.getByRole('button', { name: 'Pass to…' }).click()
  await page.getByRole('menuitem', { name: 'Lucía' }).click()
  await expect(people(page).filter({ hasText: 'Lucía' })).toContainText('has the floor')
  expect(await page.evaluate(() => window.fixture?.floorTo)).toEqual(['Lucía'])
})

test('people · a pass made against a room that moved meanwhile is refused, said, and moves nothing', async ({
  page,
}) => {
  await enter(page, 'people=2&floor=me')
  await page.evaluate(() => window.fixture?.moveRoom())
  await page.getByRole('button', { name: 'Pass to…' }).click()
  await page.getByRole('menuitem', { name: 'Lucía' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'The floor changed meanwhile. Try again.' })).toBeVisible()
  expect(await page.evaluate(() => window.fixture?.floorTo)).toEqual([])
})

test('people · a holder who left: the line says so', async ({ page }) => {
  await enter(page, 'people=1&floor=absent')
  await expect(line(page)).toContainText('has the floor but isn’t here')
})

test('sophia · listening to the one who holds the floor, and the light listens', async ({ page }) => {
  await enter(page, 'people=1&floor=1&sophia=listening')
  await expect(line(page)).toHaveText('Sophia is listening to Marco')
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
})

test('sophia · speaking: Stop speaking is offered, and the light speaks', async ({ page }) => {
  await enter(page, 'sophia=speaking')
  await expect(line(page)).toHaveText('Sophia is speaking')
  await expect(page.getByRole('button', { name: 'Stop speaking' })).toBeVisible()
  await expect(light(page)).toHaveAttribute('data-mode', 'speak')
})

test('sophia · her sound blocked by the browser: Allow audio, pressed, lets it through', async ({ page }) => {
  await enter(page, 'sophia=blocked')
  await expect(line(page)).toHaveText('Sophia is speaking, but this browser blocked the sound')
  await page.getByRole('button', { name: 'Allow audio' }).click()
  await expect(line(page)).toHaveText('Sophia is speaking')
  await expect(page.getByRole('button', { name: 'Allow audio' })).toHaveCount(0)
})

test('sophia · her voice unavailable: said', async ({ page }) => {
  await enter(page, 'sophia=here&voice=unavailable')
  await expect(line(page)).toHaveText('Sophia’s voice is unavailable')
})

test('sophia · paused for a guest: said', async ({ page }) => {
  await enter(page, 'sophia=here&paused=guest')
  await expect(line(page)).toHaveText('Sophia is paused while a guest is here')
})

test('sophia · a pause the API never gives (`paused=later`) changes nothing: she listens', async ({ page }) => {
  await enter(page, 'people=1&floor=1&sophia=listening&paused=later')
  await expect(line(page)).toHaveText('Sophia is listening to Marco')
})

test('sophia · paused because the holder left: an admin takes the floor and the pause is over', async ({ page }) => {
  await enter(page, 'people=1&sophia=here&paused=holder_left')
  await expect(line(page)).toContainText('was not in the room')
  await page.getByRole('button', { name: 'Take the floor' }).click()
  await expect(line(page)).toHaveText('Sophia is listening to you')
})

test('sophia · she leaves the room: her line no longer says she is here', async ({ page }) => {
  await enter(page, 'people=1&floor=1&sophia=listening')
  await expect(line(page)).toHaveText('Sophia is listening to Marco')
  await page.evaluate(() => window.fixture?.sophiaLeaves())
  await expect(line(page)).toHaveText('Sophia is joining…')
})

test('sophia · her state changes while the page is open', async ({ page }) => {
  await enter(page, 'people=1&floor=me&sophia=listening')
  await expect(line(page)).toHaveText('Sophia is listening to you')
  await page.evaluate(() => window.fixture?.sophia('answering'))
  await expect(line(page)).toHaveText('Sophia is answering…')
  await page.evaluate(() => window.fixture?.sophia('speaking'))
  await expect(line(page)).toHaveText('Sophia is speaking')
})

test('people · who speaks shows on their presence, and moves while the page is open', async ({ page }) => {
  await enter(page, 'people=2&speaking=1')
  const marco = page.locator('.presence', { hasText: 'Marco' })
  const lucia = page.locator('.presence', { hasText: 'Lucía' })
  await expect(marco).toHaveAttribute('data-speaking')
  await page.evaluate(() => window.fixture?.speaking(2))
  await expect(lucia).toHaveAttribute('data-speaking')
  await expect(marco).not.toHaveAttribute('data-speaking')
  await page.evaluate(() => window.fixture?.speaking(0))
  await expect(page.locator('.presence', { hasText: 'you' })).toHaveAttribute('data-speaking')
  await expect(lucia).not.toHaveAttribute('data-speaking')
})

test('video · cameras on: the gallery, a tile for each person and one for Sophia', async ({ page }) => {
  await enter(page, 'people=2&video=camera')
  const gallery = page.locator('.gallery')
  await expect(gallery.locator('.tile')).toHaveCount(4)
  await expect(gallery.locator('.tile video')).toHaveCount(2)
})

test('video · a shared screen Sophia sees: the present layout, said', async ({ page }) => {
  await enter(page, 'people=2&video=screen&sophia=listening&floor=1&looking=screen')
  await expect(page.locator('.present .screen-main video')).toBeVisible()
  await expect(page.getByText('Sophia sees Marco’s screen').first()).toBeVisible()
})

test('video · no one to share a screen: Sophia is never said to see one', async ({ page }) => {
  await enter(page, 'sophia=here&video=screen&looking=screen')
  await expect(line(page)).toHaveText('Sophia is here, not listening yet')
  await expect(page.getByText(/Sophia sees/)).toHaveCount(0)
})

test('@phone · the gallery fits a phone: nothing runs off the side', async ({ page }) => {
  await enter(page, 'people=3&video=camera')
  await expect(page.locator('.gallery .tile')).toHaveCount(5)
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(sideways).toBe(0)
})
