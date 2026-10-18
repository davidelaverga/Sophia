// The board says why it is blocked, and the goal's chip how much (docs/plans/board-why-blocked.md), on the Tasks
// fixture page.
import { expect, test, type Page } from '@playwright/test'

const PAGE = '/work.html'
const lane = (page: Page, name: string) => page.locator('.board').first().getByRole('region', { name, exact: true })

test('why · the Blocked lane says what it waits on; the press opens the blocker’s sheet', async ({ page }) => {
  await page.goto(PAGE)
  const blocked = lane(page, 'Blocked')
  await expect(blocked.locator('.lane-why')).toHaveText(/^Waiting on\s*Implement the PDF retry$/)
  await blocked.getByRole('button', { name: 'Implement the PDF retry', exact: true }).click() // the waiting tile names it too
  await expect(page.getByRole('dialog', { name: 'Implement the PDF retry' })).toBeVisible()
})

test('why · the goal’s chip counts what is blocked; a goal with nothing blocked says nothing of it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?goals=6`)
  const first = page.getByRole('tab', { name: /Reports export to PDF reliably/ })
  await expect(first.locator('.plan-tab-blocked')).toHaveText('1 blocked')
  const fonts = page.getByRole('tab', { name: /Exports keep the report’s fonts/ })
  await expect(fonts.locator('.plan-tab-blocked')).toHaveCount(0)
})

test('why @phone · on a coarse pointer the blockers’ rows keep their reaching targets apart', async ({ page }) => {
  await page.goto(PAGE)
  const why = lane(page, 'Blocked').locator('.lane-why')
  await expect(why).toBeVisible()
  const read = await why.evaluate((el) => {
    const press = el.querySelector('.text-button')
    const reach = press ? getComputedStyle(press, '::after').top : ''
    return { rowGap: parseFloat(getComputedStyle(el).rowGap), reach: Math.abs(parseFloat(reach)) }
  })
  // The target reaches `reach` px past each row's words, above and below: two rows need twice that between them.
  expect(read.reach).toBe(7)
  expect(read.rowGap).toBeGreaterThanOrEqual(2 * read.reach)
})

test('why · a lane names three blockers in the plan’s order; «and N more» shows the rest and keeps the focus (Codex on #244)', async ({
  page,
}) => {
  await page.goto(`${PAGE}?waits=1`)
  const why = lane(page, 'Blocked').locator('.lane-why')
  const names = why.locator('.text-button:not(.lane-why-more)')
  await expect(names).toHaveCount(3)
  // The plan's order: the retry first, then the four in the order the plan holds them (the dependent lists them reversed).
  await expect(names).toHaveText(['Implement the PDF retry', 'Agree the export’s font list', /^Read https:/])
  const more = why.locator('.lane-why-more')
  await expect(more).toHaveText('and 2 more')
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(names).toHaveCount(5)
  await expect(more).toBeFocused()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
})

test('why · a blocker’s long unbroken name wraps inside its lane (Codex on #244)', async ({ page }) => {
  await page.goto(`${PAGE}?waits=1`)
  const blocked = lane(page, 'Blocked')
  const long = blocked.locator('.lane-why .text-button', { hasText: /^Read https:/ })
  await expect(long).toBeVisible()
  const [box, inLane] = await Promise.all([long.boundingBox(), blocked.boundingBox()])
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((inLane?.x ?? 0) + (inLane?.width ?? 0) + 0.5)
})

test('why · the blocker completed while its sheet is open: closing gives the focus to its tile (Codex on #244)', async ({
  page,
}) => {
  await page.goto(PAGE)
  const blocked = lane(page, 'Blocked')
  await blocked.locator('.lane-why').getByRole('button', { name: 'Implement the PDF retry', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await expect(sheet).toBeVisible()
  await page.evaluate(() => window.workFixture?.complete?.('work-1'))
  await expect(page.locator('.lane-why')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('.board [data-task="work-1"]').first()).toBeFocused()
})

test('why · a blocked goal’s chip keeps its marks inside it (Codex on #244)', async ({ page }) => {
  await page.goto(`${PAGE}?goals=6&viewer=davide`)
  const chip = page.getByRole('tab', { name: /Reports export to PDF reliably/ })
  const tab = chip.locator('.plan-tab')
  await expect(tab.locator('.plan-tab-blocked')).toBeVisible()
  expect(await tab.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
})

test('why · the focus on the last blocker’s press, the blocker done: the focus goes to its tile (Codex on #244)', async ({
  page,
}) => {
  await page.goto(PAGE)
  const press = lane(page, 'Blocked')
    .locator('.lane-why')
    .getByRole('button', { name: 'Implement the PDF retry', exact: true })
  await press.focus()
  await page.evaluate(() => window.workFixture?.complete?.('work-1'))
  await expect(page.locator('.lane-why')).toHaveCount(0)
  await expect(page.locator('.board [data-task="work-1"]').first()).toBeFocused()
})

test('why · «and N more» gone with the line shortened, the focus goes to its last blocker (Codex P2 on #244)', async ({
  page,
}) => {
  await page.goto(`${PAGE}?waits=1`)
  const why = lane(page, 'Blocked').locator('.lane-why')
  const more = why.locator('.lane-why-more')
  await expect(more).toHaveText('and 2 more')
  const ids = await why.locator('[data-blocker]').evaluateAll((els) => els.map((el) => el.getAttribute('data-blocker')))
  await more.focus()
  // Two of the five complete as the page watches: three left, all named, no «more» to press.
  await page.evaluate(
    (done) => {
      for (const id of done) if (id) window.workFixture?.complete?.(id)
    },
    ids.slice(0, 2),
  )
  await expect(more).toHaveCount(0)
  await expect(why.locator('[data-blocker]').last()).toBeFocused()
})

/** Each text's baseline in the Blocked lane's line, by the bottom of its words: «Waiting on» first, then each press. */
const baselines = (page: Page) =>
  lane(page, 'Blocked')
    .locator('.lane-why')
    .evaluate((why) =>
      [why.querySelector('.lane-why-word'), ...why.querySelectorAll('.text-button')].flatMap((el) => {
        const words = el?.firstChild
        if (!words) return []
        const range = document.createRange()
        range.selectNodeContents(words)
        const first = range.getClientRects()[0]
        return first ? [Math.round(first.bottom * 2) / 2] : []
      }),
    )

for (const query of ['', '?waits=1']) {
  test(`why · «Waiting on» and what it waits on share one baseline (${query || 'one blocker'})`, async ({ page }) => {
    await page.goto(`${PAGE}${query}`)
    await expect(lane(page, 'Blocked').locator('.lane-why .text-button').first()).toBeVisible()
    const [word, first] = await baselines(page)
    // The word and the first blocker stand on one line: their words end at the same height.
    expect(Math.abs((word ?? 0) - (first ?? Number.NaN))).toBeLessThanOrEqual(0.5)
  })
}
