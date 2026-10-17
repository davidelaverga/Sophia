import { expect, test, type Page } from '@playwright/test'
import { colourOf, lowContrast } from './contrast.ts'

// Settings, in one place (docs/plans/account-settings.md): «Settings…» in the avatar's menu opens a sheet with the
// account, the theme, a call's defaults, your data and help. Every name is synthetic.

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Settings' })

async function openSettings(page: Page, query = '') {
  await page.goto(`/room.html?people=2${query}`)
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Settings…' }).click()
  await expect(sheet(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('settings · the avatar’s menu opens Settings, with its five parts', async ({ page }) => {
  await openSettings(page)
  for (const part of ['Account', 'Appearance', 'Calls', 'Data and privacy', 'Help'])
    await expect(sheet(page).getByRole('heading', { name: part, exact: true })).toBeVisible()
})

test('settings · Light puts the page on paper', async ({ page }) => {
  await openSettings(page)
  await sheet(page).getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('settings · a call’s defaults: the microphone on joining, and the mirror, kept', async ({ page }) => {
  await openSettings(page)
  const mic = sheet(page).getByRole('checkbox', { name: 'Join with my microphone on' })
  await expect(mic).toBeChecked()
  await mic.uncheck()
  const mirror = sheet(page).getByRole('checkbox', { name: 'Mirror my video' })
  await mirror.uncheck()
  await page.keyboard.press('Escape')
  await page.reload()
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Settings…' }).click()
  await expect(sheet(page).getByRole('checkbox', { name: 'Join with my microphone on' })).not.toBeChecked()
  await expect(sheet(page).getByRole('checkbox', { name: 'Mirror my video' })).not.toBeChecked()
})

test('settings · Keyboard shortcuts there hands over to the index, one sheet at a time (Codex P1 on #398)', async ({
  page,
}) => {
  await openSettings(page)
  await sheet(page).getByRole('button', { name: 'Keyboard shortcuts' }).click()
  const index = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(index).toBeVisible()
  await expect(sheet(page)).toHaveCount(0)
  // Nothing covers it, and the keys are in it.
  const box = await index.boundingBox()
  if (!box) throw new Error('the index has no box')
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  expect(await index.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), at)).toBe(true)
  expect(await index.evaluate((el) => el.contains(document.activeElement))).toBe(true)
})

test('settings · a choice is a small box beside its words on one line, and the account says each thing on its line', async ({
  page,
}) => {
  await openSettings(page)
  for (const name of ['Join with my microphone on', 'Mirror my video']) {
    const box = await sheet(page).getByRole('checkbox', { name }).boundingBox()
    const row = await sheet(page).locator('.settings-check', { hasText: name }).boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual(20)
    expect(row?.height ?? 99).toBeLessThanOrEqual(32)
  }
  const said = sheet(page).locator('.account-names > span')
  const first = await said.first().boundingBox()
  const last = await said.last().boundingBox()
  if (!first || !last) throw new Error('the account says nothing')
  expect(last.y).toBeGreaterThanOrEqual(first.y + first.height - 1)
})

// Sign out signs out this device; all of them only when asked, in Settings, and after asking (sign-out-scope.md). On
// the fixture page both go to the sign-in, the second saying so (?everywhere=1).
test('settings · Sign out of all devices asks first; staying keeps you; confirmed, it signs out everywhere', async ({
  page,
}) => {
  await openSettings(page)
  const everywhere = sheet(page).getByRole('button', { name: 'Sign out of all devices' })
  await everywhere.click()
  await expect(
    sheet(page).getByText('This one signs out now. Your other devices are signed out within an hour', { exact: false }),
  ).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: 'Stay signed in' })).toBeFocused()
  await sheet(page).getByRole('button', { name: 'Stay signed in' }).click()
  await expect(everywhere).toBeFocused()
  await everywhere.click()
  await sheet(page).getByRole('button', { name: 'Sign out everywhere' }).click()
  await expect(page).toHaveURL(/signin\.html\?everywhere=1$/)
})

test('settings · the account menu’s Sign out is this device’s', async ({ page }) => {
  await page.goto('/room.html?people=2')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/signin\.html$/)
})

/** How many of a box's pixels are within 16 per channel of a colour. */
async function pixelsNear(page: Page, png: Buffer, rgb: readonly number[]) {
  return page.evaluate(
    async ({ data, want }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return -1
      ctx.drawImage(bitmap, 0, 0)
      const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
      let near = 0
      for (let i = 0; i < px.length; i += 4) if (want.every((v, c) => Math.abs((px[i + c] ?? 0) - v) <= 16)) near += 1
      return near
    },
    { data: png.toString('base64'), want: [...rgb] },
  )
}

// A checked box is the kit's (informe-25 X8): it fills with the «on» of a pressed square and a primary press, never the
// browser's blue for the scheme (#99c7fe on a dark page, #0075ff on a light one).
for (const [theme, query, fill, blue] of [
  ['dark', '', 'rgb(244, 240, 255)', [153, 199, 254]],
  ['light', '&theme=light', 'rgb(85, 70, 184)', [0, 117, 255]],
] as const) {
  test(`settings · ${theme}: a checked box fills with the kit’s on, never the browser’s blue (informe-25 X8)`, async ({
    page,
  }) => {
    await openSettings(page, query)
    const box = sheet(page).getByRole('checkbox', { name: 'Join with my microphone on' })
    await expect(box).toBeChecked()
    await page.mouse.move(0, 0)
    expect(await box.evaluate((e) => getComputedStyle(e).accentColor)).toBe(fill)
    expect(await pixelsNear(page, await box.screenshot({ animations: 'disabled' }), blue)).toBe(0)
  })
}

// The destructive answer keeps its rose under the pointer (informe-25 M12): the pill's own hover would grey it.
for (const [theme, query, rose] of [
  ['dark', '', [238, 159, 176]],
  ['light', '&theme=light', [168, 55, 90]],
] as const) {
  test(`settings · ${theme}: the destructive answer keeps its rose under the pointer (informe-25 M12)`, async ({
    page,
  }) => {
    await openSettings(page, query)
    await sheet(page).getByRole('button', { name: 'Sign out of all devices' }).click()
    const go = sheet(page).getByRole('button', { name: 'Sign out everywhere' })
    await expect(go).toBeVisible()
    const look = () =>
      go.evaluate(async (e) => {
        await Promise.all(e.getAnimations().map((a) => a.finished.catch(() => undefined)))
        const s = getComputedStyle(e)
        return { fill: s.backgroundColor, edge: s.borderTopColor }
      })
    await page.mouse.move(0, 0)
    const rest = await look()
    await go.hover()
    const over = await look()
    const fill = colourOf(over.fill)
    expect([fill.r, fill.g, fill.b]).toEqual([...rose])
    expect(over.fill).toBe(rest.fill)
    expect(colourOf(over.edge).a).toBeCloseTo(0.7, 2)
    expect(colourOf(over.edge).a).toBeGreaterThan(colourOf(rest.edge).a)
    expect(await lowContrast(page, '.settings-part .confirm')).toEqual([])
  })
}
