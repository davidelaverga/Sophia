import { expect, test, type Locator, type Page } from '@playwright/test'

// A linked task reads in two lines (docs/plans/task-sheet-links-keys.md; informe-25 V1): its name over where it stands,
// the name given the row's width. Side by side, the status sentence took its whole width first and left the name a word
// a line. Every name here is synthetic.

const TASK = 'Translate the checklist for the second region'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

/** Each linked task's geometry: its name's lines, the status under it on the same left edge, and the name's share. */
const readLinks = (list: Locator) =>
  list.locator('.task-link').evaluateAll((links) =>
    links.map((link) => {
      const name = link.querySelector('.task-link-name')
      const where = link.querySelector('.task-link-where')
      const mark = link.querySelector('.plan-mark')
      if (!name || !where) return null
      const n = name.getBoundingClientRect()
      const w = where.getBoundingClientRect()
      const style = getComputedStyle(link)
      const content =
        link.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const line = parseFloat(getComputedStyle(name).lineHeight)
      const m = mark?.getBoundingClientRect()
      return {
        text: name.textContent,
        lines: Math.round(n.height / line),
        stacked: w.top >= n.bottom - 0.5,
        aligned: Math.abs(w.left - n.left) <= 0.5,
        share: n.width / content,
        markOffset: m ? m.top + m.height / 2 - (n.top + line / 2) : 0,
      }
    }),
  )

async function waitedOnBy(page: Page) {
  await page.goto('/room.html?demo=1&place=work')
  await page.locator('.board').first().getByText(TASK).first().click()
  const sheet = page.getByRole('dialog', { name: TASK })
  await expect(sheet).toBeVisible()
  const section = sheet.locator('.sheet-section').filter({ has: page.getByRole('heading', { name: 'Waited on by' }) })
  await section.scrollIntoViewIfNeeded()
  return section
}

function expectTwoLines(links: Awaited<ReturnType<typeof readLinks>>) {
  expect(links.length).toBeGreaterThan(0)
  for (const link of links) {
    expect(link, String(link?.text)).not.toBeNull()
    if (!link) continue
    expect(link.lines, link.text).toBeLessThanOrEqual(2)
    expect(link.stacked, link.text).toBe(true)
    expect(link.aligned, link.text).toBe(true)
    expect(link.share, link.text).toBeGreaterThanOrEqual(0.9)
    expect(Math.abs(link.markOffset), link.text).toBeLessThanOrEqual(1)
  }
}

test.describe('at 1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('links · «Waited on by»: each name keeps the row’s width, its status under it', async ({ page }) => {
    const section = await waitedOnBy(page)
    await expect(section.locator('.task-link-name')).toHaveText(['Review the translation', 'Write the rollout note'])
    expectTwoLines(await readLinks(section))
  })

  test('links · work outside the plan: the name in the text column, never the mark’s 8 px', async ({ page }) => {
    await page.goto('/work.html?viewer=davide&case=outside')
    const outside = page.getByRole('region', { name: 'Observed outside the plan' })
    await expect(outside.locator('[data-work="work-old"]')).toBeVisible()
    const [row] = await readLinks(outside)
    expect(row?.share).toBeGreaterThanOrEqual(0.9)
    expect(row?.stacked).toBe(true)
  })
})

test('@phone · links · «Waited on by» at a phone’s width: two lines at most, nothing off the side', async ({
  page,
}) => {
  const section = await waitedOnBy(page)
  expectTwoLines(await readLinks(section))
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})
