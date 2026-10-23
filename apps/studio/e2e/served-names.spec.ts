import { expect, test, type Page } from '@playwright/test'

// The served board names people from the project's members (docs/plans/served-names.md; informe-25 DL-05): who
// decides, who chose and who a wait is on, never «someone» for a teammate the project knows. Every name is synthetic.

const ROLLOUT = 'Roll the new onboarding out to every region'
const TASK = 'Translate the checklist for the second region'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

const board = (page: Page) => page.locator('.board').first()

test('served names · the demo’s board names who decides, who chose and who a wait is on, never «someone»', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=work')
  const pill = board(page).locator('.decision-pill')
  await expect(pill).toHaveText('1 decision for Marco')
  // The task waiting on Marco's permission says whose it is.
  await expect(board(page).locator('[data-task="work-1"]')).toContainText(TASK)
  await expect(board(page).locator('[data-task="work-1"]')).toContainText('Waiting on Marco')
  await pill.click()
  const decision = board(page).locator('[data-decision]')
  await expect(decision).toHaveAttribute('aria-label', 'Marco decides')
  await expect(decision.locator('.avatar')).toHaveCount(1)
  await board(page)
    .getByRole('button', { name: /2 assumed · 1 decided/ })
    .click()
  await expect(board(page).getByRole('list', { name: 'Decided', exact: true })).toContainText('Luis chose')
  const rollout = page.locator('li.goal').filter({ has: page.getByRole('heading', { name: ROLLOUT }) })
  await expect
    .poll(() => rollout.evaluate((el: HTMLElement) => (el.innerText.match(/\bsomeone\b/gi) ?? []).length))
    .toBe(0)
  await expect(page.locator('main')).not.toContainText(/Davide/)
})

test('@phone · served names · on a phone the pill names Marco on one line, whole', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  const pill = board(page).locator('.decision-pill')
  await expect(pill).toHaveText('1 decision for Marco')
  // The words alone, not the dot or the chevron beside them: one line box each line they take.
  const fit = await pill.evaluate((el) => {
    const words = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
    const range = document.createRange()
    if (words) range.selectNodeContents(words)
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)))
    return { whole: el.scrollWidth <= el.clientWidth, lines: lines.size }
  })
  expect(fit).toEqual({ whole: true, lines: 1 })
})
