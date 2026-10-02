import { expect, test, type Locator, type Page } from '@playwright/test'

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
  await expect(codex.locator('.model-chip')).toHaveText('GPT-6.1 Sol')
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
  const claude = await open(page, 'Davide · Claude Code')
  const worker = claude.getByRole('listitem').filter({ hasText: 'worker' })
  await expect(worker.locator('.model-chip')).toHaveText('Opus 5.5') // as people say it
  await expect(worker.locator('.model-chip')).toHaveAttribute('title', 'claude-opus-5-5') // its exact id on hover
  await expect(worker.getByRole('meter', { name: 'Effort' })).toHaveAttribute('aria-valuetext', 'Ultracode')
  await page.getByRole('button', { name: 'Close' }).click()
  const luis = await open(page, 'Luis · Claude Code')
  await expect(luis.getByText('Host unknown')).toBeVisible()
  await expect(luis.getByText('Model not reported')).toBeVisible() // nothing reported, nothing made up
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
  await expect(request.getByText('Session claude-worker')).toBeVisible() // his line doesn't name it: this does
  await expect(request.getByText('Waiting', { exact: true })).toHaveCount(0) // the heading says it once
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
  await expect(request.getByText('Session claude-worker', { exact: true })).toHaveCount(0) // named once, in the line
  await expect(request.getByText('Waiting', { exact: true })).toHaveCount(0)
  await expect(request.getByRole('button', { name: /approve|allow|answer|deny/i })).toHaveCount(0)
  await expect(request.getByRole('link')).toHaveCount(0) // no safe target: none is made up
  await request.click() // seeing or touching it resolves nothing
  await expect(claude.getByRole('heading', { name: 'Waiting on you' })).toBeVisible()
  await expect(request.getByText('expires in 40 min')).toBeVisible()
  await page.evaluate(() => window.resourcesFixture?.answerRequest?.()) // answered in Claude Code
  await expect(request.getByText('Answered', { exact: true })).toBeVisible() // what it became is said
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
    'Online 1 waiting Opus 5.5 Implement the PDF retry · 2 sessions 5-hour window: 63% used, resets in 55 min',
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
  await page.goto(PAGE)
  await expect(tile(page, 'Davide · Claude Code').getByRole('meter')).not.toHaveClass(/is-warn|is-full/) // 63 %
})

test('the window’s pace: a mark for the time passed, and how long before the reset it runs out', async ({ page }) => {
  await page.goto(`${PAGE}?busy=1`)
  // Claude Code's 5-hour window, read 1 min ago with 59 min to go: 240 of its 300 minutes had passed.
  const claude = tile(page, 'Davide · Claude Code')
  await expect(claude.locator('.capacity-meter-pace')).toHaveAttribute('style', 'left: 80%;')
  await expect(claude.getByRole('meter')).toHaveAttribute(
    'aria-valuetext',
    '5-hour window: 95% used, resets in 59 min · 80% of the window passed',
  )
  // Codex reports each window's own duration, which the reading doesn't carry yet: no pace is assumed for it.
  await expect(tile(page, 'Davide · Codex').locator('.capacity-meter-pace')).toHaveCount(0)
  await open(page, 'Davide · Claude Code')
  await expect(
    capacity(page, 'Davide · Claude Code').getByText('At this pace, used up ~47 min before it resets.'),
  ).toBeVisible()
  await page.goto(PAGE) // 63 % with 81 % of the window passed: on pace, nothing said
  await open(page, 'Davide · Claude Code')
  await expect(capacity(page, 'Davide · Claude Code').locator('.capacity-pace')).toHaveCount(0)
  await expect(capacity(page, 'Davide · Claude Code').locator('.capacity-meter-pace').first()).toBeVisible()
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
  await page.goto(`${PAGE}?more=1`)
  await expect(grid(page).getByRole('button')).toHaveCount(5)
  const names = () =>
    grid(page)
      .getByRole('button')
      .evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label')))
  expect(await names()).toEqual([
    'Davide · Claude Code', // a request waits
    'Davide · Codex', // online, by owner: never ranked by how used, across providers
    'Luis · Gemini CLI', // online
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

test('each owner shows as the Studio shows a person: their picture, or their initial', async ({ page }) => {
  await page.goto(PAGE)
  await expect(tile(page, 'Davide · Codex').locator('.resource-avatar img')).toHaveAttribute('src', /^data:image\/svg/)
  await expect(tile(page, 'Luis · Claude Code').locator('.resource-avatar .avatar')).toHaveText('L')
  await open(page, 'Davide · Codex')
  await expect(sheet(page, 'Davide · Codex').locator('.resource-avatar img')).toBeVisible()
})

test('every tool has its own colour', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  const accent = (name: string) =>
    tile(page, name).evaluate((t) => getComputedStyle(t).getPropertyValue('--tool-accent').trim())
  const halo = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--halo').trim())
  const colours = await Promise.all(
    ['Davide · Codex', 'Davide · Claude Code', 'Luis · Gemini CLI', 'Davide · Grok'].map(accent),
  )
  expect(new Set(colours).size, 'four tools, four colours').toBe(4)
  expect(colours, 'none borrows the app’s lavender').not.toContain(halo)
})

test('the view opens as its viewer left it: filter and order', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await filter(page, 'Mine 2').click()
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('tool')
  // The order glides into place a frame later, and is kept once it has: reload after that, as a person would.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('sophia.resources.v1.luis')))
    .toBe(JSON.stringify({ filter: 'mine', order: 'tool' }))
  await page.reload()
  await expect(filter(page, 'Mine 2')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('tool')
  await expect(grid(page).getByRole('button')).toHaveCount(2)
  await page.goto(`${PAGE}?more=1&viewer=davide`) // another viewer keeps their own
  await expect(filter(page, 'All 5')).toHaveAttribute('aria-selected', 'true')
})

test('a resource’s sheet has its own address, to share; the address opens it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(PAGE)
  await open(page, 'Davide · Codex')
  await expect(page).toHaveURL(/#resource-davide-codex$/)
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/resources\.html#resource-davide-codex$/)
  await page.reload()
  await expect(sheet(page, 'Davide · Codex')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/#/)
  await page.goto(`${PAGE}#resource-nobody`) // an address naming no resource opens nothing
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('arrow keys move across the tiles; Tab leaves the grid in one step', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  const names = await grid(page)
    .getByRole('button')
    .evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label') ?? ''))
  const at = (i: number) => tile(page, names[i] ?? '')
  await at(0).focus()
  await page.keyboard.press('ArrowRight')
  await expect(at(1)).toBeFocused()
  await page.keyboard.press('ArrowDown') // three tiles to a row at this width
  await expect(at(4)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(at(0)).toBeFocused()
  await page.keyboard.press('End')
  await expect(at(4)).toBeFocused()
  await page.keyboard.press('ArrowRight') // the last stays the last
  await expect(at(4)).toBeFocused()
  await expect(grid(page).locator('[tabindex="0"]')).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(grid(page).getByRole('button').and(page.locator(':focus'))).toHaveCount(0)
})

test('live · ages and countdowns move on while the page is open, and a tick flashes nothing', async ({ page }) => {
  await page.clock.install()
  await page.goto(PAGE)
  const claude = tile(page, 'Davide · Claude Code')
  await expect(claude).toContainText('resets in 55 min')
  await page.clock.fastForward('01:00')
  await expect(claude).toContainText('resets in 54 min')
  // Read once, inside the time a flash would last: the words moved, not the state, so no tile says it changed.
  await page.waitForTimeout(300)
  expect(await grid(page).locator('[data-changed]').count()).toBe(0)
  await open(page, 'Davide · Codex')
  await expect(sheet(page, 'Davide · Codex').getByText('Host online')).toBeVisible()
  await expect(sheet(page, 'Davide · Codex').locator('.resource-host time')).toHaveText('3 min ago')
})

test('live · a request that comes to wait flashes its tile, says so, and counts in the tab', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(page).toHaveTitle('(1) Fixture project · Sophia') // Davide's Claude Code waits on him
  await page.evaluate(() => window.resourcesFixture?.addRequest?.())
  await expect(page).toHaveTitle('(2) Fixture project · Sophia')
  const codex = tile(page, 'Davide · Codex')
  await expect(codex).toHaveAttribute('data-changed', 'true')
  await expect(codex.getByText('1 waiting')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'waits on you' }).getByRole('button')).toHaveCount(2)
  await expect(codex).not.toHaveAttribute('data-changed') // said once, then it rests
  await expect(tile(page, 'Davide · Claude Code')).not.toHaveAttribute('data-changed') // nothing changed there
  // Another one for the same tool: the light runs along its line again.
  const sweep = () =>
    page
      .getByRole('button', { name: /2 requests wait on you|1 request waits on you Codex/ })
      .locator('.attention-label')
      .evaluate((el) => el.getAnimations()[0]?.playState ?? 'none')
  await expect.poll(sweep).toBe('finished')
  await page.evaluate(() => window.resourcesFixture?.addRequest?.())
  await expect(page.getByRole('button', { name: /2 requests wait on you/ })).toBeVisible()
  expect(await sweep()).toBe('running')
})

test('live · what waits on someone else is not counted in this viewer’s tab', async ({ page }) => {
  await page.goto(PAGE)
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await page.evaluate(() => window.resourcesFixture?.addRequest?.())
  await expect(tile(page, 'Davide · Codex').getByText('1 waiting')).toBeVisible()
  await expect(page).toHaveTitle('Fixture project · Sophia')
})

test('live · a host that goes offline flashes its tile and steps back', async ({ page }) => {
  await page.goto(PAGE)
  await page.evaluate(() => window.resourcesFixture?.setHost?.('davide-codex', 'offline'))
  const codex = tile(page, 'Davide · Codex')
  await expect(codex).toHaveAttribute('data-changed', 'true')
  await expect(codex).toHaveAttribute('data-host', 'offline')
})

test('a sheet’s address opens it once the resources are read, not only when they came first', async ({ page }) => {
  await page.goto(`${PAGE}?loading=1#resource-davide-codex`)
  await expect(page.locator('.resource-placeholders')).toBeVisible()
  await page.evaluate(() => window.resourcesFixture?.load?.())
  await expect(sheet(page, 'Davide · Codex')).toBeVisible()
})

test('a copy the browser refuses is said, with what to do instead', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
    })
  })
  await page.goto(`${PAGE}?viewer=davide`)
  await open(page, 'Davide · Claude Code')
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByRole('button', { name: 'Couldn’t copy: the link is in the address bar' })).toBeVisible()
  await page.getByRole('button', { name: 'Copy session id' }).click()
  await expect(page.getByRole('button', { name: 'Couldn’t copy: claude-worker' })).toBeVisible()
})

test('live · while the resources are read, placeholders hold their places', async ({ page }) => {
  await page.goto(`${PAGE}?loading=1`)
  const busy = page.locator('.resource-placeholders')
  await expect(busy).toHaveAttribute('aria-busy', 'true')
  await expect(busy.locator('.resource-placeholder')).toHaveCount(6)
  await expect(page.getByRole('status').filter({ hasText: 'Reading the resources…' })).toBeAttached()
  await expect(page.locator('.view-head .count')).toHaveText('–')
  await expect(page.getByRole('list', { name: 'Resources' })).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(busy.locator('.resource-placeholder > span').first()).toHaveCSS('animation-name', 'none')
})

test('each session’s model shows as people say it, in its family’s colour; none is guessed', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  const chip = (name: string) => tile(page, name).locator('.model-chip')
  await expect(chip('Davide · Claude Code')).toHaveText('Opus 5.5')
  await expect(chip('Luis · Gemini CLI')).toHaveText('Gemini 2.5 Pro')
  await expect(chip('Davide · Codex')).toHaveText('GPT-6.1 Sol')
  await expect(chip('Davide · Grok')).toHaveText('Grok 4')
  await expect(chip('Luis · Claude Code')).toHaveCount(0) // its host reported no model: none is made up
  const colour = (name: string) => chip(name).evaluate((c) => getComputedStyle(c).getPropertyValue('--model').trim())
  const colours = await Promise.all(
    ['Davide · Claude Code', 'Luis · Gemini CLI', 'Davide · Codex', 'Davide · Grok'].map(colour),
  )
  expect(new Set(colours).size, 'four families, four colours').toBe(4)
  const neutral = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim(),
  )
  expect(colours, 'a known family is never the neutral grey').not.toContain(neutral)
  await open(page, 'Davide · Claude Code')
  await expect(
    sheet(page, 'Davide · Claude Code').getByRole('listitem').filter({ hasText: 'reviewer' }).locator('.model-chip'),
  ).toHaveText('Sonnet 5.5')
})

test('each tile carries its tool’s colour along its top', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  const rim = (name: string) => tile(page, name).evaluate((t) => getComputedStyle(t).boxShadow)
  const rims = await Promise.all(['Davide · Codex', 'Davide · Claude Code', 'Luis · Gemini CLI'].map(rim))
  expect(new Set(rims).size).toBe(3)
  expect(rims[0]).toMatch(/inset/)
})

test('a window’s readings over time, in its sheet: one window, since its reset', async ({ page }) => {
  await page.goto(PAGE)
  await open(page, 'Davide · Claude Code')
  const claude = capacity(page, 'Davide · Claude Code')
  const history = claude.getByRole('img', { name: '5-hour window: 19% to 63% used, since 3 h ago' })
  await expect(history.first()).toBeVisible() // under the headline's meter
  // Counted once, in the capacity's one line of facts: no second grey line under the drawing.
  await expect(claude.locator('.capacity-meta')).toHaveText('shared by 2 sessions · 6 readings in 3 h · 1 min ago')
  await expect(claude.locator('figcaption')).toHaveCount(0)
  const meta = claude.locator('.capacity-meta')
  const lines = await meta.evaluate((el) =>
    Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
  )
  expect(lines, 'one line, in the sheet’s width').toBe(1)
  await claude.getByRole('button', { name: 'All 3 windows' }).click()
  await expect(history).toHaveCount(2) // and with its window
  await expect(claude.getByRole('img', { name: /^7-day/ })).toHaveCount(0) // its reset is due: no history drawn
  await page.keyboard.press('Escape')
  await open(page, 'Luis · Claude Code') // only the latest reading, and an unknown one: nothing to draw
  await expect(capacity(page, 'Luis · Claude Code').locator('.capacity-history')).toHaveCount(0)
})

const effortOf = (row: Locator) => row.locator('.effort')
const animationOf = (el: Locator, pseudo = '') =>
  el.evaluate((n, p) => getComputedStyle(n, p || null).animationName, pseudo)

test('each session’s effort in its tool’s own look: Claude alive in ultracode, GPT at ultra', async ({ page }) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  await open(page, 'Davide · Claude Code') // ultracode: the setting itself, the bar full and alive
  const claude = effortOf(sheet(page, 'Davide · Claude Code').getByRole('listitem').filter({ hasText: 'worker' }))
  await expect(claude).toHaveAttribute('data-look', 'claude')
  await expect(claude).toHaveAttribute('data-alive', 'true')
  await expect(claude.getByRole('meter', { name: 'Effort' })).toHaveAttribute('aria-valuenow', '5')
  await expect(claude.locator('.effort-label')).toHaveText('Ultracode') // alone: not a level beside it
  await expect(claude.getByText('High')).toHaveCount(0)
  expect(await animationOf(claude.locator('.effort-fill'))).toBe('effort-glint')
  await page.keyboard.press('Escape')
  await open(page, 'Davide · Codex') // GPT's ultra, its top level
  const codex = effortOf(sheet(page, 'Davide · Codex').getByRole('listitem').filter({ hasText: 'reviewer' }))
  await expect(codex).toHaveAttribute('data-look', 'gpt')
  await expect(codex.getByRole('meter', { name: 'Effort' })).toHaveAttribute('aria-valuetext', 'Ultra')
  expect(await animationOf(codex.locator('.effort-fill'), '::after')).toBe('effort-sparks, effort-twinkle')
  await page.keyboard.press('Escape')
  await open(page, 'Luis · Gemini CLI') // high, and no look of its own: a plain bar, still
  const gemini = effortOf(sheet(page, 'Luis · Gemini CLI').getByRole('listitem').filter({ hasText: 'worker' }))
  await expect(gemini).toHaveAttribute('data-look', 'plain')
  await expect(gemini).not.toHaveAttribute('data-alive')
  expect(await animationOf(gemini.locator('.effort-fill'))).toBe('none')
  await page.keyboard.press('Escape')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, 'Davide · Claude Code')
  expect(await animationOf(claude.locator('.effort-fill'))).toBe('none')
  expect(await animationOf(claude.locator('.effort-track'), '::after')).toBe('none')
})

test('the sheet steps through the resources as the list shows them: J, K, and its buttons', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await open(page, 'Davide · Codex')
  await page.keyboard.press('j')
  await expect(sheet(page, 'Luis · Gemini CLI')).toBeVisible() // the next tile, by attention
  await expect(page).toHaveURL(/#resource-luis-gemini$/)
  await page.keyboard.press('k')
  await page.keyboard.press('k')
  await expect(sheet(page, 'Davide · Claude Code')).toBeVisible()
  await page.keyboard.press('k') // the first steps back to the last
  await expect(sheet(page, 'Davide · Grok')).toBeVisible()
  await page.getByRole('button', { name: 'Next resource' }).click()
  await expect(sheet(page, 'Davide · Claude Code')).toBeVisible()
  await page.keyboard.press('j') // the focus stayed in the sheet when its page turned
  await expect(sheet(page, 'Davide · Codex')).toBeVisible()
  await page.keyboard.press('Escape')
  await filter(page, 'Mine 2').click() // only what the list shows
  await open(page, 'Luis · Gemini CLI')
  await page.keyboard.press('j')
  await expect(sheet(page, 'Luis · Claude Code')).toBeVisible()
  await page.keyboard.press('j')
  await expect(sheet(page, 'Luis · Gemini CLI')).toBeVisible()
  await page.keyboard.press('Escape')
  await search(page).fill('grok')
  await filter(page, 'All 1').click()
  await open(page, 'Davide · Grok') // alone: nowhere to step
  await expect(page.getByRole('button', { name: /Next resource|Previous resource/ })).toHaveCount(0)
})

test('the sheet’s head takes its tool’s light, and a meter in the red glows', async ({ page }) => {
  await page.goto(`${PAGE}?busy=1`)
  await expect(tile(page, 'Davide · Codex').locator('.capacity-meter-fill')).not.toHaveCSS('box-shadow', 'none')
  await open(page, 'Davide · Codex')
  const head = sheet(page, 'Davide · Codex').locator('.sheet-top')
  expect(await head.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/linear-gradient/)
})

test('a secret: “ultracode” typed on the view sends a wave across the tiles, once; never from a field', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1`)
  const view = page.locator('section.resources')
  await search(page).focus()
  await page.keyboard.type('ultracode') // typed, key by key, in a field: typing, nothing more
  await page.waitForTimeout(200)
  expect(await view.getAttribute('data-ultra')).toBeNull()
  await search(page).fill('')
  await search(page).blur()
  await page.keyboard.type('ultracode')
  await expect(view).toHaveAttribute('data-ultra', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Ultracode, for everyone, for a moment.' })).toBeAttached()
  expect(await animationOf(page.locator('.resource-grid'), '::after')).toBe('ultra-sweep')
  await expect(view).not.toHaveAttribute('data-ultra') // once, then it rests
  await expect(grid(page).getByRole('button')).toHaveCount(5) // and it changed nothing
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.keyboard.type('ultracode')
  await expect(view).toHaveAttribute('data-ultra', 'true') // said,
  expect(await page.locator('.resource-grid').evaluate((g) => getComputedStyle(g, '::after').display)).toBe('none') // not drawn
})

/** A tile's mark itself, the one that moves. */
const mark = (t: Locator) => t.locator('.tool-logo > *')

test('two Claude Codes side by side greet, then look at each other; hover one and the other answers', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1`)
  const davide = tile(page, 'Davide · Claude Code')
  const luis = tile(page, 'Luis · Claude Code')
  await expect(davide).not.toHaveAttribute('data-buddy') // by attention they aren't neighbours
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('tool')
  await expect(davide).toHaveAttribute('data-buddy', 'right')
  await expect(luis).toHaveAttribute('data-buddy', 'left')
  await expect(tile(page, 'Davide · Codex')).not.toHaveAttribute('data-buddy')
  expect(await animationOf(mark(davide))).toBe('buddy-hello-right')
  await davide.hover()
  await expect.poll(() => animationOf(mark(luis))).toBe('buddy-hop-left') // it answers
  await page.mouse.move(5, 700)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await animationOf(mark(davide))).toBe('none') // still: they only lean toward each other
  await davide.hover()
  expect(await animationOf(mark(luis))).toBe('none') // and the answer is still too
  expect(await mark(davide).evaluate((m) => getComputedStyle(m).transform)).not.toBe('none')
})

test('@phone · one tile to a row: no neighbours to greet', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('tool')
  // Once the order has glided into place, the two Claude Codes follow each other, a row apart: no greeting.
  await expect(grid(page).getByRole('button').nth(1)).toHaveAttribute('aria-label', 'Luis · Claude Code')
  await page.waitForTimeout(300)
  expect(await page.locator('.resource-tile[data-buddy]').count()).toBe(0)
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

test('motion · glides cut short by the next one leave no error behind', async ({ page }) => {
  await page.addInitScript(() => {
    const rejected: string[] = []
    Object.defineProperty(window, 'rejected', { get: () => rejected })
    window.addEventListener('unhandledrejection', (e) => rejected.push(String(e.reason)))
  })
  await page.goto(`${PAGE}?more=1`)
  // Every filter at once: each glide starts while the one before still runs, and cuts it short.
  await page
    .getByRole('tablist', { name: 'Show' })
    .evaluate((list) => list.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((tab) => tab.click()))
  await expect(filter(page, 'Mine 2')).toHaveAttribute('aria-selected', 'true')
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => String(Reflect.get(window, 'rejected')))).toBe('')
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
