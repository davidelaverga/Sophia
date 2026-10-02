import { expect, test, type Page } from '@playwright/test'

// LFE-03.1's direction checks: the real DirectionGallery on the labelled simulated fixture page (fixtures/explore.html).
// A request to any other origin is aborted; what the page asked its two ports (read bytes, choose) is read back.

const PAGE = '/explore.html'
const B = '00000000-0000-4000-8000-000000000311' // the OpenAI candidate
const B_ASSET = '00000000-0000-4000-8000-000000000331'

/** What the page asked, beyond reading bytes: the choices, in order. */
const choices = (page: Page) => page.evaluate(() => (window.explore?.asked ?? []).filter((a) => !a.startsWith('read:')))
const tile = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^Candidate ${n},`) })
const choose = (page: Page) => page.getByRole('button', { name: 'Choose this one' })
const back = (page: Page) => page.getByRole('button', { name: 'Back to the direction' })
/** The tag the open candidate wears once it is the chosen one. */
const chosen = (page: Page) => page.getByRole('region', { name: /^Candidate \d/ }).getByText('Chosen', { exact: true })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('IMG-01 · choosing one of two images keeps both and asks for that choice only', async ({ page }) => {
  await page.goto(PAGE)
  await expect(page.getByRole('img', { name: 'Candidate 2, from OpenAI' })).toBeVisible()
  await tile(page, 2).click()
  await choose(page).click()
  await expect(chosen(page)).toBeVisible()
  await expect(choose(page)).toHaveCount(0) // chosen once: nothing to press again
  expect(await choices(page)).toEqual([`choose:${B}@1`])

  await back(page).click()
  await expect(page.getByRole('listitem')).toHaveCount(4) // every alternative is still there
  await expect(tile(page, 2)).toHaveAccessibleName('Candidate 2, OpenAI, Ready, chosen')
  await expect(page.getByRole('img', { name: 'Candidate 1, from Google' })).toBeVisible()
})

test('IMG-02 · a refused request says so in words, and the other image stays usable', async ({ page }) => {
  await page.goto(PAGE)
  await expect(tile(page, 3)).toHaveAccessibleName('Candidate 3, Google Pro, Refused')
  await expect(tile(page, 3).getByText('The provider declined this brief.')).toBeVisible()
  await expect(tile(page, 4)).toHaveAccessibleName('Candidate 4, OpenAI Flare, Outcome unknown')
  await expect(tile(page, 4).getByRole('img')).toHaveCount(0) // no stand-in picture
  await tile(page, 3).click()
  await expect(page.getByText('Only a ready image can be chosen.')).toBeVisible()
  await expect(choose(page)).toHaveCount(0)
  await back(page).click()
  await tile(page, 2).click()
  await expect(choose(page)).toBeEnabled()
})

test('an image whose bytes don’t match its record is not drawn, and can’t be chosen', async ({ page }) => {
  await page.goto(`${PAGE}?tamper=${B_ASSET}`)
  await expect(tile(page, 2).getByText('This image doesn’t match its record, so it isn’t shown.')).toBeVisible()
  await expect(tile(page, 2).getByRole('img')).toHaveCount(0)
  await tile(page, 2).click()
  await expect(page.getByText('Only an image that matches its record can be chosen.')).toBeVisible()
  await expect(choose(page)).toHaveCount(0)
  expect(await choices(page)).toEqual([])
})

test('a viewer sees every candidate and who chooses, with no button that can’t act', async ({ page }) => {
  await page.goto(`${PAGE}?role=viewer`)
  await tile(page, 1).click()
  await expect(page.getByRole('img', { name: 'Candidate 1, from Google' })).toBeVisible()
  await expect(page.getByText('Editors and admins choose.')).toBeVisible()
  await expect(choose(page)).toHaveCount(0)
})

test('IMG-04 · the keyboard alone moves, opens, chooses and comes back to the same tile', async ({ page }) => {
  await page.goto(PAGE)
  await page.keyboard.press('Tab')
  await expect(tile(page, 1)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tile(page, 2)).toBeFocused()
  await page.keyboard.press('End')
  await expect(tile(page, 4)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(tile(page, 2)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(back(page)).toBeFocused()
  await expect(choose(page)).toBeVisible() // offered once the image matched its record
  await page.keyboard.press('Tab')
  await expect(choose(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(chosen(page)).toBeVisible()
  await expect(back(page)).toBeFocused() // the button went: the focus didn't fall to the page
  await page.keyboard.press('Escape')
  await expect(tile(page, 2)).toBeFocused()
  expect(await choices(page)).toEqual([`choose:${B}@1`])
})

test('IMG-04 @phone · every choice and its facts are reachable by touch, without hover', async ({ page }) => {
  await page.goto(PAGE)
  const tiles = page.getByRole('listitem')
  await expect(tiles).toHaveCount(4)
  const [first, second] = [await tiles.nth(0).boundingBox(), await tiles.nth(1).boundingBox()]
  expect(second?.y, 'two side by side, to compare').toBe(first?.y)
  await expect(tiles.nth(1)).toBeInViewport()
  await tile(page, 2).tap()
  await expect(back(page)).toBeInViewport()
  await expect(choose(page)).toBeInViewport()
  await expect(page.getByText('e6740bffe898e68ad277660121d1efa4925ebd66cba5ad84419be88dcd114811')).toBeVisible() // the whole digest, in words on the page
  await choose(page).tap()
  await expect(chosen(page)).toBeVisible()
  await back(page).tap()
  await expect(tile(page, 2)).toHaveAccessibleName('Candidate 2, OpenAI, Ready, chosen')
})

test('each image is read once, and only when its tile comes near the screen', async ({ page }) => {
  await page.goto(`${PAGE}?many=1`)
  const reads = async () =>
    (await page.evaluate(() => window.explore?.asked ?? [])).filter((a) => a.startsWith('read:'))
  await expect(page.getByRole('img', { name: 'Candidate 1, from Google' })).toBeVisible()
  const first = await reads()
  expect(first.length, 'tiles far below the screen are not read yet').toBeLessThan(24)

  const last = tile(page, 24)
  await last.scrollIntoViewIfNeeded()
  await expect(last.getByRole('img')).toBeVisible()
  await last.click()
  await expect(page.getByRole('region', { name: /^Candidate 24/ }).getByRole('img')).toBeVisible()
  const all = await reads()
  expect(new Set(all).size, 'no image read twice, up close included').toBe(all.length)
  expect(all).toContain('read:00000000-0000-4000-8000-000000000363')
})

test('while one choice is being saved, no other can be made, even after going back', async ({ page }) => {
  await page.goto(`${PAGE}?slow=1`)
  await tile(page, 2).click()
  await choose(page).click()
  await expect(page.getByRole('button', { name: 'Choosing…' })).toBeDisabled()
  await back(page).click()
  await tile(page, 1).click()
  await expect(page.getByText('Another choice is being saved first.')).toBeVisible()
  await expect(choose(page)).toHaveCount(0)

  await page.evaluate(() => window.explore?.settle())
  await expect(choose(page)).toBeVisible() // saved: candidate 1 may be chosen now, on the new revision
  expect(await choices(page)).toEqual([`choose:${B}@1`])
  await back(page).click()
  await expect(tile(page, 2)).toHaveAccessibleName('Candidate 2, OpenAI, Ready, chosen')
})

test('an image the network failed to read can be tried again, and is then usable', async ({ page }) => {
  await page.goto(`${PAGE}?flaky=${B_ASSET}`)
  await expect(tile(page, 2).getByText('This image couldn’t be read.')).toBeVisible()
  await tile(page, 2).click() // read again up close, and the network fails once more
  const detail = page.getByRole('region', { name: /^Candidate 2/ })
  await expect(detail.getByText('This image couldn’t be read.')).toBeVisible()
  await page.evaluate(() => window.explore?.heal()) // the network is back
  await detail.getByRole('button', { name: 'Try again' }).click()
  await expect(detail.getByRole('img', { name: 'Candidate 2, from OpenAI' })).toBeVisible()
  await expect(choose(page)).toBeVisible()
  await back(page).click()
  await expect(tile(page, 2).getByRole('img')).toBeVisible() // the tile shows it too
})

test('a tile whose read failed shows the image once it was read up close', async ({ page }) => {
  await page.goto(`${PAGE}?flaky=${B_ASSET}`)
  await expect(tile(page, 2).getByText('This image couldn’t be read.')).toBeVisible()
  await page.evaluate(() => window.explore?.heal()) // the network is back before anyone tries again
  await tile(page, 2).click()
  const detail = page.getByRole('region', { name: /^Candidate 2/ })
  await expect(detail.getByRole('img', { name: 'Candidate 2, from OpenAI' })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Try again' })).toHaveCount(0) // nothing to try again up close
  await back(page).click()
  await expect(tile(page, 2).getByRole('img')).toBeVisible() // the tile isn't left saying it couldn't be read
})
