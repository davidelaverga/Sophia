// What production offers on a goal and a task (docs/plans/prod-asks.md): a request no one answers is not offered. A
// goal shows no «Request review» outside the vision flag (`?vision=off`: nothing consumes the lead's review yet), and a
// task's sheet offers no asking on a board with no conversation at all, neither one to ask in nor one to go to. Where
// the conversation only dropped (the work space), the asks stay with why. Every name is synthetic.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The first goal's controls: the filled presses, and each text button's words and height. */
const controlsRead = (page: Page) =>
  page
    .locator('.controls .control-row')
    .first()
    .evaluate((row) => ({
      filled: row.querySelectorAll('.pill.primary').length,
      text: [...row.querySelectorAll<HTMLElement>('button.text-button')].map((b) => ({
        words: b.childNodes[0]?.textContent?.trim() ?? '',
        height: Math.round(b.getBoundingClientRect().height),
      })),
    }))

test('production · a goal offers no «Request review»: Hold and Stop, as text', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work&vision=off')
  await drawn(page, DRAWN.tasks)
  await expect(page.getByRole('button', { name: /^Request review/ })).toHaveCount(0)
  const read = await controlsRead(page)
  expect(read.filled).toBe(0)
  expect(read.text).toEqual([
    { words: 'Hold', height: 24 },
    { words: 'Stop', height: 24 },
  ])
})

test('a board with no conversation · a task’s sheet offers no asking', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  await page.locator('.board').first().getByText('Review the first-week report').click()
  const sheet = page.getByRole('dialog', { name: 'Review the first-week report' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.ask-sophia')).toHaveCount(0)
  await expect(sheet.getByRole('textbox', { name: 'Ask Sophia about this task' })).toHaveCount(0)
})

test('the work space · a task’s sheet still offers asking', async ({ page }) => {
  await page.goto('/work.html?viewer=davide')
  await page.locator('.task-tile').first().click()
  await expect(page.getByRole('textbox', { name: 'Ask Sophia about this task' })).toBeVisible()
  await expect(page.locator('.ask-chips .ask-chip').first()).toBeVisible()
})
