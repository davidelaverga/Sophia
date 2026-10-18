import { expect, test, type Page } from '@playwright/test'

// The call's devices (docs/plans/call-devices.md): beside the microphone and the camera, a narrow opener lists
// the microphones, speakers and cameras, the one in use marked; a choice switches the call at once and is kept for
// the next one. The fake LiveKit lists two of each (fake-livekit.ts). Every name and stream is synthetic.

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])
const menu = (page: Page, name: string) => page.getByRole('menu', { name })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('devices · in a call, the audio opener lists the microphones and speakers, the one in use marked; a choice switches it', async ({
  page,
}) => {
  await page.goto('/room.html?call=on')
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  const opener = dock(page).getByRole('button', { name: 'Audio settings', exact: true })
  await opener.click()
  const audio = menu(page, 'Audio settings')
  await expect(audio.locator('.menu-head')).toHaveText(['Microphone', 'Speaker'])
  await expect(audio.getByRole('menuitemradio')).toHaveText([
    'Default — MacBook Microphone',
    'USB headset',
    'Default — MacBook Speakers',
    'USB headset',
  ])
  await expect(audio.getByRole('menuitemradio', { checked: true })).toHaveText([
    'Default — MacBook Microphone',
    'Default — MacBook Speakers',
  ])
  await audio.getByRole('menuitemradio', { name: 'USB headset' }).first().click()
  // The menu goes, the focus back on its opener, and the call switched at once.
  await expect(audio).toHaveCount(0)
  await expect(opener).toBeFocused()
  await expect.poll(() => asked(page)).toContain('device:audioinput:usb-mic')
  // Opened again, the choice is the one marked.
  await opener.click()
  await expect(audio.getByRole('menuitemradio', { checked: true }).first()).toHaveText('USB headset')
  await page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
})

test('devices · the video opener lists the cameras; a camera chosen before joining is kept for the call and after a reload', async ({
  page,
}) => {
  await page.goto('/room.html')
  // Before joining, the devices are chosen in the check beside Join (device-check.md).
  await dock(page).getByRole('button', { name: 'Check audio and video', exact: true }).click()
  const check = page.getByRole('dialog', { name: 'Check your audio and video' })
  await check.getByRole('button', { name: 'Camera: FaceTime HD Camera' }).click()
  await menu(page, 'Camera').getByRole('menuitemradio', { name: 'Desk camera' }).click()
  // Out of a call nothing switches: the choice waits for the next join.
  expect((await asked(page)).filter((a) => a.startsWith('device:'))).toEqual([])
  await page.keyboard.press('Escape')
  await expect(check).toHaveCount(0)
  await page.reload()
  await dock(page)
    .getByRole('button', { name: /^Join the room/ })
    .click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  expect(await page.evaluate(() => window.fixture?.devicesOnJoin)).toEqual({ videoinput: 'cam-desk' })
  await dock(page).getByRole('button', { name: 'Video settings', exact: true }).click()
  const video = menu(page, 'Video settings')
  await expect(video.locator('.menu-head')).toHaveText(['Camera', 'Background'])
  await expect(video.getByRole('menuitemradio', { checked: true })).toHaveText(['Desk camera', 'None'])
})

test('devices · where the browser can’t choose a speaker, none is offered rather than one that does nothing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // As in Safari: no setSinkId on media elements.
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'setSinkId')
  })
  await page.goto('/room.html?call=on')
  await dock(page).getByRole('button', { name: 'Audio settings', exact: true }).click()
  await expect(menu(page, 'Audio settings').locator('.menu-head')).toHaveText(['Microphone'])
})

test('devices · with access refused, the menu says how to give it, and offers nothing to press', async ({ page }) => {
  await page.goto('/room.html?call=on&devices=blocked')
  await dock(page).getByRole('button', { name: 'Audio settings', exact: true }).click()
  const audio = menu(page, 'Audio settings')
  await expect(audio.getByRole('menuitemradio')).toHaveCount(0)
  await expect(audio.getByRole('menuitem').first()).toHaveText(
    'Allow the microphone in your browser’s site settings to choose one',
  )
  await expect(audio.getByRole('menuitem').first()).toHaveAttribute('aria-disabled', 'true')
})

test('devices · a switch the browser refuses says so in the dock', async ({ page }) => {
  await page.goto('/room.html?call=on&refuse=switch')
  await dock(page).getByRole('button', { name: 'Audio settings', exact: true }).click()
  await menu(page, 'Audio settings').getByRole('menuitemradio', { name: 'USB headset' }).first().click()
  await expect(page.locator('.dock-note')).toHaveText(
    'Couldn’t switch to that microphone. Another app may be using it.',
  )
})

test('@phone · devices · in the call the dock keeps its one row of squares: no device openers', async ({ page }) => {
  await page.goto('/room.html?call=on')
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect(dock(page).getByRole('button', { name: 'Audio settings', exact: true })).toBeHidden()
  await expect(dock(page).getByRole('button', { name: 'Video settings', exact: true })).toBeHidden()
})

// Before joining the dock has only Join and its check: on a phone the check stands there too (phone-devices.md), and its
// sheet chooses the camera, a phone's front or back, that the call opens with.
test('@phone · devices · before joining, the check beside Join is a finger-sized 42 px square on its row (Codex P2 on #412)', async ({
  page,
}) => {
  await page.goto('/room.html')
  const check = dock(page).getByRole('button', { name: 'Check audio and video', exact: true })
  await expect(check).toBeVisible()
  // Once the dock has risen (its arrival moves it 8 px), so both boxes are read at rest.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  )
  const c = await check.boundingBox()
  const j = await dock(page)
    .getByRole('button', { name: /^Join the room/ })
    .boundingBox()
  expect(Math.round(c?.width ?? 0), 'its width').toBe(42)
  expect(Math.round(c?.height ?? 0), 'its height').toBe(42)
  expect(Math.round(c?.y ?? 0), 'on Join’s row').toBe(Math.round(j?.y ?? -1))
})

test('@phone · devices · before joining, the check stands beside Join and chooses the camera the call opens with', async ({
  page,
}) => {
  await page.goto('/room.html')
  await dock(page).getByRole('button', { name: 'Check audio and video', exact: true }).click()
  const check = page.getByRole('dialog', { name: 'Check your audio and video' })
  await expect(check).toBeVisible()
  await check.getByRole('button', { name: 'Camera: FaceTime HD Camera' }).click()
  await menu(page, 'Camera').getByRole('menuitemradio', { name: 'Desk camera' }).click()
  await check.getByRole('button', { name: 'Join the room' }).click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  expect(await page.evaluate(() => window.fixture?.devicesOnJoin)).toEqual({ videoinput: 'cam-desk' })
})
