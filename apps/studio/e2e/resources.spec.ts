import { expect, test, type Page } from '@playwright/test'

// LFE-06's resource checks (RES-01 … RES-03): the real ResourcePanel inside the Studio's own ProjectShell, on its
// Resources view, on the labelled simulated fixture page (fixtures/resources.html). Each resource is a tile; its
// detail opens in a sheet. The panel calls nothing: each check ends by asking the page for any request the fixture
// didn't expect.

const PAGE = '/resources.html'

const grid = (page: Page) => page.getByRole('list', { name: 'Resources' })
const tile = (page: Page, name: string) => grid(page).getByRole('button', { name, exact: true })
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name })
async function open(page: Page, name: string) {
  await tile(page, name).click()
  await expect(sheet(page, name)).toBeVisible()
  return sheet(page, name)
}
const capacity = (page: Page, name: string) => sheet(page, name).getByRole('group', { name: 'Capacity' })
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search resources' })
const filter = (page: Page, name: string) => page.getByRole('tablist', { name: 'Show' }).getByRole('tab', { name })

/** Counts the glides the page starts (View Transitions), on the page itself. */
async function countGlides(page: Page) {
  await page.addInitScript(() => {
    const original = document.startViewTransition.bind(document)
    let count = 0
    Object.defineProperty(window, 'glides', { get: () => count })
    Object.defineProperty(document, 'startViewTransition', {
      value: (...args: Parameters<typeof original>) => {
        count += 1
        return original(...args)
      },
    })
  })
}
const glides = (page: Page) => page.evaluate(() => Number(Reflect.get(window, 'glides')))
const animation = (page: Page, selector: string, pseudo = '') =>
  page
    .locator(selector)
    .first()
    .evaluate((el, p) => getComputedStyle(el, p || null).animationName, pseudo)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.resourcesFixture?.unexpected ?? []), 'requests the panel made').toEqual([])
})

test('LFE-06.1 · the three enrollments as tiles; a sheet holds the owner, host, sessions and supported controls', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(grid(page).getByRole('button')).toHaveCount(3)
  await expect(tile(page, 'Davide · Codex')).toContainText('Online')
  await expect(tile(page, 'Davide · Codex')).toContainText('Review the report pane') // what it does, on the tile
  const codex = await open(page, 'Davide · Codex')
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
  await expect(codex.getByRole('button', { name: /^(Stop|Hold|Steer|Guidance)$/ })).toHaveCount(0) // said, not offered
  await page.keyboard.press('Escape')
  await expect(tile(page, 'Davide · Codex')).toBeFocused() // back where it was opened
  await expect((await open(page, 'Davide · Claude Code')).getByText('claude-opus-5-5 · high effort')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  const luis = await open(page, 'Luis · Claude Code')
  await expect(luis.getByText('Host unknown')).toBeVisible()
  const age = luis.locator('time')
  await expect(age).toHaveText('3 h ago') // the host's age, and the exact time on hover
  await expect(age).toHaveAttribute('title', 'Fri, 02 Oct 2026 09:00:00 GMT')
})

test('RES-01 · two sessions on one account are listed apart, and its capacity is counted once', async ({ page }) => {
  await page.goto(PAGE)
  await expect(tile(page, 'Davide · Claude Code')).toContainText('Implement the PDF retry · 2 sessions')
  const claude = await open(page, 'Davide · Claude Code')
  await expect(claude.getByRole('list', { name: 'Sessions' }).getByRole('listitem')).toHaveCount(2)
  await expect(claude.getByRole('group', { name: 'Capacity' })).toHaveCount(1)
  await expect(capacity(page, 'Davide · Claude Code').getByText(/^shared by 2 sessions/)).toBeVisible()
})

test('RES-02 · unknown capacity stays unknown, a reset already due is pending, and providers are never added up', async ({
  page,
}) => {
  await page.goto(PAGE)
  await expect(tile(page, 'Luis · Claude Code')).toContainText('Capacity unknown')
  await expect(tile(page, 'Luis · Claude Code').getByText(/%/)).toHaveCount(0)
  await open(page, 'Luis · Claude Code')
  const luis = capacity(page, 'Luis · Claude Code')
  await expect(luis.getByText('Capacity unknown')).toBeVisible()
  await expect(luis.getByText(/%/)).toHaveCount(0) // not 0 %, not 100 %
  await expect(luis.getByText('Not reported: rate limits.')).toBeVisible()
  await page.keyboard.press('Escape')

  await open(page, 'Davide · Claude Code')
  const claude = capacity(page, 'Davide · Claude Code')
  await expect(claude.getByText('5-hour window: 63% used, resets in 55 min')).toBeVisible()
  await claude.getByRole('button', { name: 'All 3 windows' }).click()
  await expect(claude.getByText('Refresh pending')).toBeVisible()
  await expect(claude.getByText('reset was due 1 h ago')).toBeVisible()
  await expect(claude.getByText('71%')).toHaveCount(0) // a due window's old value is not shown as capacity
  await expect(claude.getByText('88% used · may not apply here')).toBeVisible() // shown, and not the headline
  await expect(page.getByText(/total|combined|overall/i)).toHaveCount(0)
  await page.keyboard.press('Escape')

  await open(page, 'Davide · Codex')
  await expect(capacity(page, 'Davide · Codex').getByText(/20% kept back/)).toBeVisible() // reserve apart
})

test('RES-02 · a reading past its valid_until is unknown, with its age, and its windows say expired', async ({
  page,
}) => {
  await page.goto(`${PAGE}?stale=1`)
  await expect(tile(page, 'Davide · Codex').getByRole('meter')).toHaveCount(0)
  await open(page, 'Davide · Codex')
  const codex = capacity(page, 'Davide · Codex')
  await expect(codex.getByText('Capacity unknown: the last reading expired 10 min ago')).toBeVisible()
  await codex.getByRole('button', { name: 'All 2 windows' }).click()
  await expect(codex.getByText('Expired', { exact: true })).toHaveCount(2)
  await expect(codex.getByRole('meter')).toHaveCount(0) // nothing drawn from an expired reading
  await expect(codex.getByText(/\d+% used/)).toHaveCount(0) // the old values are not capacity
})

test('RES-03 · Luis sees Davide’s request and who answers it, with nothing to press', async ({ page }) => {
  await page.goto(PAGE)
  const claude = await open(page, 'Davide · Claude Code')
  await expect(claude.getByRole('heading', { name: 'Waiting on Davide' })).toBeVisible()
  const request = claude.getByRole('listitem').filter({ hasText: 'Run a shell command' })
  await expect(request.getByText('Session claude-worker')).toBeVisible()
  await expect(request.getByText('Waiting')).toBeVisible()
  await expect(request.getByText('expires in 40 min')).toBeVisible()
  await expect(request.getByText('Only Davide can answer this, in Claude Code.')).toBeVisible()
  await expect(request.getByRole('button')).toHaveCount(0)
  await expect(request.getByRole('link')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await open(page, 'Davide · Codex') // another resource of the same owner holds none of it
  await expect(page.getByRole('heading', { name: /Waiting on/ })).toHaveCount(0)
})

test('RES-03 · Davide is told where to answer it, and the page still answers nothing', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const claude = await open(page, 'Davide · Claude Code')
  await expect(claude.getByRole('heading', { name: 'Waiting on you' })).toBeVisible()
  const request = claude.getByRole('listitem').filter({ hasText: 'Run a shell command' })
  await expect(request.getByText('Answer it in Claude Code, session claude-worker.')).toBeVisible()
  await expect(request.getByRole('button', { name: /approve|allow|answer|deny/i })).toHaveCount(0)
  await expect(request.getByRole('link')).toHaveCount(0) // no safe target: none is made up
  await request.click() // seeing or touching it resolves nothing
  await expect(request.getByText('Waiting')).toBeVisible()
})

test('what waits on an owner is one line on top, and it opens that resource', async ({ page }) => {
  await page.goto(PAGE)
  await expect(page.getByText('2 hosts online · 1 request waiting')).toBeVisible()
  const line = page.getByRole('button', { name: /1 request waits on Davide/ })
  const first = await tile(page, 'Davide · Codex').boundingBox()
  expect((await line.boundingBox())?.y ?? Infinity, 'above the tiles').toBeLessThan(first?.y ?? 0)
  await expect(tile(page, 'Davide · Claude Code').getByText('1 waiting')).toBeVisible()
  // A screen reader hears the tile's lines, not only whose it is.
  await expect(tile(page, 'Davide · Claude Code')).toHaveAccessibleDescription(
    'Online 1 waiting Implement the PDF retry · 2 sessions 5-hour window: 63% used, resets in 55 min',
  )
  await expect(tile(page, 'Luis · Claude Code')).toHaveAccessibleDescription(
    'Unknown You No assignment Capacity unknown',
  )
  await expect(tile(page, 'Davide · Codex').getByText(/waiting/)).toHaveCount(0) // none waiting
  await line.click()
  await expect(sheet(page, 'Davide · Claude Code').getByText('Run a shell command', { exact: false })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(line).toBeFocused()
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(page.getByRole('button', { name: /1 request waits on you/ })).toBeVisible()
})

test('with nothing waiting, nothing is said on top and no tile says it waits', async ({ page }) => {
  await page.goto(`${PAGE}?quiet=1`)
  await expect(page.getByRole('button', { name: /waits? on/ })).toHaveCount(0)
  await expect(grid(page).getByText(/waiting/)).toHaveCount(0)
  await expect(page.getByText('2 hosts online · nothing waiting')).toBeVisible()
  await open(page, 'Davide · Claude Code')
  await expect(page.getByRole('heading', { name: /Waiting on/ })).toHaveCount(0)
})

test('the search finds by tool, owner or work, "/" reaches it, and Escape clears it', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await expect(search(page)).toHaveAttribute('aria-keyshortcuts', '/') // and its tip shows the key
  await page.keyboard.press('/')
  await expect(search(page)).toBeFocused()
  await page.keyboard.type('gemini')
  await expect(grid(page).getByRole('button')).toHaveText([/Gemini CLI/])
  await search(page).fill('davide pdf')
  await expect(grid(page).getByRole('button')).toHaveCount(1)
  await expect(tile(page, 'Davide · Claude Code')).toBeVisible()
  await expect(page.getByText('1 of 5 resources shown')).toBeAttached() // said to a screen reader
  await search(page).fill('zzz')
  await expect(page.getByText('Nothing matches “zzz”')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(grid(page).getByRole('button')).toHaveCount(5)
  await search(page).fill('luis')
  await search(page).press('Escape')
  await expect(search(page)).toHaveValue('')
  await expect(grid(page).getByRole('button')).toHaveCount(5)
  await search(page).press('Escape') // empty, Escape leaves it
  await expect(search(page)).not.toBeFocused()
})

test('the filters count what they hold, follow the search, and move by arrow keys', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await expect(filter(page, 'All 5')).toHaveAttribute('aria-selected', 'true')
  await expect(filter(page, 'Waiting 1')).toBeVisible()
  await expect(filter(page, 'Online 3')).toBeVisible()
  await expect(filter(page, 'Mine 2')).toBeVisible()
  await filter(page, 'Mine 2').click()
  await expect(grid(page).getByRole('button')).toHaveCount(2)
  await page.keyboard.press('ArrowLeft')
  await expect(filter(page, 'Online 3')).toBeFocused()
  await expect(grid(page).getByRole('button')).toHaveCount(3)
  await search(page).fill('codex')
  await expect(filter(page, 'All 1')).toBeVisible() // the counts follow the search
  await filter(page, 'Waiting 0').click()
  await expect(page.getByText('Nothing matches “codex”')).toBeVisible()
  await page.getByRole('button', { name: 'Show all' }).click()
  await expect(tile(page, 'Davide · Codex')).toBeVisible()
})

test('a meter is drawn only for a percentage known to apply', async ({ page }) => {
  await page.goto(PAGE)
  await expect(tile(page, 'Davide · Claude Code').getByRole('meter', { name: '5-hour window' })).toHaveAttribute(
    'aria-valuenow',
    '63',
  )
  await expect(tile(page, 'Luis · Claude Code').getByRole('meter')).toHaveCount(0)
  await open(page, 'Davide · Claude Code')
  const claude = capacity(page, 'Davide · Claude Code')
  await expect(claude.getByRole('meter', { name: '5-hour window' })).toHaveAttribute('aria-valuenow', '63')
  await claude.getByRole('button', { name: 'All 3 windows' }).click()
  await expect(claude.getByRole('meter')).toHaveCount(2) // the 88 % that may not apply has none
})

/** A theme colour (#rrggbb) as the browser computes it. */
const rgb = (hex = '') => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

test('a meter turns amber from 75 % used and red from 90 %', async ({ page }) => {
  await page.goto(`${PAGE}?busy=1`)
  await expect(tile(page, 'Davide · Codex').getByRole('meter')).toHaveClass(/is-full/) // the 92 % heads it
  await expect(tile(page, 'Davide · Claude Code').getByRole('meter')).not.toHaveClass(/is-warn|is-full/) // 63 %
  await open(page, 'Davide · Codex')
  const codex = capacity(page, 'Davide · Codex')
  await codex.getByRole('button', { name: 'All 2 windows' }).click()
  const fill = (name: string) =>
    codex
      .getByRole('meter', { name })
      .last() // the window's own, under the headline's
      .locator('.capacity-meter-fill')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
  const [rose, amber] = await page.evaluate(() =>
    ['--rose', '--amber'].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()),
  )
  expect(await fill('5-hour window')).toBe(rgb(rose))
  expect(await fill('7-day window')).toBe(rgb(amber))
})

test('the window’s pace: a mark for the time passed, and how long before the reset it runs out', async ({ page }) => {
  await page.goto(`${PAGE}?busy=1`)
  // Codex's 5-hour window, read 2 min ago with 40 min to go: 258 of its 300 minutes had passed.
  const mark = tile(page, 'Davide · Codex').locator('.capacity-meter-pace')
  await expect(mark).toHaveAttribute('style', 'left: 86%;')
  await expect(tile(page, 'Davide · Codex').getByRole('meter')).toHaveAttribute(
    'aria-valuetext',
    '5-hour window: 92% used, resets in 40 min · 86% of the window passed',
  )
  await open(page, 'Davide · Codex')
  await expect(
    capacity(page, 'Davide · Codex').getByText('At this pace, used up ~20 min before it resets.'),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await open(page, 'Davide · Claude Code') // 63 % with 82 % of the window passed: on pace, nothing said
  await expect(capacity(page, 'Davide · Claude Code').getByText(/At this pace/)).toHaveCount(0)
  await expect(capacity(page, 'Davide · Claude Code').locator('.capacity-pace')).toHaveCount(0)
})

test('a spend limit passed keeps its meter’s range true', async ({ page }) => {
  await page.goto(`${PAGE}?spent=1`)
  const meter = tile(page, 'Davide · Codex').getByRole('meter', { name: 'Spend limit window' })
  await expect(meter).toHaveAttribute('aria-valuenow', '120')
  await expect(meter).toHaveAttribute('aria-valuemax', '120')
  await expect(meter.locator('.capacity-meter-pace')).toHaveCount(0) // a spend limit's length isn't known: no mark
})

test('by attention, what needs someone comes first; a waiting tile stands out, an offline one steps back', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1&busy=1`)
  await expect(grid(page).getByRole('button')).toHaveCount(5)
  const names = () =>
    grid(page)
      .getByRole('button')
      .evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label')))
  expect(await names()).toEqual([
    'Davide · Claude Code', // a request waits: first, though Codex is more used
    'Davide · Codex', // online, 92 % used
    'Luis · Gemini CLI', // online, a balance
    'Luis · Claude Code', // host unknown
    'Davide · Grok', // offline
  ])
  const grok = tile(page, 'Davide · Grok')
  await expect(grok).toContainText('Offline · 26 h')
  await expect(grok.locator('.tool-logo')).toHaveCSS('filter', 'grayscale(1)')
  await expect(tile(page, 'Davide · Codex').locator('.tool-logo')).toHaveCSS('filter', 'none')
  const edge = (name: string) => tile(page, name).evaluate((t) => getComputedStyle(t).borderTopColor)
  expect(await edge('Davide · Claude Code'), 'the waiting tile’s edge').not.toBe(await edge('Davide · Codex'))
})

test('the tiles sort by owner or by tool, and glide there', async ({ page }) => {
  await countGlides(page)
  await page.goto(`${PAGE}?more=1`)
  const names = () =>
    grid(page)
      .getByRole('button')
      .evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label')))
  const sort = page.getByRole('combobox', { name: 'Sort' })
  await sort.selectOption('owner')
  await expect
    .poll(names)
    .toEqual(['Davide · Claude Code', 'Davide · Codex', 'Davide · Grok', 'Luis · Claude Code', 'Luis · Gemini CLI'])
  await sort.selectOption('tool')
  await expect
    .poll(names)
    .toEqual(['Davide · Claude Code', 'Luis · Claude Code', 'Davide · Codex', 'Luis · Gemini CLI', 'Davide · Grok'])
  expect(await glides(page)).toBe(2)
})

test('the viewer’s own resource says so', async ({ page }) => {
  await page.goto(PAGE)
  await expect(tile(page, 'Luis · Claude Code').getByText('You', { exact: true })).toBeVisible()
  await expect(tile(page, 'Davide · Codex').getByText('You', { exact: true })).toHaveCount(0)
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(tile(page, 'Davide · Codex').getByText('You', { exact: true })).toBeVisible()
})

test('each resource shows its tool’s own mark, and its sheet the maker', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  const marks = {
    'Davide · Codex': ['codex', 'OpenAI'],
    'Davide · Claude Code': ['claude-code', 'Anthropic'],
    'Luis · Claude Code': ['claude-code', 'Anthropic'],
    'Davide · Grok': ['grok', 'xAI'],
    'Luis · Gemini CLI': ['gemini-cli', 'Google'],
  } as const
  for (const [name, [tool, vendor]] of Object.entries(marks)) {
    await expect(tile(page, name).locator(`.tool-logo[data-tool="${tool}"]`)).toBeVisible()
    await expect((await open(page, name)).getByText(vendor, { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
  }
  // A coloured mark is an image; a one-colour mark (Grok) takes the text's colour, so it reads on the dark theme.
  await expect(tile(page, 'Davide · Codex').locator('.tool-logo img')).toHaveAttribute('src', /\.svg|^data:image\/svg/)
  await expect(tile(page, 'Davide · Grok').locator('.tool-logo-mark')).toBeVisible()
})

test('a balance heads its capacity as a count, with no meter and no unknown track', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await expect(tile(page, 'Luis · Gemini CLI').locator('.capacity-meter')).toHaveCount(0)
  await open(page, 'Luis · Gemini CLI')
  const gemini = capacity(page, 'Luis · Gemini CLI')
  await expect(gemini.getByText('Daily requests: 820 credits left, resets in 9 h')).toBeVisible()
  await expect(gemini.getByRole('meter')).toHaveCount(0)
  await expect(gemini.locator('.capacity-meter')).toHaveCount(0)
  await expect(gemini.getByRole('button', { name: 'Show window' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tile(page, 'Davide · Grok')).toContainText('Capacity unknown')
  await expect(tile(page, 'Davide · Grok').locator('.capacity-meter.is-unknown')).toHaveCount(1)
})

test('the owner copies the session’s id to find it in the native tool; no one else is offered it', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`${PAGE}?viewer=davide`)
  await open(page, 'Davide · Claude Code')
  const copy = page.getByRole('button', { name: 'Copy session id' })
  await copy.click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('claude-worker')
  await expect(page.getByRole('button', { name: 'Copy session id' })).toBeVisible() // it says so for a moment
  await page.goto(PAGE)
  await open(page, 'Davide · Claude Code')
  await expect(page.getByRole('button', { name: /Copy session id|Copied/ })).toHaveCount(0)
})

test('the sheet works by keyboard: Enter opens it, its windows toggle, Escape returns to the tile', async ({
  page,
}) => {
  await page.goto(PAGE)
  await tile(page, 'Davide · Codex').focus()
  await page.keyboard.press('Enter')
  await expect(sheet(page, 'Davide · Codex')).toBeFocused()
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
  await page.keyboard.press('/') // the page behind takes no keys
  await expect(search(page)).not.toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet(page, 'Davide · Codex')).toHaveCount(0)
  await expect(tile(page, 'Davide · Codex')).toBeFocused()
})

test('@phone · every tile and the sheet read at a phone’s width, with nothing off the side', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(width[0], 'no sideways scroll').toBe(width[1])
  for (const name of ['Davide · Codex', 'Davide · Claude Code', 'Luis · Claude Code', 'Luis · Gemini CLI']) {
    const box = await tile(page, name).boundingBox()
    expect(box?.width ?? 0, `${name} fits`).toBeLessThanOrEqual(width[1] ?? 0)
  }
  const box = await (await open(page, 'Davide · Claude Code')).boundingBox()
  expect(box?.width ?? 0, 'the sheet fits').toBeLessThanOrEqual(width[1] ?? 0)
})

test('motion · a filter glides the tiles to their places; typing a search moves nothing', async ({ page }) => {
  await countGlides(page)
  await page.goto(`${PAGE}?more=1`)
  await filter(page, 'Mine 2').click()
  await expect(grid(page).getByRole('button')).toHaveCount(2)
  expect(await glides(page)).toBe(1)
  await search(page).fill('luis')
  expect(await glides(page)).toBe(1)
  const names = await grid(page)
    .getByRole('listitem')
    .evaluateAll((items) => items.map((li) => getComputedStyle(li).viewTransitionName))
  expect(new Set(names).size, 'one name per tile').toBe(names.length)
})

test('motion · tiles arrive one after another, meters fill, and what waits keeps a pulse', async ({ page }) => {
  await page.goto(PAGE)
  const delays = await grid(page)
    .getByRole('button')
    .evaluateAll((tiles) => tiles.map((t) => getComputedStyle(t).animationDelay))
  expect(delays).toEqual(['0s', '0.04s', '0.08s'])
  expect(await animation(page, '.capacity-meter-fill')).toBe('meter-fill')
  expect(await animation(page, '.attention-dot', '::after')).toBe('waiting-ping')
  expect(await animation(page, '.attention-label')).toBe('attention-sweep')
})

test('motion · a tile’s light follows the pointer', async ({ page }) => {
  await page.goto(PAGE)
  const codex = tile(page, 'Davide · Codex')
  const light = () => codex.evaluate((el) => ['--mx', '--my'].map((v) => parseFloat(el.style.getPropertyValue(v))))
  await codex.hover() // the tile lifts under the pointer: measure once it has
  await codex.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const { x, y } = (await codex.boundingBox()) ?? { x: 0, y: 0 }
  await page.mouse.move(x + 30, y + 20)
  const [x1 = 0, y1 = 0] = await light()
  await page.mouse.move(x + 70, y + 45)
  const [x2 = 0, y2 = 0] = await light()
  expect(Math.abs(x1 - 30), 'where the pointer is').toBeLessThanOrEqual(1)
  expect(Math.abs(y1 - 20)).toBeLessThanOrEqual(1)
  expect(Math.abs(x2 - x1 - 40), 'and it follows').toBeLessThanOrEqual(1)
  expect(Math.abs(y2 - y1 - 25)).toBeLessThanOrEqual(1)
})

test('motion · with less motion asked for, the same changes come at once and nothing keeps moving', async ({
  page,
}) => {
  await countGlides(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${PAGE}?more=1`)
  expect(await animation(page, '.resource-tile')).toBe('none')
  expect(await animation(page, '.capacity-meter-fill')).toBe('none')
  expect(await animation(page, '.attention-dot', '::after')).toBe('none')
  expect(await animation(page, '.attention-label')).toBe('none')
  await filter(page, 'Mine 2').click()
  await expect(grid(page).getByRole('button')).toHaveCount(2)
  expect(await glides(page)).toBe(0)
  await open(page, 'Luis · Gemini CLI')
  const chevron = capacity(page, 'Luis · Gemini CLI').locator('.capacity-toggle .icon')
  await expect(chevron).toHaveCSS('transition-duration', '0s') // the windows' chevron turns at once
})
