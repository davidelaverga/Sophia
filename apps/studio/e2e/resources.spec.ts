import { expect, test, type Page } from '@playwright/test'

// LFE-06's resource checks (RES-01 … RES-03): the real ResourcePanel inside the Studio's own ProjectShell, on its
// Resources view, on the labelled simulated fixture page (fixtures/resources.html). The panel calls nothing: each check
// ends by asking the page for any request the fixture didn't expect.

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
  const session = codex.getByRole('listitem').filter({ hasText: 'Review the report pane' })
  await expect(session.getByText('Working', { exact: true })).toBeVisible()
  const controls = codex.getByRole('list', { name: 'Controls' }).getByRole('listitem')
  // Each says its state to a screen reader, and what it does in a tip.
  await expect(controls).toHaveText([
    /^✓Stop: supportedEnds its work/,
    /^✓Hold: supportedPauses its work/,
    /^–Guidance: not qualified yetSends it guidance/,
    /^–Requests: not qualified yetAnswers its tool/,
  ])
  await expect(card(page, 'Davide · Claude Code').getByText('claude-opus-5-5 · high effort')).toBeVisible()
  await expect(card(page, 'Luis · Claude Code').getByText('Host unknown')).toBeVisible()
  const age = card(page, 'Luis · Claude Code').locator('time')
  await expect(age).toHaveText('3 h ago') // the host's age, and the exact time on hover
  await expect(age).toHaveAttribute('title', 'Fri, 02 Oct 2026 09:00:00 GMT')
  await expect(page.getByRole('button', { name: /^(Stop|Hold|Steer|Guidance)$/ })).toHaveCount(0) // said, not offered
})

test('RES-01 · two sessions on one account are listed apart, and its capacity is counted once', async ({ page }) => {
  await page.goto(PAGE)
  const claude = card(page, 'Davide · Claude Code')
  await expect(claude.getByRole('list', { name: 'Sessions' }).getByRole('listitem')).toHaveCount(2)
  await expect(claude.getByRole('group', { name: 'Capacity' })).toHaveCount(1)
  await expect(capacity(page, 'Davide · Claude Code').getByText(/^shared by 2 sessions/)).toBeVisible()
})

test('RES-02 · unknown capacity stays unknown, a reset already due is pending, and providers are never added up', async ({
  page,
}) => {
  await page.goto(PAGE)
  const luis = capacity(page, 'Luis · Claude Code')
  await expect(luis.getByText('Capacity unknown')).toBeVisible()
  await expect(luis.getByText(/%/)).toHaveCount(0) // not 0 %, not 100 %
  await expect(luis.getByText('Not reported: rate limits.')).toBeVisible()

  const claude = capacity(page, 'Davide · Claude Code')
  await expect(claude.getByText('5-hour window: 63% used, resets in 55 min')).toBeVisible()
  await claude.getByRole('button', { name: 'All 3 windows' }).click()
  await expect(claude.getByText('Refresh pending')).toBeVisible()
  await expect(claude.getByText('reset was due 1 h ago')).toBeVisible()
  await expect(claude.getByText('71%')).toHaveCount(0) // a due window's old value is not shown as capacity

  await expect(capacity(page, 'Davide · Codex').getByText(/20% kept back/)).toBeVisible() // reserve apart
  await expect(page.getByText(/total|combined|overall/i)).toHaveCount(0)
  await expect(claude.getByText('88% used · may not apply here')).toBeVisible() // shown, and not the headline
})

test('RES-02 · a reading past its valid_until is unknown, with its age, and its windows say expired', async ({
  page,
}) => {
  await page.goto(`${PAGE}?stale=1`)
  const codex = capacity(page, 'Davide · Codex')
  await expect(codex.getByText('Capacity unknown: the last reading expired 10 min ago')).toBeVisible()
  await codex.getByRole('button', { name: 'All 2 windows' }).click()
  await expect(codex.getByText('Expired', { exact: true })).toHaveCount(2)
  await expect(codex.getByRole('meter')).toHaveCount(0) // nothing drawn from an expired reading
  await expect(codex.getByText(/\d+% used/)).toHaveCount(0) // the old values are not capacity
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

test('what waits on an owner comes first, and a card with one brings the focus to it', async ({ page }) => {
  await page.goto(PAGE)
  await expect(page.getByText('2 hosts online · 1 request waiting')).toBeVisible()
  const requests = page.getByRole('complementary', { name: 'Waiting on an owner' })
  const first = await card(page, 'Davide · Codex').boundingBox()
  expect((await requests.boundingBox())?.y ?? Infinity, 'above the cards').toBeLessThan(first?.y ?? 0)
  await card(page, 'Davide · Claude Code').getByRole('button', { name: '1 request waiting' }).click()
  await expect(requests.getByRole('listitem').filter({ hasText: 'Run a shell command' })).toBeFocused()
  await expect(card(page, 'Davide · Codex').getByRole('button', { name: /request/ })).toHaveCount(0) // none waiting
})

test('a meter is drawn only for a percentage known to apply', async ({ page }) => {
  await page.goto(PAGE)
  const meter = capacity(page, 'Davide · Claude Code').getByRole('meter', { name: '5-hour window' })
  await expect(meter).toHaveAttribute('aria-valuenow', '63')
  await expect(capacity(page, 'Luis · Claude Code').getByRole('meter')).toHaveCount(0)
  await capacity(page, 'Davide · Claude Code').getByRole('button', { name: 'All 3 windows' }).click()
  await expect(capacity(page, 'Davide · Claude Code').getByRole('meter')).toHaveCount(2) // the 88 % that may not apply has none
})

test('the viewer’s own resource says so', async ({ page }) => {
  await page.goto(PAGE)
  await expect(card(page, 'Luis · Claude Code').getByText('You', { exact: true })).toBeVisible()
  await expect(card(page, 'Davide · Codex').getByText('You', { exact: true })).toHaveCount(0)
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(card(page, 'Davide · Codex').getByText('You', { exact: true })).toBeVisible()
})

test('each resource shows its tool’s own mark, name and maker', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  const marks = {
    'Davide · Codex': ['codex', 'OpenAI'],
    'Davide · Claude Code': ['claude-code', 'Anthropic'],
    'Luis · Claude Code': ['claude-code', 'Anthropic'],
    'Davide · Grok': ['grok', 'xAI'],
    'Luis · Gemini CLI': ['gemini-cli', 'Google'],
  } as const
  for (const [name, [tool, vendor]] of Object.entries(marks)) {
    const head = card(page, name)
    await expect(head.locator(`.tool-logo[data-tool="${tool}"]`)).toBeVisible()
    await expect(head.getByText(vendor, { exact: true })).toBeVisible()
  }
  // A coloured mark is an image; a one-colour mark (Grok) takes the text's colour, so it reads on the dark theme.
  await expect(card(page, 'Davide · Codex').locator('.tool-logo img')).toHaveAttribute('src', /\.svg|^data:image\/svg/)
  await expect(card(page, 'Davide · Grok').locator('.tool-logo-mark')).toBeVisible()
})

test('a balance heads its capacity as a count, with no meter and no unknown track', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  const gemini = capacity(page, 'Luis · Gemini CLI')
  await expect(gemini.getByText('Daily requests: 820 credits left, resets in 9 h')).toBeVisible()
  await expect(gemini.getByRole('meter')).toHaveCount(0)
  await expect(gemini.locator('.capacity-meter')).toHaveCount(0)
  await expect(gemini.getByRole('button', { name: 'Show window' })).toBeVisible()
  await expect(capacity(page, 'Davide · Grok').getByText('Capacity unknown')).toBeVisible()
  await expect(capacity(page, 'Davide · Grok').locator('.capacity-meter.is-unknown')).toHaveCount(1)
})

test('the owner copies the session’s id to find it in the native tool; no one else is offered it', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`${PAGE}?viewer=davide`)
  const copy = page.getByRole('button', { name: 'Copy session id' })
  await copy.click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('claude-worker')
  await expect(page.getByRole('button', { name: 'Copy session id' })).toBeVisible() // it says so for a moment
  await page.goto(PAGE)
  await expect(page.getByRole('button', { name: /Copy session id|Copied/ })).toHaveCount(0)
})

test('with nothing waiting, the column says so and no row points anywhere', async ({ page }) => {
  await page.goto(`${PAGE}?quiet=1`)
  const column = page.getByRole('complementary', { name: 'Waiting on an owner' })
  await expect(column.getByText('Nothing is waiting on an owner.')).toBeVisible()
  await expect(page.getByRole('button', { name: /request/ })).toHaveCount(0)
  await expect(page.getByText('2 hosts online · nothing waiting')).toBeVisible()
})

test('the windows open and close by keyboard', async ({ page }) => {
  await page.goto(PAGE)
  const toggle = capacity(page, 'Davide · Codex').getByRole('button', { name: 'All 2 windows' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(capacity(page, 'Davide · Codex').getByRole('button', { name: 'Hide windows' })).toHaveAttribute(
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
