import { expect, test, type Page } from '@playwright/test'

// LFE-06's resource checks (RES-01 … RES-03): the real ResourcePanel on the labelled simulated fixture page
// (fixtures/resources.html). Showing resources calls nothing: each check ends by asking the page for any request.

const PAGE = '/resources.html'

const card = (page: Page, name: string) => page.getByRole('article', { name })
const capacity = (page: Page, name: string) => card(page, name).getByRole('group', { name: 'Capacity' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.resourcesFixture?.unexpected ?? []), 'requests the panel made').toEqual([])
})

test('LFE-06.1 · the three enrollments, each with its owner, tool, host, sessions and supported controls', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(page.getByRole('article')).toHaveCount(3)
  const codex = card(page, 'Davide · Codex')
  await expect(codex.getByText('Host online')).toBeVisible()
  await expect(codex.getByText('Model not reported')).toBeVisible() // nothing reported, nothing made up
  await expect(codex.getByText('Working: Review the report pane')).toBeVisible()
  await expect(codex.getByText(/^Stop: supported · Hold: supported · Guidance: not qualified yet/)).toBeVisible()
  await expect(card(page, 'Davide · Claude Code').getByText('claude-opus-5-5 · high effort')).toBeVisible()
  await expect(card(page, 'Luis · Claude Code').getByText('Host unknown')).toBeVisible()
  await expect(card(page, 'Luis · Claude Code').getByText('3 h ago', { exact: true })).toBeVisible() // the host's age
  await expect(page.getByRole('button', { name: /^(Stop|Hold|Steer|Guidance)$/ })).toHaveCount(0) // said, not offered
})

test('RES-01 · two sessions on one account are listed apart, and its capacity is counted once', async ({ page }) => {
  await page.goto(PAGE)
  const claude = card(page, 'Davide · Claude Code')
  await expect(claude.getByRole('list', { name: 'Sessions' }).getByRole('listitem')).toHaveCount(2)
  await expect(claude.getByRole('group', { name: 'Capacity' })).toHaveCount(1)
  await expect(capacity(page, 'Davide · Claude Code').getByText(/^2 sessions share this account/)).toBeVisible()
})

test('RES-02 · unknown capacity stays unknown, a reset already due is pending, and providers are never added up', async ({
  page,
}) => {
  await page.goto(PAGE)
  const luis = capacity(page, 'Luis · Claude Code')
  await expect(luis.getByText('Capacity unknown')).toBeVisible()
  await expect(luis.getByText(/%/)).toHaveCount(0) // not 0 %, not 100 %
  await expect(luis.getByText('Not visible from this tool: rate limits.')).toBeVisible()

  const claude = capacity(page, 'Davide · Claude Code')
  await expect(claude.getByText('5-hour window: 63% used, resets in 55 min')).toBeVisible()
  await claude.getByRole('button', { name: 'Every window' }).click()
  await expect(claude.getByText('Refresh pending')).toBeVisible()
  await expect(claude.getByText('reset was due 1 h ago')).toBeVisible()
  await expect(claude.getByText('71%')).toHaveCount(0) // a due window's old value is not shown as capacity

  await expect(capacity(page, 'Davide · Codex').getByText(/owner keeps 20% back/)).toBeVisible() // reserve apart
  await expect(page.getByText(/total|combined|overall/i)).toHaveCount(0)
})

test('RES-03 · Luis sees Davide’s request and who answers it, with nothing to press', async ({ page }) => {
  await page.goto(PAGE)
  const request = page.getByRole('listitem').filter({ hasText: 'Run a shell command' })
  await expect(request.getByText('Davide’s Claude Code · session claude-worker')).toBeVisible()
  await expect(request.getByText('Waiting')).toBeVisible()
  await expect(request.getByText('expires in 40 min')).toBeVisible()
  await expect(request.getByText('Only Davide can answer this, in Claude Code.')).toBeVisible()
  await expect(request.getByRole('button')).toHaveCount(0)
  await expect(request.getByRole('link')).toHaveCount(0)
})

test('RES-03 · Davide is told where to answer it, and the page still answers nothing', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const request = page.getByRole('listitem').filter({ hasText: 'Run a shell command' })
  await expect(request.getByText('Answer it in Claude Code, session claude-worker.')).toBeVisible()
  await expect(request.getByRole('button', { name: /approve|allow|answer|deny/i })).toHaveCount(0)
  await expect(request.getByRole('link')).toHaveCount(0) // no safe target: none is made up
  await request.click() // seeing or touching it resolves nothing
  await expect(request.getByText('Waiting')).toBeVisible()
})

test('the windows open and close by keyboard', async ({ page }) => {
  await page.goto(PAGE)
  const toggle = capacity(page, 'Davide · Codex').getByRole('button', { name: 'Every window' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(capacity(page, 'Davide · Codex').getByRole('button', { name: 'Hide the windows' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(capacity(page, 'Davide · Codex').getByText('18% used')).toBeVisible()
  await page.keyboard.press('Space')
  await expect(capacity(page, 'Davide · Codex').getByText('18% used')).toBeHidden()
})

test('@phone · every card reads at a phone’s width, with nothing off the side', async ({ page }) => {
  await page.goto(PAGE)
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(width[0], 'no sideways scroll').toBe(width[1])
  for (const name of ['Davide · Codex', 'Davide · Claude Code', 'Luis · Claude Code']) {
    const box = await card(page, name).boundingBox()
    expect(box?.width ?? 0, `${name} fits`).toBeLessThanOrEqual(width[1] ?? 0)
  }
})
