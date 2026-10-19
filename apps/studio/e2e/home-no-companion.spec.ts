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

test('home · on a narrow phone the reason and its note take two rows inside the line’s 46 px: nothing below moves (Codex P2 on #460)', async ({
  page,
}) => {
  // 320 px, the narrowest phone. «Sophia can’t answer here yet · Write a note» is 287 px in Geist, so with the gutters
  // one row needs 319: 304 px stands for a 320 px window with a scrollbar beside Home, or a fallback font a few px
  // wider, where the note takes a second row.
  for (const width of [320, 304]) {
    await page.setViewportSize({ width, height: 800 })
    const shown = await projectsAt(page, '')
    const cannot = await projectsAt(page, '?companion=unavailable')
    const off = await page.locator('.hw-off').evaluate((el) => {
      const words = el.querySelector('span')?.getBoundingClientRect()
      const note = el.querySelector('button')?.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return {
        height: Math.round(box.height),
        twoRows: !!words && !!note && note.top >= words.bottom,
        noteInside: !!note && note.bottom <= box.bottom + 0.5,
      }
    })
    const held = await projectsAt(page, '?companion=reading')
    expect({ width, height: off.height, noteInside: off.noteInside }).toEqual({ width, height: 46, noteInside: true })
    if (width === 304) expect(off.twoRows).toBe(true)
    expect({ width, cannot: Math.abs(cannot - shown) <= 1, held: Math.abs(held - shown) <= 1 }).toEqual({
      width,
      cannot: true,
      held: true,
    })
  }
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
