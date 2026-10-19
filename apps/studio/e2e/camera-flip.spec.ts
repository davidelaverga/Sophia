import type { ChatCaption } from '@sophia/contracts/room-chat'
import { expect, test, type Locator, type Page } from '@playwright/test'

// Switch camera on a phone, in a call (docs/plans/camera-flip.md): your own tile offers the next camera, round, once your
// camera is on and there are two; on a computer, Video settings chooses. The fixture's two cameras stand in for a
// phone's front and back.

const ME = '00000000-0000-4000-8000-0000000000a1'
const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const myTile = (page: Page) => page.locator(`.tile[data-actor="${ME}"]`)
const flip = (page: Page) => myTile(page).getByRole('button', { name: 'Switch camera' })
/** On a phone's strip, with both of your tile's presses: the one press that holds them, and its menu. */
const yourTile = (page: Page) => myTile(page).getByRole('button', { name: 'Your tile', exact: true })
const tileMenu = (page: Page) => page.getByRole('menu', { name: 'Your tile' })
const cameraOn = (page: Page) => dock(page).getByRole('button', { name: 'Camera', exact: true }).click()
const switches = (page: Page) =>
  page.evaluate(() => [...(window.fixture?.asked ?? [])].filter((a) => a.startsWith('device:videoinput:')))

const enter = (page: Page, query = 'people=2') => page.goto(`/room.html?call=on&${query}`)

type Box = { x: number; y: number; width: number; height: number }
/** Whether two boxes share no point. */
const apart = (a: Box, b: Box) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
/** How far down the page a box starts. */
const top = async (el: Locator) => (await el.boundingBox())?.y ?? Number.NaN
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

/** Whether a press at each item's middle reaches the item itself: nothing clips it, covers it or leaves it off screen. */
const reached = (menu: Locator) =>
  menu.getByRole('menuitem').evaluateAll((items) =>
    items.map((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return hit !== null && (hit === el || el.contains(hit))
    }),
  )

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

test('flip · on a computer, beside a shown screen, your tile keeps Hide my tile, no menu', async ({ page }) => {
  await enter(page, 'people=2&video=screen')
  await cameraOn(page)
  await expect(myTile(page)).toBeVisible()
  const presses = myTile(page).getByRole('button')
  await expect(presses).toHaveCount(1)
  await expect(presses).toHaveAccessibleName('Hide my tile')
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
  // Both presses fit a gallery's tile: no menu holds them there.
  await expect(myTile(page).getByRole('button')).toHaveCount(2)
  await expect(yourTile(page)).toHaveCount(0)
  await atRest(page)
  const f = await flip(page).boundingBox()
  const h = await myTile(page).getByRole('button', { name: 'Hide my tile' }).boundingBox()
  expect([Math.round(f?.width ?? 0), Math.round(f?.height ?? 0)]).toEqual([40, 40])
  expect(f !== null && h !== null && apart(f, h)).toBe(true)
})

// A tile a fifth of a phone (51 to 65 px) holds one finger-sized press, not two side by side (Codex P2 on #422). With
// your camera off only Hide my tile applies: the press is it, no menu.
test('@phone · flip · beside a shown screen with your camera off, your tile’s one press is Hide my tile, no menu', async ({
  page,
}) => {
  await enter(page, 'people=2&video=screen')
  const presses = myTile(page).getByRole('button')
  await expect(presses).toHaveCount(1)
  await expect(presses).toHaveAccessibleName('Hide my tile')
  await expect(presses).not.toHaveAttribute('aria-haspopup')
  await presses.click()
  await expect(page.locator('.tile-hidden-self')).toContainText('Your tile is hidden')
})

// With your camera on and two cameras both apply: the one press opens them as a menu, over the tile's clip and the
// strip's edge (Luis 2026-10-18, «Procede con tu recomendación de una pulsacion»).
for (const width of [390, 320]) {
  const px = `${String(width)} px`
  const onStrip = async (page: Page) => {
    await page.setViewportSize({ width, height: 844 })
    await enter(page, 'people=2&video=screen')
    await cameraOn(page)
    await expect(yourTile(page)).toBeVisible()
  }

  test(`@phone · flip · beside a shown screen, your tile’s one press opens Switch camera and Hide my tile; Switch camera switches (${px})`, async ({
    page,
  }) => {
    await onStrip(page)
    await expect(myTile(page).getByRole('button')).toHaveCount(1)
    await expect(yourTile(page)).toHaveAttribute('aria-haspopup', 'menu')
    await expect(yourTile(page)).toHaveAttribute('aria-expanded', 'false')
    await yourTile(page).click()
    await expect(yourTile(page)).toHaveAttribute('aria-expanded', 'true')
    const items = tileMenu(page).getByRole('menuitem')
    await expect(items).toHaveText(['Switch camera', 'Hide my tile'])
    await expect(items.first()).toBeFocused()
    await expect
      .poll(() => reached(tileMenu(page)), 'each item is what a press at its middle reaches')
      .toEqual([true, true])
    await items.first().click()
    await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk'])
    await expect(tileMenu(page)).toHaveCount(0)
    await expect(yourTile(page)).toBeFocused()
  })

  test(`@phone · flip · beside a shown screen, Hide my tile from your tile’s menu hides it (${px})`, async ({
    page,
  }) => {
    await onStrip(page)
    await yourTile(page).click()
    await tileMenu(page).getByRole('menuitem', { name: 'Hide my tile' }).click()
    const hidden = page.locator('.tile-hidden-self')
    await expect(hidden).toContainText('Your tile is hidden')
    await expect(hidden.getByRole('button', { name: 'Show' })).toBeFocused()
    await expect(myTile(page)).toHaveCount(0)
  })

  test(`@phone · flip · beside a shown screen, Escape closes your tile’s menu and gives the focus back; a press outside closes it (${px})`, async ({
    page,
  }) => {
    await onStrip(page)
    await yourTile(page).click()
    await expect(tileMenu(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tileMenu(page)).toHaveCount(0)
    await expect(yourTile(page)).toBeFocused()
    await expect(yourTile(page)).toHaveAttribute('aria-expanded', 'false')
    await yourTile(page).click()
    await expect(tileMenu(page)).toBeVisible()
    await page.locator('.present .screen-main').click({ position: { x: 8, y: 8 } })
    await expect(tileMenu(page)).toHaveCount(0)
    // Closed, nothing chosen.
    await expect(myTile(page)).toBeVisible()
    expect(await switches(page)).toEqual([])
  })
}

// The strip moves without a scroll or a resize: captions lift it while someone speaks (room-stage-captions.md), and the
// menu goes with its press, 6 px over it (the kit's menu offset), never over the press itself (a review's P2 on this
// branch).
test('@phone · flip · beside a shown screen, your tile’s menu stays over its press as captions lift the strip', async ({
  page,
}) => {
  const words = {
    kind: 'caption',
    id: '00000000-0000-4000-8000-0000000000c1',
    exchangeId: '00000000-0000-4000-8000-0000000000ae',
    speaker: 'member',
    actorId: '00000000-0000-4000-8000-0000000000b1',
    sequence: 1,
    state: 'partial',
    text: 'Words while your tile’s menu is open',
  } satisfies ChatCaption
  /** From the menu's bottom to the press's top. */
  const gap = async () => {
    const menu = await tileMenu(page).boundingBox()
    return menu ? (await top(yourTile(page))) - (menu.y + menu.height) : Number.NaN
  }
  await enter(page, 'people=2&video=screen')
  await cameraOn(page)
  await yourTile(page).click()
  await expect(tileMenu(page)).toBeVisible()
  await expect.poll(gap).toBeCloseTo(6, 0)
  const before = await top(yourTile(page))
  await page.evaluate((packet) => window.fixture?.caption(packet), words)
  await expect(page.locator('.stage-captions .stage-caption')).toHaveCount(1)
  await expect.poll(() => top(yourTile(page)), 'the strip goes up with the captions').toBeLessThan(before - 12)
  await expect.poll(gap, 'the menu with it').toBeCloseTo(6, 0)
  await expect
    .poll(() => reached(tileMenu(page)), 'each item is what a press at its middle reaches')
    .toEqual([true, true])
})

// Safari before 17 has no top layer for the menu (the Popover API), and the build targets Safari 16.4 (shortcuts.ts):
// there the press stays Switch camera, as before the menu, and the call stays (a review's P1 on this branch). WebKit 16
// stood in for: no showPopover.
test('@phone · flip · without the Popover API (Safari before 17), beside a shown screen your tile’s one press switches the camera, and the call stays', async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const name of ['showPopover', 'hidePopover', 'togglePopover']) {
      Reflect.deleteProperty(HTMLElement.prototype, name)
    }
  })
  await enter(page, 'people=2&video=screen')
  const press = myTile(page).getByRole('button')
  await expect(press).toHaveAccessibleName('Hide my tile')
  await cameraOn(page)
  // Your camera on and its cameras listed: the press is no longer Hide my tile.
  await expect(press).not.toHaveAccessibleName('Hide my tile')
  await expect(press).toHaveCount(1)
  await press.click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk'])
  await expect(dock(page)).toBeVisible()
  await expect(press).toHaveAccessibleName('Switch camera')
  await expect(press).not.toHaveAttribute('aria-haspopup')
})

// On a phone's strip the mute is the tile's corner mark, at its top-left (muted-on-tiles.md); the press keeps clear of
// it, a finger's size still (Codex P2 on #430).
for (const width of [390, 320]) {
  test(`@phone · flip · beside a shown screen, muted, the mark is clear of your tile’s press, a finger’s size (${String(width)} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await enter(page, 'people=2&video=screen')
    await cameraOn(page)
    await dock(page).getByRole('button', { name: 'Microphone', exact: true }).click()
    const mark = myTile(page).locator('.tile-muted-corner')
    await expect(mark).toBeVisible()
    await expect(yourTile(page)).toBeVisible()
    await atRest(page)
    const m = await mark.boundingBox()
    const f = await yourTile(page).boundingBox()
    expect(m !== null && f !== null && apart(m, f), 'the mark clear of the press drawn').toBe(true)
    const t = await target(yourTile(page))
    expect(t.width, 'its target across').toBeGreaterThanOrEqual(40)
    expect(t.height, 'its target down').toBeGreaterThanOrEqual(40)
  })
}

// Past the strip's tiles yours can go into «+N»: the floor, the one showing and whoever speaks keep a tile before you
// (tile-view.ts). «In the call» switches your camera then (Codex P2 on #422).
test('@phone · flip · your tile in «+N»: «In the call» switches your camera', async ({ page }) => {
  await enter(page, 'people=9&video=screen&screenBy=8&floor=9')
  await cameraOn(page)
  await page.evaluate(() => window.fixture?.speaking(2))
  await expect(myTile(page)).toHaveCount(0)
  await page.getByRole('button', { name: /^\+\d+ more in the call$/ }).click()
  const me = page.getByRole('dialog', { name: 'In the call' }).getByRole('listitem').filter({ hasText: 'you' })
  await me.getByRole('button', { name: 'Switch camera' }).click()
  await expect.poll(() => switches(page)).toEqual(['device:videoinput:cam-desk'])
})
