import { expect, test, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

// Connections, shown before anything connects (docs/plans/project-connections.md, Davide's chapter 7): what a member's
// own assistant could read, and the exact update the team's Slack channel would receive, built from the project's
// records. Nothing connects or sends. Behind the vision flag the fixture pages set; every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=knowledge'
const connections = (page: Page) => page.getByRole('region', { name: 'Connections' })
const access = (page: Page) => page.getByRole('dialog', { name: 'A small window into the project' })
const update = (page: Page) => page.getByRole('dialog', { name: 'One update, the right audience' })
const preview = (page: Page) => update(page).getByRole('region', { name: 'The update' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('connections · Knowledge shows both, and nothing claims to be connected', async ({ page }) => {
  await page.goto(PAGE)
  await expect(connections(page)).toContainText('Your work can be reachable, without becoming public.')
  await expect(connections(page).getByRole('button', { name: 'Review the read-only access' })).toBeVisible()
  await expect(connections(page).getByRole('button', { name: 'Preview the update' })).toBeVisible()
  // Nothing here says it is connected: each sheet ends saying none is.
  await expect(connections(page)).not.toContainText(/\bconnected\b/i)
})

test('connections · the access sheet says what an assistant could read, what never, and that none is connected', async ({
  page,
}) => {
  await page.goto(PAGE)
  const open = connections(page).getByRole('button', { name: 'Review the read-only access' })
  await open.click()
  await expect(access(page)).toContainText('Fixture project only')
  await expect(access(page)).toContainText(
    'Meeting recaps, the current brief, the project’s reports and project search',
  )
  await expect(access(page)).toContainText('Personal notes, private conversations, credentials and work controls')
  await expect(access(page)).toContainText(
    'Current membership + source eligibility + outbound permission + a grant bound to one assistant',
  )
  await expect(access(page)).toContainText('Stops future access. It can’t erase copies already received elsewhere.')
  await expect(access(page)).toContainText('No assistant is connected, and none can be from here yet')
  await access(page).getByRole('button', { name: 'Close' }).click()
  await expect(access(page)).toHaveCount(0)
  await expect(open).toBeFocused()
})

test('connections · the update is built from the newest closed meeting, with only the lines chosen', async ({
  page,
}) => {
  await page.goto(PAGE)
  await connections(page).getByRole('button', { name: 'Preview the update' }).click()
  await expect(preview(page)).toContainText('Fixture project · Project update · Oct 4')
  await expect(preview(page)).toContainText('Decided: Keep the room checks on fixtures')
  // What is still open goes only when chosen.
  await expect(preview(page)).not.toContainText('Record a short demo of the room')
  await update(page)
    .getByRole('checkbox', { name: /Record a short demo of the room/ })
    .check()
  await expect(preview(page)).toContainText('Still open: Record a short demo of the room')
  await update(page)
    .getByRole('checkbox', { name: /Keep the room checks on fixtures/ })
    .uncheck()
  await expect(preview(page)).not.toContainText('Keep the room checks on fixtures')
  // No one's name: Lucía proposed it, the viewer decided it.
  await expect(preview(page)).not.toContainText('Lucía')
  await expect(preview(page)).not.toContainText('Fixture viewer')
  await expect(update(page)).toContainText('No Slack channel is connected. Nothing is sent from here.')
})

test('connections · with a meeting running, the update is still the newest closed one’s', async ({ page }) => {
  await page.goto(`${PAGE}&call=on`)
  await connections(page).getByRole('button', { name: 'Preview the update' }).click()
  await expect(preview(page)).toContainText('Fixture project · Project update · Oct 4')
  await expect(preview(page)).toContainText('Decided: Keep the room checks on fixtures')
})

test('connections · Copy the update copies exactly the preview, and says so', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(PAGE)
  await connections(page).getByRole('button', { name: 'Preview the update' }).click()
  await expect(preview(page)).toContainText('Decided: Keep the room checks on fixtures')
  await update(page).getByRole('button', { name: 'Copy the update' }).click()
  await expect(update(page)).toContainText('Copied. Paste it where your team reads it.')
  // The clipboard writes its own line ends (CRLF on Windows): the words and the lines are what count.
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')
  expect(copied).toBe(await preview(page).locator('pre').innerText())
  expect(copied).toContain('Decided: Keep the room checks on fixtures')
})

test('connections · with no closed meeting, it says so, with nothing to copy', async ({ page }) => {
  await page.goto(`${PAGE}&meetings=none`)
  await connections(page).getByRole('button', { name: 'Preview the update' }).click()
  await expect(update(page)).toContainText('An update is built from a closed meeting’s recap. There is none yet.')
  await expect(update(page).getByRole('button', { name: 'Copy the update' })).toHaveCount(0)
})

test('connections · a recap that can’t be read says so, with Try again', async ({ page }) => {
  await page.goto(PAGE)
  await page.evaluate(() => window.fixture?.failRecaps(true))
  await connections(page).getByRole('button', { name: 'Preview the update' }).click()
  await expect(update(page)).toContainText('The meeting’s recap can’t be read now.')
  await page.evaluate(() => window.fixture?.failRecaps(false))
  await update(page).getByRole('button', { name: 'Try again' }).click()
  await expect(preview(page)).toContainText('Decided: Keep the room checks on fixtures')
})

test('connections · controls are at least 24 px, and the text keeps to the scale', async ({ page }) => {
  await page.goto(PAGE)
  await expect(connections(page)).toBeVisible()
  const short = (selector: string) =>
    page
      .locator(selector)
      .evaluateAll((all) =>
        all
          .map((el) => ({ name: el.textContent.trim().slice(0, 20), h: el.getBoundingClientRect().height }))
          .filter((c) => c.h < 23.5),
      )
  const offScale = async (part: string, scale: readonly string[]) =>
    (await typeSizes(page, part)).filter((s) => !scale.includes(s))
  // Knowledge's part: the work views' scale.
  expect(await short('.connections button:visible')).toEqual([])
  expect(await offScale('.connections-parts', ['10.5px', '12px', '13px', '14px'])).toEqual([])
  // Each sheet: the same, and a sheet's title at 15 px, as every sheet's (theme.css).
  for (const open of ['Review the read-only access', 'Preview the update']) {
    await connections(page).getByRole('button', { name: open }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    if (open === 'Preview the update') await expect(preview(page)).toContainText('Decided')
    expect(await short('.sheet button:visible'), open).toEqual([])
    expect(await offScale('.sheet', ['10.5px', '12px', '13px', '14px', '15px']), open).toEqual([])
    await sheet.getByRole('button', { name: 'Close' }).click()
  }
})
