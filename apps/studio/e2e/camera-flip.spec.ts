import { expect, test, type Locator, type Page } from '@playwright/test'

// Switch camera on a phone, in a call (docs/plans/camera-flip.md): your own tile offers the next camera, round, once your
// camera is on and there are two; on a computer, Video settings chooses. The fixture's two cameras stand in for a
// phone's front and back.

const ME = '00000000-0000-4000-8000-0000000000a1'
const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const myTile = (page: Page) => page.locator(`.tile[data-actor="${ME}"]`)
const flip = (page: Page) => myTile(page).getByRole('button', { name: 'Switch camera' })
const cameraOn = (page: Page) => dock(page).getByRole('button', { name: 'Camera', exact: true }).click()
const switches = (page: Page) =>
  page.evaluate(() => [...(window.fixture?.asked ?? [])].filter((a) => a.startsWith('device:videoinput:')))

const enter = (page: Page, query = 'people=2') => page.goto(`/room.html?call=on&${query}`)

type Box = { x: number; y: number; width: number; height: number }
/** Whether two boxes share no point. */
const apart = (a: Box, b: Box) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
/** Once your tile has arrived (its arrival moves it 3 px), so boxes are read at rest. */
const atRest = (page: Page) =>
  myTile(page).evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  )

/**
 * A press's touch target as the browser hit-tests it, past what it draws: how far from its middle a press still lands
 * on it, across and down, in quarter pixels.
 */
const target = (press: Locator) =>
  press.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2]
    const lands = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)
      return hit !== null && (hit === el || el.contains(hit))
    }
    const reach = (at: (d: number) => [number, number]) => {
      let d = 0
      while (d < 80 && lands(...at(d + 0.25))) d += 0.25
      return d
    }
    return {
      width: Math.round(reach((d) => [cx - d, cy]) + reach((d) => [cx + d, cy])),
      height: Math.round(reach((d) => [cx, cy - d]) + reach((d) => [cx, cy + d])),
    }
  })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('@phone · flip · with the camera on, your tile switches to the next camera, then back', async ({ page }) => {
  await enter(page)
  await expect(flip(page)).toHaveCount(0)
  await cameraOn(page)
  await expect(flip(page)).toBeVisible()
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk'])
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk', 'device:videoinput:cam-built-in'])
})

test('flip · on a computer Video settings chooses: your tile has no Switch camera', async ({ page }) => {
  await enter(page)
  await cameraOn(page)
  await expect(myTile(page)).toBeVisible()
  await expect(flip(page)).toBeHidden()
})

// The switch follows the camera the call is on, not the choice kept for the next call (Codex P2 on #422).
test('@phone · flip · where nothing can be kept on this device, it still goes to the next camera, then back', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
  })
  await enter(page)
  await cameraOn(page)
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk'])
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk', 'device:videoinput:cam-built-in'])
})

test('@phone · flip · a switch the browser refuses leaves the call where it was: the next press asks again', async ({
  page,
}) => {
  await enter(page, 'people=2&refuse=switch')
  await cameraOn(page)
  await flip(page).click()
  // Answered (refused) before the next press.
  await expect(page.locator('.dock-note')).toHaveText('Couldn’t switch to that camera. Another app may be using it.')
  await flip(page).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk', 'device:videoinput:cam-desk'])
})

// A finger's width as well as its height on a touch screen (Codex P2 on #422). The narrowest gallery a phone lays out,
// three across at 320 px (91 px tiles), still keeps Hide my tile clear of it.
test('@phone · flip · in the gallery Switch camera is a 40 px square, clear of Hide my tile (320 px, three across)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await enter(page, 'people=5')
  await cameraOn(page)
  await expect(page.getByRole('list', { name: 'In the room' })).toHaveAttribute('data-count', '7')
  await expect(flip(page)).toBeVisible()
  await atRest(page)
  const f = await flip(page).boundingBox()
  const h = await myTile(page).getByRole('button', { name: 'Hide my tile' }).boundingBox()
  expect([Math.round(f?.width ?? 0), Math.round(f?.height ?? 0)]).toEqual([40, 40])
  expect(f !== null && h !== null && apart(f, h)).toBe(true)
})

// A tile a fifth of a phone (51 to 65 px) holds one finger-sized press, not two side by side (Codex P2 on #422):
// Switch camera while it is there, Hide my tile otherwise.
test('@phone · flip · beside a shown screen your tile keeps one press: Switch camera, Hide my tile with the camera off', async ({
  page,
}) => {
  await enter(page, 'people=2&video=screen')
  const presses = myTile(page).getByRole('button')
  await expect(presses).toHaveCount(1)
  await expect(presses).toHaveAccessibleName('Hide my tile')
  await cameraOn(page)
  await expect(flip(page)).toBeVisible()
  await expect(presses).toHaveCount(1)
  await expect(presses).toHaveAccessibleName('Switch camera')
})

// On a phone's strip the mute is the tile's corner mark, at its top-left (muted-on-tiles.md); the press keeps clear of
// it, a finger's size still (Codex P2 on #430).
for (const width of [390, 320]) {
  test(`@phone · flip · beside a shown screen, muted, the mark is clear of Switch camera, a finger’s size (${String(width)} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await enter(page, 'people=2&video=screen')
    await cameraOn(page)
    await dock(page).getByRole('button', { name: 'Microphone', exact: true }).click()
    const mark = myTile(page).locator('.tile-muted-corner')
    await expect(mark).toBeVisible()
    await expect(flip(page)).toBeVisible()
    await atRest(page)
    const m = await mark.boundingBox()
    const f = await flip(page).boundingBox()
    expect(m !== null && f !== null && apart(m, f), 'the mark clear of the press drawn').toBe(true)
    const t = await target(flip(page))
    expect(t.width, 'its target across').toBeGreaterThanOrEqual(40)
    expect(t.height, 'its target down').toBeGreaterThanOrEqual(40)
  })
}
