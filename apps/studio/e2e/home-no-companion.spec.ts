// Home where Sophia can't answer (docs/plans/home-no-companion.md): the API says so (`companion: 'unavailable'`), so
// Home offers no line to her, says she can't answer here yet and offers a note instead, in the line's own place;
// while that is unknown the place is held. Her first words in Personal ask nothing then. Every name is synthetic.
import { expect, test, type Page } from '@playwright/test'

const line = (page: Page) => page.getByRole('textbox', { name: 'Say something to Sophia' })
const pressed = (page: Page) => page.evaluate(() => window.homeFixture?.pressed ?? [])

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  // Boxes read where they rest: the page's entrances rise a few pixels.
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

/** Where the Projects label stands. */
const projectsAt = async (page: Page, query: string) => {
  await page.goto(`/home.html${query}`)
  const label = page.locator('#hw-work-h')
  await expect(label).toBeVisible()
  return (await label.boundingBox())?.y ?? Number.NaN
}

test('home · where Sophia can’t answer: no line, the reason and a note instead, in the line’s place', async ({
  page,
}) => {
  await page.goto('/home.html?companion=unavailable')
  await expect(page.locator('.hw-off')).toBeVisible()
  await expect(line(page)).toHaveCount(0)
  await expect(page.locator('.hw-mic')).toHaveCount(0)
  await expect(page.locator('.hw-off')).toHaveText(/^Sophia can’t answer here yet/)
  const box = await page.locator('.hw-off').boundingBox()
  expect(Math.abs((box?.height ?? 0) - 46)).toBeLessThanOrEqual(1)
  await page.locator('.hw-off').getByRole('button', { name: 'Write a note' }).click()
  expect(await pressed(page)).toEqual(['notes'])
})

test('home · the line’s place is held while it is unknown whether she answers: nothing below moves', async ({
  page,
}) => {
  const shown = await projectsAt(page, '')
  await expect(line(page)).toBeVisible()
  const cannot = await projectsAt(page, '?companion=unavailable')
  const held = await projectsAt(page, '?companion=reading')
  await expect(line(page)).toHaveCount(0)
  await expect(page.locator('.hw-off')).toHaveCount(0)
  expect(Math.abs(cannot - shown)).toBeLessThanOrEqual(1)
  expect(Math.abs(held - shown)).toBeLessThanOrEqual(1)
})

test('home · with no projects where she can’t answer, she doesn’t offer to talk', async ({ page }) => {
  await page.goto('/home.html?companion=unavailable&projects=none')
  await expect(page.locator('.hw-says')).toHaveText('Start a project when you’re ready.')
  await page.goto('/home.html?projects=none')
  await expect(page.locator('.hw-says')).toHaveText('Start a project when you’re ready, or just talk to me.')
})

test('personal · where she can’t answer, her first words ask nothing', async ({ page }) => {
  await page.goto('/personal.html?talk=new&unavailable=1')
  const first = page.locator('.msgs .msg.sophia').first()
  await expect(first).toContainText('This space is just for you')
  await expect(first).not.toContainText('?')
  await page.goto('/personal.html?talk=new')
  await expect(page.locator('.msgs .msg.sophia').first()).toContainText('What’s on your mind?')
})
