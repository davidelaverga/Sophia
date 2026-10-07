import { expect, test, type Locator, type Page } from '@playwright/test'
import { DESIGNED, REPORT } from '../fixtures/report-data.ts'
import { typeSizes } from './type-sizes.ts'

// Knowledge as a library (docs/plans/knowledge-library.md, K1): each report a tile that opens with its cover, the
// designed page's first screen or the Markdown's first lines, then one meta line, on the app's four type sizes. On the
// fixture page (the Studio's own ProjectShell); only the API is faked, and each check ends by asking the page whether
// anything reached for the API beyond what it answers.

const fixture = (page: Page) =>
  page.evaluate(() => {
    const view = window.fixture
    if (!view) throw new Error('the fixture page did not start')
    return { unexpected: [...view.unexpected] }
  })

test.afterEach(async ({ page }) => {
  expect((await fixture(page)).unexpected, 'requests the fixture did not expect').toEqual([])
})

/** The tile of the report titled `title`. */
const tile = (page: Page, title: string) =>
  page.locator('.report-card').filter({ has: page.getByRole('button', { name: title, exact: true }) })

/** Whether nothing covers the middle of what `locator` names: a press there reaches it. */
const onTop = (locator: Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
  })

test('library · a designed page is its tile’s cover: its first screen, in a frame with no permission, from the checked bytes', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge&designed=on')
  const cover = tile(page, 'Fixture report').locator('.report-cover iframe')
  // No allow-* token, as in the viewer: the page cannot run, reach the Studio, load or send anything.
  await expect(cover).toHaveAttribute('sandbox', '')
  expect(await cover.getAttribute('srcdoc')).toBe(DESIGNED.text)
  // A picture of the page: no reader hears it twice and no Tab stops in it; the press over it says what it is.
  await expect(cover).toHaveAttribute('aria-hidden', 'true')
  await expect(cover).toHaveAttribute('tabindex', '-1')
  await expect(page.frameLocator('.report-cover iframe').getByText('A labelled fixture designed page')).toBeAttached()
})

test('library · the press over a designed cover opens the designed page; the title opens the report', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge&designed=on')
  const card = tile(page, 'Fixture report')
  const open = card.getByRole('button', { name: 'Open Fixture report, HTML page' })
  await expect(card.locator('.report-cover iframe')).toBeAttached()
  // The press takes the whole cover: wherever the cover is pressed, it is the press.
  const [press, cover] = await Promise.all([open.boundingBox(), card.locator('.report-cover').boundingBox()])
  expect(press && cover && Math.abs(press.width - cover.width) <= 1 && Math.abs(press.height - cover.height) <= 1).toBe(
    true,
  )
  expect(await onTop(open), 'nothing covers the cover’s press').toBe(true)
  await open.click()
  await expect(page.locator('iframe.report-html-frame')).toHaveAttribute('sandbox', '')
  expect(await page.locator('iframe.report-html-frame').getAttribute('srcdoc')).toBe(DESIGNED.text)
})

test('library · a Markdown report’s cover is its first lines as text, without citation ids; pressing it opens the report', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge')
  const cover = tile(page, 'Fixture report').locator('.report-cover')
  await expect(cover).toContainText('The first version of a labelled fixture report.')
  await expect(cover).toContainText('It cites one page.')
  await expect(cover).not.toContainText('00000000-') // the citation's id is not words
  await expect(cover.locator('iframe')).toHaveCount(0)
  // The title's press takes the tile: a press on the cover is the title's.
  const box = await cover.boundingBox()
  if (!box) throw new Error('no cover')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const pane = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(pane.getByText('The first version of a labelled fixture report.')).toBeVisible()
})

test('library · a designed page that does not match its record leaves its monogram, never a frame', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge&designed=on&tamper=html')
  const cover = tile(page, 'Fixture report').locator('.report-cover')
  await expect(cover.locator('.report-cover-mark')).toHaveText('HTML')
  await expect(cover.locator('iframe')).toHaveCount(0)
  // The monogram names the format already: the tag over the cover does not say it twice.
  await expect(tile(page, 'Fixture report').locator('.report-cover-tag')).toBeHidden()
})

test('library · one meta line: the version, the count only when there are several, the day; never «updated»', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge&versions=2')
  await expect(tile(page, 'Fixture report').locator('.report-meta')).toHaveText(/^v2 · 2 versions · [^·]+$/)

  await page.goto('/room.html?place=knowledge')
  await expect(tile(page, 'Fixture report').locator('.report-meta')).toHaveText(/^v1 · [^·]+$/)

  // The formats beyond the Markdown come first: the version with a designed page says so.
  await page.goto('/room.html?place=knowledge&designed=on')
  await expect(tile(page, 'Fixture report').locator('.report-meta')).toHaveText(/^HTML · v1 · [^·]+$/)
})

test('library · the tiles keep to the app’s four type sizes', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&designed=on')
  await expect(tile(page, 'Fixture report').locator('.report-cover iframe')).toBeAttached()
  await page.getByRole('button', { name: 'More reports' }).click()
  await expect(page.getByRole('button', { name: 'An older fixture report' })).toBeVisible()
  const sizes = await typeSizes(page, '.report-cards')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px'], sizes.join(' ')).toContain(s)
})

test('library · Edit and History and changes keep their own presses on the tile', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&designed=on')
  const card = tile(page, 'Fixture report')
  expect(await onTop(card.getByRole('button', { name: 'Edit', exact: true })), 'Edit').toBe(true)
  expect(await onTop(card.getByRole('button', { name: 'History and changes' })), 'History').toBe(true)
  await card.getByRole('button', { name: 'History and changes' }).click()
  await expect(page.getByRole('tab', { name: /History/, selected: true })).toBeVisible()
})

test('library · three tiles a row or more at 1440 px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/room.html?place=knowledge')
  const columns = await page
    .locator('.report-cards')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(columns).toBeGreaterThanOrEqual(3)
})

test('library @phone · one tile a row, nothing past the screen', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&designed=on')
  await expect(tile(page, 'Fixture report').locator('.report-cover iframe')).toBeAttached()
  const columns = await page
    .locator('.report-cards')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(1)
  const past = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(past).toBeLessThanOrEqual(0)
})

test('library · a report with no description says so, and credits no one for it', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.getByRole('button', { name: 'More reports' }).click()
  const older = tile(page, 'An older fixture report')
  await expect(older.getByText('No description yet.')).toBeVisible()
  await expect(older).not.toContainText('Description by Sophia')
  await expect(older.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
})

test('library · Tab never stops inside a cover: from the cover’s press it goes to the title, past the page’s links', async ({
  page,
}) => {
  // The demo's designed page cites its sources with links, as a compiled page does.
  await page.goto('/room.html?demo=1&place=knowledge')
  const card = tile(page, 'Pilot readout: what kept 12 of 14 teams')
  await expect(page.frameLocator('.report-cover iframe').first().locator('a.cite').first()).toBeAttached()
  await card.getByRole('button', { name: /HTML page$/ }).focus()
  await page.keyboard.press('Tab')
  await expect(card.getByRole('button', { name: 'Pilot readout: what kept 12 of 14 teams', exact: true })).toBeFocused()
})

test('library · a cover scrolled far away keeps no frame, and comes back without a new read', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&designed=on')
  const frame = tile(page, 'Fixture report').locator('.report-cover iframe')
  await expect(frame).toHaveCount(1)
  // A long shelf below the tiles carries this one far out of reach.
  const reads = () =>
    page.evaluate(
      (source) => (window.fixture?.served ?? []).filter((s) => s === `content:${source}`).length,
      DESIGNED.sourceId,
    )
  const before = await reads()
  expect(before).toBeGreaterThan(0)
  await page.evaluate(() => {
    const shelf = document.createElement('div')
    shelf.style.height = '4000px'
    document.querySelector('main')?.append(shelf)
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await expect(frame).toHaveCount(0)
  await expect(tile(page, 'Fixture report').locator('.report-cover')).toHaveAttribute('data-cover', 'page')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(frame).toHaveCount(1)
  expect(await frame.getAttribute('srcdoc')).toBe(DESIGNED.text)
  await page.waitForTimeout(600) // a late read would have come by now
  expect(await reads(), 'no new read of the page').toBe(before)
})

test('library · a tile out of reach whose card names a newer version reads nothing, until it comes near', async ({
  page,
}) => {
  // The viewer reads the report's versions; its card names one published since; the tiles start far below.
  await page.addInitScript(() => {
    new MutationObserver((_, watch) => {
      const cards = document.querySelector('.report-cards')
      if (!cards) return
      watch.disconnect()
      const shelf = document.createElement('div')
      shelf.style.height = '4000px'
      cards.before(shelf)
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto(`/room.html?place=knowledge&card=ahead&report=${REPORT}`)
  await expect(page.getByRole('complementary', { name: 'Fixture report' })).toBeVisible()
  const reads = () =>
    page.evaluate(() => (window.fixture?.served ?? []).filter((s) => s.startsWith('versions:')).length)
  await expect.poll(reads).toBeGreaterThan(0)
  const before = await reads()
  await page.waitForTimeout(600) // a read for the tile would have come by now
  expect(await reads(), 'no read for a tile out of sight').toBe(before)
  // Near, the tile reads the list again, once, for the version its card names.
  await tile(page, 'Fixture report').scrollIntoViewIfNeeded()
  await expect.poll(reads).toBe(before + 1)
})

test('library · covers once read are not read again when the window comes back', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&designed=on')
  await page.getByRole('button', { name: 'More reports' }).click()
  await expect(page.locator('.report-cover[data-cover="page"], .report-cover[data-cover="lines"]')).toHaveCount(2)
  // Count the versions reads from here (the fixture's fetch, wrapped), on the document's data.
  await page.evaluate(() => {
    const read = window.fetch
    const count = document.documentElement.dataset
    count.versionsRead = '0'
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('/versions')) count.versionsRead = String(Number(count.versionsRead) + 1)
      return read(input, init)
    }
  })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => document.documentElement.dataset.versionsRead)).toBe('0')
})

test('library · the older report opens from its tile, its sources read', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.getByRole('button', { name: 'More reports' }).click()
  await page.getByRole('button', { name: 'An older fixture report', exact: true }).click()
  const pane = page.getByRole('complementary', { name: 'An older fixture report' })
  await expect(pane.getByText('A labelled fixture report from before PDFs were turned off.')).toBeVisible()
  await pane.getByRole('tab', { name: /Sources/ }).click()
  await expect(pane.getByText('This version cites no source you can read.')).toBeVisible()
})
