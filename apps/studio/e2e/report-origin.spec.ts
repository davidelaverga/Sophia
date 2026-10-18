import { expect, test, type Page } from '@playwright/test'

// A report says what it was made for (docs/plans/report-origin.md): its research task's goal, a press that opens that
// goal in Goals, and what was asked. Every word is synthetic.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const ROLLOUT = 'Roll the new onboarding out to every region'
const origin = (page: Page) => page.getByRole('group', { name: 'What it was made for' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('origin · the demo’s report says its goal and what was asked; the goal opens in Goals', async ({ page }) => {
  await page.goto(`/room.html?demo=1&place=work&report=${REPORT}`)
  await expect(origin(page)).toContainText('Made for')
  await expect(origin(page)).toContainText('Asked')
  await expect(origin(page)).toContainText('Why did 12 of the 14 pilot teams stay active')
  await origin(page).getByRole('button', { name: ROLLOUT }).click()
  await expect(
    page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Goals' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('dialog', { name: ROLLOUT })).toBeVisible()
})

test('origin · a goal the project doesn’t hold leaves the press out; the question stays', async ({ page }) => {
  await page.goto(`/room.html?place=work&report=${REPORT}`)
  await expect(origin(page)).toContainText('A labelled fixture question.')
  await expect(origin(page).getByRole('button')).toHaveCount(0)
})

test('origin · the designed page says what it was made for too (Codex P2 on #383)', async ({ page }) => {
  await page.goto(`/room.html?demo=1&place=work&report=${REPORT}&format=html`)
  await expect(page.getByTitle(/, designed page$/)).toBeVisible()
  await expect(origin(page)).toContainText('Made for')
  await expect(origin(page)).toContainText('Why did 12 of the 14 pilot teams stay active')
  await expect(origin(page).getByRole('button', { name: ROLLOUT })).toBeVisible()
})

test('origin · on the full page it stands on the designed page’s edge, never centred apart (Codex P2 on #383)', async ({
  page,
}) => {
  await page.goto(`/room.html?demo=1&place=work&report=${REPORT}&format=html&view=full`)
  await expect(page.getByTitle(/, designed page$/)).toBeVisible()
  const [said, head] = await Promise.all([origin(page).boundingBox(), page.locator('.report-html-head').boundingBox()])
  expect(Math.abs((said?.x ?? 0) - (head?.x ?? -10))).toBeLessThanOrEqual(1)
})

for (const at of ['a phone', 'the full page'] as const) {
  test(`origin · where the report covers the page (${at}), Made for closes it before opening the goal (Codex P2 on #383)`, async ({
    page,
  }) => {
    if (at === 'a phone') await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/room.html?demo=1&place=work&report=${REPORT}`)
    if (at === 'the full page') {
      await page.locator('.report-pane').getByRole('button', { name: 'Enlarge', exact: true }).click()
      await expect(page.locator('.report-pane')).toHaveAttribute('data-size', 'full')
    }
    await origin(page).getByRole('button', { name: ROLLOUT }).click()
    await expect(page.locator('.report-pane')).toBeHidden()
    const sheet = page.getByRole('dialog', { name: ROLLOUT })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.locator('.report-pane')).toBeHidden()
    await expect(
      page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Goals' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(new URL(page.url()).searchParams.get('report')).toBeNull()
  })
}
