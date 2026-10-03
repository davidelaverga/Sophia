import { expect, test, type Locator, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

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
/** Whether a press `by` px above an element still reaches it (its touch target, past what it draws). */
const reaches = (l: Locator, by: number) =>
  l.evaluate((e, dy) => {
    const r = e.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top - dy)
    return Boolean(hit && (hit === e || e.contains(hit)))
  }, by)
const leftOf = (l: Locator) => l.evaluate((e) => e.getBoundingClientRect().left)
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
  await claude.getByRole('button', { name: '2 more windows' }).click()
  await expect(claude.locator('.capacity-windows dt')).toHaveText(['7-day', '7-day, one model']) // not the headline's again
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
    /^Online 1 waiting Opus 5\.5 Implement the PDF retry · 2 sessions Asked to run pnpm --filter @sophia\/report test \d+ s ago 5-hour window: 63% used, resets in 55 min$/,
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
  await claude.getByRole('button', { name: '2 more windows' }).click()
  await expect(claude.getByRole('meter')).toHaveCount(1) // the headline's only: the due one and the 88 % that may not apply have none
})

/** A theme colour (#rrggbb) as the browser computes it. */
const rgb = (hex = '') => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

test('a meter turns amber from 75 % used and red from 90 %', async ({ page }) => {
  await page.goto(`${PAGE}?busy=1`)
  await expect(tile(page, 'Davide · Codex').getByRole('meter')).toHaveClass(/is-full/) // the 92 % heads it
  await open(page, 'Davide · Codex')
  const codex = capacity(page, 'Davide · Codex')
  await codex.getByRole('button', { name: '1 more window' }).click()
  const fill = (name: string) =>
    codex
      .getByRole('meter', { name })
      .last()
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

/** The Sort menu's button, which says the order in use. */
const sortButton = (page: Page) => page.getByRole('button', { name: /^Sort/ })
/** Chooses an order from the Sort menu, as a person would. */
async function sortBy(page: Page, label: string) {
  await sortButton(page).click()
  await page.getByRole('menuitemradio', { name: label }).click()
}

test('the tiles sort by owner or by tool, and glide there', async ({ page }) => {
  await countGlides(page)
  await page.goto(`${PAGE}?more=1`)
  const names = () =>
    grid(page)
      .getByRole('button')
      .evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label')))
  await sortBy(page, 'Owner')
  await expect
    .poll(names)
    .toEqual(['Davide · Claude Code', 'Davide · Codex', 'Davide · Grok', 'Luis · Claude Code', 'Luis · Gemini CLI'])
  await sortBy(page, 'Tool')
  await expect
    .poll(names)
    .toEqual(['Davide · Claude Code', 'Luis · Claude Code', 'Davide · Codex', 'Luis · Gemini CLI', 'Davide · Grok'])
  expect(await glides(page)).toBe(2)
})

test('Sort is a menu in the app’s look: it opens on the order in use, keys move and choose, Escape gives back', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1`)
  await expect(sortButton(page)).toHaveText('SortAttention')
  await sortButton(page).click()
  const menu = page.getByRole('menu', { name: 'Sort' })
  await expect(menu).toHaveCSS('background-color', 'rgb(18, 17, 24)') // the app's raised plane (--plane-2)
  await expect(menu.getByRole('menuitemradio', { name: 'Attention' })).toBeFocused() // on the order in use
  await expect(menu.getByRole('menuitemradio', { name: 'Attention' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitemradio', { name: 'Tool' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  await expect(sortButton(page)).toHaveText('SortTool')
  await expect(sortButton(page)).toBeFocused()
  await sortButton(page).click()
  await expect(page.getByRole('menuitemradio', { name: 'Tool' })).toBeFocused() // opens on the order now in use
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(sortButton(page)).toBeFocused()
  await sortButton(page).click()
  // Over the tiles: what is drawn at its items' middle is the menu itself.
  const over = await page.getByRole('menuitemradio', { name: 'Custom' }).evaluate((item) => {
    const b = item.getBoundingClientRect()
    return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('[role="menu"]') !== null
  })
  expect(over).toBe(true)
  await page.mouse.click(5, 700) // a press anywhere else closes it
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(sortButton(page)).toHaveText('SortTool')
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
  await sortBy(page, 'Tool')
  // The order glides into place a frame later, and is kept once it has: reload after that, as a person would.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('sophia.resources.v1.luis')))
    .toBe(JSON.stringify({ filter: 'mine', order: 'tool', custom: [] }))
  await page.reload()
  await expect(filter(page, 'Mine 2')).toHaveAttribute('aria-selected', 'true')
  await expect(sortButton(page)).toHaveText('SortTool')
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
  // A fresh load (a query the page ignores, so only the fragment's resource is new): an address naming none opens nothing.
  await page.goto(`${PAGE}?fresh=1#resource-nobody`)
  await expect(grid(page).getByRole('button')).toHaveCount(3)
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
  await claude.getByRole('button', { name: '2 more windows' }).click()
  await expect(history).toHaveCount(1) // drawn once: the list doesn't repeat the headline's window
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
  await sortBy(page, 'Tool')
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
  await sortBy(page, 'Tool')
  // Once the order has glided into place, the two Claude Codes follow each other, a row apart: no greeting.
  await expect(grid(page).getByRole('button').nth(1)).toHaveAttribute('aria-label', 'Luis · Claude Code')
  await page.waitForTimeout(300)
  expect(await page.locator('.resource-tile[data-buddy]').count()).toBe(0)
})

/** The tiles' names, in the order the grid shows them. */
const order = (page: Page) =>
  grid(page)
    .getByRole('button')
    .evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label')))

test('a tile dragged onto another takes its place, in the viewer’s own order, kept', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await tile(page, 'Luis · Claude Code').dragTo(tile(page, 'Davide · Codex'))
  await expect
    .poll(() => order(page))
    .toEqual(['Davide · Claude Code', 'Luis · Claude Code', 'Davide · Codex', 'Luis · Gemini CLI', 'Davide · Grok'])
  await expect(sortButton(page)).toHaveText('SortCustom')
  await expect(page.getByRole('status').filter({ hasText: 'Moved Luis · Claude Code to 2 of 5' })).toBeAttached()
  await expect(tile(page, 'Davide · Claude Code')).toHaveAttribute('data-buddy', 'right') // brought together, they greet
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('sophia.resources.v1.luis')))
    .toContain('"custom":["davide-claude","luis-claude","davide-codex","luis-gemini","davide-grok"]')
  await page.reload()
  await expect
    .poll(() => order(page))
    .toEqual(['Davide · Claude Code', 'Luis · Claude Code', 'Davide · Codex', 'Luis · Gemini CLI', 'Davide · Grok'])
})

test('Alt and an arrow move the focused tile, and the focus follows it', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await tile(page, 'Davide · Grok').focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect
    .poll(() => order(page))
    .toEqual(['Davide · Claude Code', 'Davide · Codex', 'Luis · Gemini CLI', 'Davide · Grok', 'Luis · Claude Code'])
  await expect(tile(page, 'Davide · Grok')).toBeFocused()
  await page.keyboard.press('Alt+Home')
  await expect.poll(() => order(page)).toHaveProperty('0', 'Davide · Grok')
  await expect(tile(page, 'Davide · Grok')).toBeFocused()
  await expect(tile(page, 'Davide · Grok')).toHaveAttribute('tabindex', '0') // it stays the grid's one Tab stop
  await expect(sortButton(page)).toHaveText('SortCustom')
  await page.keyboard.press('ArrowRight') // without Alt, the focus moves and the tiles stay
  await expect(tile(page, 'Davide · Claude Code')).toBeFocused()
  await expect.poll(() => order(page)).toHaveProperty('0', 'Davide · Grok')
})

test('a move that lands after the view renders again still leaves the moved tile the Tab stop', async ({ page }) => {
  // The glide holds the move back a beat (motion.ts); the view renders in between, as its clock or a live read would.
  await page.addInitScript(() => {
    Object.defineProperty(document, 'startViewTransition', {
      value: (update: () => void) => {
        window.resourcesFixture?.load?.()
        setTimeout(update, 100)
        const done = Promise.resolve()
        return { ready: done, finished: done, updateCallbackDone: done, skipTransition: () => undefined }
      },
    })
  })
  await page.goto(`${PAGE}?more=1`)
  await tile(page, 'Davide · Grok').focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect.poll(() => order(page)).toHaveProperty('3', 'Davide · Grok')
  await expect(tile(page, 'Davide · Grok')).toHaveAttribute('tabindex', '0')
  await page.keyboard.press('Alt+Home') // the tile moved, not the one now where it was
  await expect.poll(() => order(page)).toHaveProperty('0', 'Davide · Grok')
  await expect(tile(page, 'Davide · Grok')).toHaveAttribute('tabindex', '0')
  await expect(tile(page, 'Davide · Grok')).toBeFocused()
})

test('arranging within a filter keeps the hidden tiles where they were', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await filter(page, 'Mine 2').click()
  await tile(page, 'Luis · Claude Code').dragTo(tile(page, 'Luis · Gemini CLI'))
  await expect.poll(() => order(page)).toEqual(['Luis · Claude Code', 'Luis · Gemini CLI'])
  await filter(page, 'All 5').click()
  await expect
    .poll(() => order(page))
    .toEqual(['Davide · Claude Code', 'Davide · Codex', 'Luis · Claude Code', 'Luis · Gemini CLI', 'Davide · Grok'])
})

test('Codex’s review · a balance that moves flashes its tile; a request swapped for another, too', async ({ page }) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  await page.evaluate(() => window.resourcesFixture?.spendCredits?.(700)) // only the count changes
  await expect(tile(page, 'Luis · Gemini CLI')).toHaveAttribute('data-changed', 'true')
  await expect(tile(page, 'Luis · Gemini CLI')).toContainText('700 credits left')
  const claude = tile(page, 'Davide · Claude Code')
  await expect(claude).not.toHaveAttribute('data-changed')
  await page.evaluate(() => window.resourcesFixture?.swapRequest?.()) // one answered, another waiting: still 1
  await expect(claude).toHaveAttribute('data-changed', 'true')
  await expect(claude.getByText('1 waiting')).toBeVisible()
})

test('Codex’s review · while reading again, nothing of the last read is said', async ({ page }) => {
  await page.goto(`${PAGE}?refreshing=1&viewer=davide#resource-davide-claude`)
  await expect(page.locator('.resource-placeholders')).toBeVisible()
  await expect(page.locator('.resources-summary')).toHaveCount(0)
  await expect(page.locator('.resources-attention')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => window.resourcesFixture?.load?.())
  await expect(sheet(page, 'Davide · Claude Code')).toBeVisible() // read: now it opens
  await expect(page.locator('.resources-summary')).toBeVisible()
})

test('Codex’s review · each window’s own drawing says its readings, its dot on its line', async ({ page }) => {
  await page.goto(PAGE)
  await open(page, 'Davide · Codex')
  const codex = capacity(page, 'Davide · Codex')
  await codex.getByRole('button', { name: '1 more window' }).click()
  const own = codex.locator('.capacity-windows .capacity-history')
  await expect(own.locator('figcaption')).toHaveText('6 readings in 3 h')
  const [dot, svg] = await Promise.all([
    own.locator('.capacity-history-now').boundingBox(),
    own.locator('svg').boundingBox(),
  ])
  const centre = (dot?.y ?? 0) + (dot?.height ?? 0) / 2
  expect(centre, 'the dot sits within the drawing').toBeGreaterThanOrEqual(svg?.y ?? 0)
  expect(centre).toBeLessThanOrEqual((svg?.y ?? 0) + (svg?.height ?? 0))
})

test('Codex’s review · a dragged tile becomes the Tab stop; Alt at an end changes nothing', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  await tile(page, 'Davide · Claude Code').focus()
  await page.keyboard.press('Alt+Home') // already first
  await page.waitForTimeout(200)
  await expect(sortButton(page)).toHaveText('SortAttention') // still live, not frozen
  await tile(page, 'Luis · Claude Code').dragTo(tile(page, 'Davide · Codex'))
  await expect(tile(page, 'Luis · Claude Code')).toHaveAttribute('tabindex', '0')
  await expect(grid(page).locator('[tabindex="0"]')).toHaveCount(1)
})

test('a tile dragged without taking the focus becomes the Tab stop; the arrows start from the focused tile', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1`)
  await tile(page, 'Davide · Claude Code').focus()
  // As Safari and Firefox on a Mac drag: the pressed tile doesn't take the focus.
  const dragged = tile(page, 'Luis · Claude Code')
  const onto = tile(page, 'Davide · Codex')
  const data = await page.evaluateHandle(() => new DataTransfer())
  await dragged.dispatchEvent('dragstart', { dataTransfer: data })
  await onto.dispatchEvent('dragover', { dataTransfer: data })
  await onto.dispatchEvent('drop', { dataTransfer: data })
  await dragged.dispatchEvent('dragend', { dataTransfer: data })
  await expect(grid(page).getByRole('button').nth(1)).toHaveAccessibleName(/Luis · Claude Code/)
  await expect(dragged).toHaveAttribute('tabindex', '0')
  await expect(tile(page, 'Davide · Claude Code')).toBeFocused()
  await page.keyboard.press('ArrowRight') // from Davide's Claude Code, first: the next is Luis's, now second
  await expect(dragged).toBeFocused()
})

test('the Tab stop is a tile, not a place: when the tiles re-sort by themselves it stays on the same one', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1`)
  await page.evaluate(() => window.resourcesFixture?.addRequest?.()) // Codex waits too
  await tile(page, 'Davide · Claude Code').focus()
  await expect(tile(page, 'Davide · Claude Code')).toHaveAttribute('tabindex', '0')
  // Its request answered, Davide's Claude Code no longer waits: Codex goes first, by attention.
  await page.evaluate(() => window.resourcesFixture?.answerRequest?.())
  await expect(grid(page).getByRole('button').first()).toHaveAccessibleName(/Davide · Codex/)
  await expect(tile(page, 'Davide · Claude Code')).toHaveAttribute('tabindex', '0')
  await expect(grid(page).locator('[tabindex="0"]')).toHaveCount(1)
})

test('@phone · Codex’s review · the sheet’s title keeps its room beside its actions', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 }) // a narrow phone, its touch controls 40 px wide
  await page.goto(PAGE)
  await tile(page, 'Davide · Claude Code').click()
  const title = sheet(page, 'Davide · Claude Code').locator('#resource-sheet-title')
  await expect(title).toBeVisible()
  // Whole, on one line: neither cut nor broken over two.
  expect(await title.evaluate((h) => h.scrollWidth <= h.clientWidth + 1)).toBe(true)
  expect(
    await title.evaluate((h) => h.getBoundingClientRect().height <= parseFloat(getComputedStyle(h).lineHeight) * 1.5),
    'one line',
  ).toBe(true)
})

const askedOf = (page: Page) => page.evaluate(() => JSON.stringify(window.resourcesFixture?.asked ?? []))

test('effort · its owner opens the bar into a scale, and sets it for the next run, by keys alone', async ({ page }) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  const claude = await open(page, 'Davide · Claude Code')
  await claude.getByRole('button', { name: 'Effort: Ultracode. Change it' }).click()
  const slider = claude.getByRole('slider', { name: 'Effort' })
  await expect(slider).toBeFocused() // opened to be moved
  await expect(slider).toHaveAttribute('aria-valuetext', 'Ultracode')
  await expect(claude.getByRole('button', { name: 'Already Ultracode' })).toBeDisabled()
  await expect(claude.locator('.effort-scale')).toHaveAttribute('data-alive', 'true') // previewed as it will look
  await page.keyboard.press('Enter') // what it already runs: nothing to ask
  await expect(slider).toBeVisible()
  expect(await askedOf(page)).toBe('[]')
  await page.keyboard.press('ArrowLeft')
  await expect(slider).toHaveAttribute('aria-valuetext', 'Max')
  await expect(claude.locator('.effort-scale')).not.toHaveAttribute('data-alive')
  await page.keyboard.press('Enter')
  await expect(claude.getByRole('slider')).toHaveCount(0)
  await expect(claude.getByRole('status').filter({ hasText: 'Next run · Max' })).toBeVisible()
  expect(await askedOf(page)).toBe(JSON.stringify([{ sessionId: 'claude-worker', level: 'max', when: 'next' }]))
  await claude.getByRole('button', { name: 'Undo' }).click()
  await expect(claude.getByText('Next run · Max')).toHaveCount(0)
  expect(await askedOf(page)).toContain('{"sessionId":"claude-worker","level":null,"when":null}')
})

/** An effort bar's fill as drawn: its paint, its dot mask, its animation. */
const look = (scale: Locator) =>
  scale.locator('.effort-fill').evaluate((f) => {
    const s = getComputedStyle(f)
    return { image: s.backgroundImage, mask: s.maskImage || s.webkitMaskImage, animation: s.animationName }
  })

test('effort · each tool’s own look only at its top: Ultracode’s dots, Ultra’s gradient; plain below', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  const claude = await open(page, 'Davide · Claude Code')
  await claude.getByRole('button', { name: 'Effort: Ultracode. Change it' }).click()
  const scale = claude.locator('.effort-scale')
  expect(await look(scale)).toMatchObject({ animation: 'effort-glint' }) // at its top: the dots, alive
  expect((await look(scale)).mask).toMatch(/radial-gradient/)
  await page.keyboard.press('ArrowLeft') // Max: plain
  expect(await look(scale)).toEqual({ image: 'none', mask: 'none', animation: 'none' })
  await expect(scale.locator('.effort-stop')).toHaveCount(6) // a mark at each of its levels
  await expect(scale.locator('.effort-stop').nth(2)).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('j')
  const codex = sheet(page, 'Davide · Codex')
  await codex.getByRole('button', { name: 'Effort: Ultra. Change it' }).click()
  const gpt = codex.locator('.effort-scale')
  expect((await look(gpt)).image).toMatch(/linear-gradient/) // at Ultra: the gradient
  await page.keyboard.press('ArrowLeft') // Extra high: solid
  expect(await look(gpt)).toEqual({ image: 'none', mask: 'none', animation: 'none' })
  expect(await gpt.locator('.effort-fill').evaluate((f) => getComputedStyle(f, '::after').animationName)).toBe('none')
})

test('effort · restarting now is offered only while it works, said plainly, and confirmed', async ({ page }) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  const claude = await open(page, 'Davide · Claude Code')
  await claude.getByRole('button', { name: 'Effort: Ultracode. Change it' }).click()
  await expect(claude.getByRole('button', { name: /Restart now/ })).toHaveCount(0) // nothing to change yet
  await page.keyboard.press('Home')
  await expect(claude.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Low')
  await claude.getByRole('button', { name: 'Restart now with Low…' }).click()
  // Asked in place, as the app asks before cutting work off: what it does, and the safe answer focused.
  const asking = claude.getByRole('group', { name: 'Restart now with Low…' })
  await expect(asking).toContainText('Stops its work and starts it again with Low.')
  await expect(asking.getByRole('button', { name: 'Keep it running' })).toBeFocused()
  // Its answers' words start where its sentence does.
  const starts = await asking.evaluate((g) => {
    const range = document.createRange()
    const left = (el: Element | null) => {
      const words = el?.firstChild
      if (!words) return 0
      range.selectNodeContents(words)
      return range.getBoundingClientRect().left
    }
    return [left(g.querySelector('.confirm-note')), left(g.querySelector('.ghost'))]
  })
  expect(Math.abs((starts[0] ?? 0) - (starts[1] ?? 1))).toBeLessThanOrEqual(1)
  await claude.getByRole('button', { name: 'Keep it running' }).click()
  expect(await askedOf(page)).toBe('[]') // nothing asked
  await claude.getByRole('button', { name: 'Restart now with Low…' }).click()
  await claude.getByRole('button', { name: 'Restart', exact: true }).click()
  await expect(claude.getByRole('status').filter({ hasText: 'Restart asked · Low' })).toBeVisible()
  expect(await askedOf(page)).toBe(JSON.stringify([{ sessionId: 'claude-worker', level: 'low', when: 'now' }]))
  // A session with no work running offers the next run only.
  const reviewer = claude.getByRole('listitem').filter({ hasText: 'reviewer' })
  await reviewer.getByRole('button', { name: 'Effort: not reported. Change it' }).click()
  await expect(reviewer.getByRole('button', { name: /Restart now/ })).toHaveCount(0)
})

/** Moves a session's change as its runtime would report it (the fixture's advance, failStop, nextRun). */
const runtime = (page: Page, step: 'advance' | 'failStop' | 'nextRun', id = 'claude-worker') =>
  page.evaluate(([s, i]) => window.resourcesFixture?.[s]?.(i), [step, id] as const)

test('effort · a restart, step by step: asked, its work kept as it stops, started with it, then running it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  const claude = await open(page, 'Davide · Claude Code')
  const worker = claude.getByRole('listitem').filter({ hasText: 'worker' })
  await expect(claude.getByText('Run a shell command: pnpm --filter @sophia/report test')).toBeVisible()
  await worker.getByRole('button', { name: 'Effort: Ultracode. Change it' }).click()
  await page.keyboard.press('Home')
  await claude.getByRole('button', { name: 'Restart now with Low…' }).click()
  await claude.getByRole('button', { name: 'Restart', exact: true }).click()
  const line = worker.getByRole('status')
  await expect(line).toHaveText(/Restart asked · Low\s*Undo/) // still its owner's to take back
  const bar = worker.locator('.effort-button')
  await expect(bar).toBeFocused() // the scale closed, its bar took the focus back
  await runtime(page, 'advance')
  await expect(line).toHaveText('Stopping · keeping its work') // past undoing
  // While the change is underway, the bar stays, read only: the focus stays on it, and pressing it opens nothing.
  await expect(bar).toBeFocused()
  await expect(bar).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Enter')
  await expect(worker.locator('.effort-picker')).toHaveCount(0)
  await expect(line).toHaveAttribute('data-tone', 'moving')
  // The request its old attempt had waiting on Davide is retired with it: said so, nothing left to answer.
  const request = claude
    .getByRole('listitem')
    .filter({ hasText: 'Run a shell command: pnpm --filter @sophia/report test' })
  await expect(request.getByText('Superseded')).toBeVisible()
  await expect(request.getByRole('button', { name: 'Copy session id' })).toHaveCount(0)
  await expect(claude.getByRole('heading', { name: 'Earlier requests' })).toBeVisible() // nothing waits on him now
  await expect(worker.getByText('Queued')).toBeVisible() // its work held for the next attempt
  await runtime(page, 'advance')
  await expect(line).toHaveText('Starting again with Low')
  // Still what it runs, and read only while the change is underway: no other can be asked over it.
  await expect(worker.locator('.resource-model .effort')).toContainText('Ultracode')
  await expect(worker.getByRole('button', { name: /Change it/ })).toHaveCount(0)
  await runtime(page, 'advance')
  await expect(worker.getByRole('button', { name: 'Effort: Low. Change it' })).toBeVisible()
  await expect(worker.locator('.effort-picker')).toHaveCount(0) // the scale doesn't come back by itself
  await expect(line).toHaveText('Now on Low')
  await expect(line).toHaveAttribute('data-tone', 'done')
  await expect(worker.getByText('Working')).toBeVisible()
  // Said for a moment, then let go, while live reads keep arriving: none of them holds it there.
  for (let left = 3200; left > 3194; left--) {
    await page.evaluate((n) => window.resourcesFixture?.spendCredits?.(n), left)
    await page.waitForTimeout(900)
  }
  await expect(worker.getByRole('status')).toHaveCount(0, { timeout: 500 })
})

test('effort · its line sits in the session’s column: dot under dot, text under text, evenly spaced', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  const claude = await open(page, 'Davide · Claude Code')
  const worker = claude.locator('.resource-session').filter({ hasText: 'worker' })
  await worker.getByRole('button', { name: 'Effort: Ultracode. Change it' }).click()
  await page.keyboard.press('ArrowLeft')
  await claude.getByRole('button', { name: 'Restart now with Max…' }).click()
  await claude.getByRole('button', { name: 'Restart', exact: true }).click()
  // Measured at rest, once it has arrived.
  await worker.locator('.effort-asked').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const m = await worker.evaluate((row) => {
    const box = (s: string) => row.querySelector(s)?.getBoundingClientRect() ?? new DOMRect()
    const mid = (s: string) => box(s).left + box(s).width / 2
    // Where an element's own words start, past its dot.
    const text = (s: string) => {
      const range = document.createRange()
      const words = [...(row.querySelector(s)?.childNodes ?? [])].find((n) => n.nodeType === 3 && n.textContent?.trim())
      if (words) range.selectNodeContents(words)
      return range.getBoundingClientRect().left
    }
    const [chip, line, tag] = [box('.model-chip'), box('.effort-asked'), box('.resource-work .tag')]
    return {
      dot: { chip: mid('.model-dot'), line: mid('.effort-asked-dot'), tag: mid('.resource-work .tag .dot') },
      text: { chip: text('.model-chip'), line: text('.effort-asked'), tag: text('.resource-work .tag') },
      above: line.top - chip.bottom,
      below: tag.top - line.bottom,
      height: { chip: chip.height, line: line.height },
    }
  })
  expect(Math.abs(m.dot.line - m.dot.chip)).toBeLessThanOrEqual(0.5) // dot under dot
  expect(Math.abs(m.dot.tag - m.dot.chip)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(m.text.line - m.text.chip)).toBeLessThanOrEqual(1) // text under text
  expect(Math.abs(m.text.tag - m.text.chip)).toBeLessThanOrEqual(1)
  expect(m.above).toBeGreaterThan(0)
  expect(m.above).toBeCloseTo(m.below, 1) // as far from the tag below as from the chip above
  expect(m.height.line).toBe(m.height.chip)
})

/** How a piece of text is set: in the mono, and in capitals. */
const type = (l: Locator) =>
  l.evaluate((el) => {
    const s = getComputedStyle(el)
    return { mono: /mono/i.test(s.fontFamily), caps: s.textTransform === 'uppercase' }
  })

test('effort · its words in the app’s style: small labels in mono capitals; sentences and buttons in Geist', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  const claude = await open(page, 'Davide · Claude Code')
  const reviewer = claude.locator('.resource-session').filter({ hasText: 'reviewer' })
  expect(await type(reviewer.getByText('Set effort'))).toEqual({ mono: false, caps: false })
  await claude.getByRole('button', { name: 'Effort: Ultracode. Change it' }).click()
  expect(await type(claude.getByText('Faster', { exact: true }))).toEqual({ mono: true, caps: true })
  expect(await type(claude.getByText('Smarter', { exact: true }))).toEqual({ mono: true, caps: true })
  await page.keyboard.press('Home')
  await expect(claude.getByRole('button', { name: 'Cancel' })).toHaveClass('ghost') // the app's quiet button
  await expect(claude.getByRole('button', { name: 'Restart now with Low…' })).toHaveClass('ghost')
  await page.keyboard.press('Enter')
  expect(await type(claude.locator('.effort-asked').first())).toEqual({ mono: false, caps: false })
})

test('effort · a next run starts with it; a stop not confirmed restarts nothing, and anyone sees it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  const codex = await open(page, 'Davide · Codex')
  await codex.getByRole('button', { name: 'Effort: Ultra. Change it' }).click()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await expect(codex.getByRole('status')).toHaveText(/Next run · Extra high/)
  await runtime(page, 'advance', 'codex-reviewer') // a next-run request is not a restart: nothing moves
  await expect(codex.getByRole('status')).toHaveText(/Next run · Extra high/)
  await runtime(page, 'nextRun', 'codex-reviewer')
  await expect(codex.getByRole('status')).toHaveText('Now on Extra high')
  await expect(codex.getByRole('button', { name: 'Effort: Extra high. Change it' })).toBeVisible()
  // A restart whose stop its runtime can't confirm: said so, nothing restarted, and seen by whoever looks.
  await page.goto(`${PAGE}?more=1`)
  await runtime(page, 'failStop')
  const claude = await open(page, 'Davide · Claude Code')
  const worker = claude.getByRole('listitem').filter({ hasText: 'worker' })
  await expect(worker.getByRole('status')).toHaveText('Stop not confirmed · nothing restarted')
  await expect(worker.getByRole('status')).toHaveAttribute('data-tone', 'warn')
  await expect(worker.getByRole('button', { name: 'Undo' })).toHaveCount(0)
})

test('effort · Escape closes the scale, not the sheet; a click places the knob', async ({ page }) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  const codex = await open(page, 'Davide · Codex')
  await codex.getByRole('button', { name: 'Effort: Ultra. Change it' }).click()
  const slider = codex.getByRole('slider', { name: 'Effort' })
  const box = await slider.boundingBox()
  await page.mouse.click((box?.x ?? 0) + 2, (box?.y ?? 0) + (box?.height ?? 0) / 2) // at its Faster end
  await expect(slider).toHaveAttribute('aria-valuetext', 'Minimal')
  await page.keyboard.press('Escape')
  await expect(codex.getByRole('slider')).toHaveCount(0)
  await expect(sheet(page, 'Davide · Codex')).toBeVisible()
  await expect(codex.getByRole('button', { name: 'Effort: Ultra. Change it' })).toBeFocused() // back on its bar
  await page.keyboard.press('j') // so the sheet's keys still work
  await expect(sheet(page, 'Luis · Gemini CLI')).toBeVisible()
  expect(await askedOf(page)).toBe('[]')
})

test('effort · only its owner can choose it, and only from the levels its tool says it takes', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`) // Luis
  const claude = await open(page, 'Davide · Claude Code')
  await expect(claude.getByRole('button', { name: /^Effort:/ })).toHaveCount(0) // Davide's: read only
  await expect(claude.getByRole('meter', { name: 'Effort' })).toBeVisible()
  await page.keyboard.press('Escape')
  const gemini = await open(page, 'Luis · Gemini CLI') // his own, but Gemini CLI says no levels: none offered
  await expect(gemini.getByRole('button', { name: /^Effort:/ })).toHaveCount(0)
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
  await expect(gemini.getByRole('button', { name: /window/ })).toHaveCount(0) // its one window is the headline: nothing more
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
  const toggle = capacity(page, 'Davide · Codex').getByRole('button', { name: '1 more window' })
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
  await filter(page, 'All 5').click()
  await open(page, 'Davide · Codex')
  const chevron = capacity(page, 'Davide · Codex').locator('.capacity-toggle .icon')
  await expect(chevron).toHaveCSS('transition-duration', '0s') // the windows' chevron turns at once
})

test('live · a session at work says what its tool last reported, and a ring around its owner empties as that ages', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto(PAGE)
  const codex = tile(page, 'Davide · Codex')
  const live = codex.locator('.resource-tile-live')
  await expect(live).toHaveText('Reading ReportPane.tsx6 s ago')
  const fresh = () =>
    codex.locator('.resource-face').evaluate((e) => Number(getComputedStyle(e).getPropertyValue('--fresh')))
  const first = await fresh()
  await page.clock.runFor(5000) // its age counts to the second, and the ring empties
  await expect(live).toContainText('11 s ago')
  expect(await fresh()).toBeLessThan(first)
  await page.clock.runFor(4000) // its reviewer moves on: a new report, a full ring
  await expect(live).toContainText('Reading ExportStatus.tsx')
  expect(await fresh()).toBeGreaterThan(first)
  // Waiting, its ring and dot are amber; a resource with nothing at work says nothing live.
  const claude = tile(page, 'Davide · Claude Code')
  await expect(claude.locator('.resource-face')).toHaveAttribute('data-waiting', 'true')
  await expect(claude.locator('.resource-tile-live .activity-dot')).toHaveAttribute('data-waiting', 'true')
  await expect(tile(page, 'Luis · Claude Code').locator('.resource-tile-live, .resource-face[data-live]')).toHaveCount(
    0,
  )
  // The ring is a fine circle around the picture, its edge on the tile's column: never an oval swelling into it.
  const ring = await codex.evaluate((t) => {
    const face = t.querySelector('.resource-face')
    const logo = t.querySelector('.tool-logo')?.getBoundingClientRect()
    if (!face || !logo) return null
    const box = face.getBoundingClientRect()
    const before = getComputedStyle(face, '::before')
    // Its stroke is measured from its own edge (closest-side), so it stays fine at any size.
    const fine = before.maskImage.includes('closest-side')
    return { w: box.width, h: box.height, ring: before.width, fine, edge: box.left - 3 - logo.left }
  })
  // Sizes to a hundredth of a pixel: layout may land a hair off a whole one.
  expect([ring?.ring, ring?.fine]).toEqual(['22px', true])
  expect(ring?.w).toBeCloseTo(16, 1)
  expect(ring?.h).toBeCloseTo(16, 1)
  expect(ring?.edge).toBeCloseTo(0, 1)
  // The sheet says it too, under the session.
  const s = await open(page, 'Davide · Codex')
  await expect(s.locator('.resource-session-live')).toContainText('Reading ExportStatus.tsx')
})

test('one with Tasks · a session’s task opens on the board, as whoever looks, and its doer opens back here', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide#resource-davide-claude`)
  const s = sheet(page, 'Davide · Claude Code')
  await expect(s.getByRole('button', { name: 'No assignment' })).toHaveCount(0) // the reviewer has no task to open
  await s.getByRole('button', { name: /^Implement the PDF retry\W+open in Tasks$/ }).click()
  await expect(page).toHaveURL(/\/work\.html\?viewer=davide#task-work-1$/)
  const task = page.getByRole('dialog', { name: 'Implement the PDF retry' })
  await expect(task.locator('.task-chip')).toHaveText('Waiting on you') // still Davide looking
  await task.getByRole('button', { name: 'Davide’s Claude Code' }).click()
  await expect(sheet(page, 'Davide · Claude Code')).toBeVisible()
})

test('capacity · a window that runs out first says when on its tile, and its sheet names where there is room', async ({
  page,
}) => {
  await page.goto(`${PAGE}?tight=1`)
  const next = tile(page, 'Davide · Claude Code').locator('.resource-tile-next')
  await expect(next).toHaveText(/^out in ~3\d min$/)
  const amber = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--amber').trim())
  expect(await next.evaluate((e) => getComputedStyle(e).color)).toBe(rgb(amber))
  await expect(tile(page, 'Davide · Codex').locator('.resource-tile-next')).toHaveText('resets in 2 h')
  const s = await open(page, 'Davide · Claude Code')
  const room = s.locator('.capacity-room')
  await expect(room).toContainText('Davide’s Codex has room: 5-hour at 42%')
  await room.getByRole('button', { name: 'Show' }).press('Enter')
  await expect(sheet(page, 'Davide · Codex')).toBeVisible()
  // The pressed Show went with the page: the focus stays in the sheet, where K steps back.
  await expect(sheet(page, 'Davide · Codex')).toBeFocused()
  await page.keyboard.press('k')
  await expect(sheet(page, 'Davide · Claude Code')).toBeVisible()
  await page.keyboard.press('j')
  await expect(sheet(page, 'Davide · Codex').locator('.capacity-room')).toHaveCount(0) // on pace: nothing to offer
  // At its usual pace, Davide's Claude Code offers nothing either.
  await page.goto(`${PAGE}#resource-davide-claude`)
  await expect(sheet(page, 'Davide · Claude Code').locator('.capacity-room')).toHaveCount(0)
})

test('capacity · each tile says its capacity whole, in its own width', async ({ page }) => {
  await page.goto(`${PAGE}?more=1`)
  const lines = grid(page).locator('.resource-tile-capacity-line')
  await expect(lines).toHaveCount(5)
  const cut = await lines.evaluateAll((all) => all.filter((e) => e.scrollWidth > e.clientWidth).length)
  expect(cut).toBe(0)
  await expect(tile(page, 'Davide · Claude Code').locator('.resource-tile-capacity-line')).toHaveText(
    '5-hour window: 63% used, resets in 55 min5-hour · 63%resets in 55 min',
  )
})

test('live · a report goes still once old or its host offline, and the clock never steps back', async ({ page }) => {
  await page.clock.install()
  await page.goto(PAGE)
  const claude = tile(page, 'Davide · Claude Code')
  await expect(claude).toContainText('resets in 55 min')
  // Claude's worker last reported 22 s before the read: two minutes on, it is still said, but no longer live.
  await page.clock.runFor('02:00')
  await expect(claude.locator('.resource-tile-live')).toContainText('Asked to run pnpm')
  await expect(claude.locator('.resource-tile-live .activity-dot')).toHaveAttribute('data-still', 'true')
  await expect(claude.locator('.resource-face')).not.toHaveAttribute('data-live')
  await expect(claude).toContainText('resets in 53 min')
  // Codex's host goes offline: nothing is live, the clock ticks each minute, and it counts on from where it was.
  await page.evaluate(() => window.resourcesFixture?.setHost?.('davide-codex', 'offline'))
  await expect(tile(page, 'Davide · Codex').locator('.activity-dot')).toHaveAttribute('data-still', 'true')
  await page.clock.runFor('03:00')
  await expect(claude).toContainText('resets in 50 min')
})

test('one with Tasks · work on no board stays its title, with nothing to press', async ({ page }) => {
  await page.goto(`${PAGE}?more=1#resource-luis-gemini`)
  const s = sheet(page, 'Luis · Gemini CLI')
  await expect(s.getByText('Draft the onboarding copy')).toBeVisible()
  await expect(s.getByRole('button', { name: /Draft the onboarding copy/ })).toHaveCount(0)
})

test('@phone · a session’s live line keeps to the sheet’s one column', async ({ page }) => {
  await page.goto(`${PAGE}#resource-davide-codex`)
  const session = sheet(page, 'Davide · Codex').locator('.resource-session').filter({ hasText: 'Reading' })
  const [role, live] = await Promise.all([
    leftOf(session.locator('.resource-role')),
    leftOf(session.locator('.resource-session-live')),
  ])
  expect(live, 'under the role, not beside it').toBeCloseTo(role, 0)
  expect(await session.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
})

test('act · its owner acts on a session at work from its row, each step said; no one else is offered it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide#resource-davide-claude`)
  const s = sheet(page, 'Davide · Claude Code')
  const worker = s.locator('.resource-session').filter({ hasText: 'Implement the PDF retry' })
  const act = worker.getByRole('button', { name: 'Act' })
  await expect(act).toHaveAttribute('aria-expanded', 'false')
  await act.click()
  await expect(act).toHaveAttribute('aria-expanded', 'true')
  await worker.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging report fixtures')
  await worker.getByRole('button', { name: 'Send', exact: true }).click()
  const steps = worker.locator('.act-steps')
  await expect(steps.locator('li[data-reached]')).toHaveCount(3) // recorded, queued, delivered, as observed
  await expect(steps).toContainText('Delivered to its session. Not seen acting on it yet.')
  expect(await page.evaluate(() => window.resourcesFixture?.acted)).toEqual([
    // It names the work it was meant for, as shown: its runtime refuses it for any other.
    { sessionId: 'claude-worker', kind: 'guidance', text: 'Use the staging report fixtures', workId: 'work-1' },
  ])
  // Stop asks first; keeping it working sends nothing, and the focus comes back to Stop, where J and K still work.
  const stop = worker.getByRole('button', { name: 'Stop', exact: true })
  await stop.click()
  await expect(worker.getByText('Ends its session’s work at once.')).toBeVisible()
  await worker.getByRole('button', { name: 'Keep it working' }).click()
  await expect(stop).toBeFocused()
  expect(await page.evaluate(() => window.resourcesFixture?.acted?.length)).toBe(1)
  // Confirmed, it is sent, and said.
  await stop.click()
  await worker.getByRole('group', { name: 'Stop' }).getByRole('button', { name: 'Stop' }).click()
  await expect(stop).toBeFocused()
  await expect(steps).toContainText('Delivered: asked to stop. Not seen stopping yet.')
  expect(await page.evaluate(() => window.resourcesFixture?.acted?.at(-1)?.kind)).toBe('stop')
  // Closed and opened again, its row still says its last act.
  await act.click()
  await expect(steps).toHaveCount(0)
  await act.click()
  await expect(steps).toContainText('Delivered: asked to stop. Not seen stopping yet.')
  // A session with nothing at work has no Act.
  const reviewer = s.locator('.resource-session').filter({ hasText: 'No assignment' })
  await expect(reviewer.getByRole('button', { name: 'Act' })).toHaveCount(0)
  // Only what its route supports: Codex takes Hold and Stop, not guidance.
  await page.goto(`${PAGE}?viewer=davide#resource-davide-codex`)
  await page.reload()
  const codex = sheet(page, 'Davide · Codex')
  await codex.getByRole('button', { name: 'Act' }).click()
  await expect(codex.getByRole('button', { name: 'Hold' })).toBeVisible()
  await expect(codex.getByRole('textbox', { name: 'Guidance for its session' })).toHaveCount(0)
  // Anyone else sees whose they are, and no Act.
  await page.goto(`${PAGE}#resource-davide-claude`)
  await page.reload()
  await expect(sheet(page, 'Davide · Claude Code').getByRole('button', { name: 'Act' })).toHaveCount(0)
})

test('act · a late step of an earlier act never speaks over the latest one', async ({ page }) => {
  await page.clock.install()
  await page.goto(`${PAGE}?viewer=davide#resource-davide-claude`)
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000)) // time moves only as checked
  const worker = page.locator('.resource-session').filter({ hasText: 'Implement the PDF retry' })
  await worker.getByRole('button', { name: 'Act' }).click()
  await worker.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await worker.getByRole('button', { name: 'Send', exact: true }).click()
  await page.clock.runFor(300)
  await worker.getByRole('button', { name: 'Hold' }).click() // before the guidance is queued
  // The guidance is delivered (1.7 s) while the Hold is only queued: the row says the Hold's step, not the guidance's.
  await page.clock.runFor(1500)
  const steps = worker.locator('.act-steps')
  await expect(steps).toContainText('Queued…')
  await expect(steps).not.toContainText('Delivered to its session')
  await page.clock.runFor(1500) // then the Hold is delivered
  await expect(steps).toContainText('Delivered: asked to hold at its next safe point. Not seen holding yet.')
})

test('@phone · its owner opens Act and the row keeps to one column', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide#resource-davide-claude`)
  const worker = page.locator('.resource-session').filter({ hasText: 'Implement the PDF retry' })
  await worker.getByRole('button', { name: 'Act' }).click()
  const [role, work, acts] = await Promise.all([
    leftOf(worker.locator('.resource-role')),
    leftOf(worker.locator('.resource-work')),
    leftOf(worker.locator('.resource-session-acts')),
  ])
  expect(work, 'the task under the role').toBeCloseTo(role, 0)
  expect(acts, 'the acts under it too').toBeCloseTo(role, 0)
  expect(await worker.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
})

test('away · what changed since the last look is one line, its tiles marked, until Mark seen', async ({ page }) => {
  await page.goto(`${PAGE}?since=1&more=1`)
  const line = page.locator('.resources-away')
  await expect(line).toContainText('While you were away')
  await expect(line).toContainText('Davide’s Grok went offline')
  await expect(line).toContainText('Davide’s Codex started Review the report pane')
  // A request that came is said on top, while it waits, never twice; only a tile the line speaks of is marked.
  await expect(line).not.toContainText('request')
  await expect(grid(page).locator('[data-away]')).toHaveCount(2)
  await expect(tile(page, 'Davide · Claude Code')).not.toHaveAttribute('data-away')
  await line.getByRole('button', { name: 'Mark seen' }).click()
  await expect(line).toHaveCount(0)
  await expect(grid(page).locator('[data-away]')).toHaveCount(0)
  // Remembered in this browser: the next visit has nothing new to say.
  await page.goto(`${PAGE}?more=1`)
  await expect(grid(page).getByRole('button').first()).toBeVisible()
  await expect(page.locator('.resources-away')).toHaveCount(0)
})

test('away · a first visit remembers Resources as they are and says nothing', async ({ page }) => {
  await page.goto(PAGE)
  await expect(grid(page).getByRole('button').first()).toBeVisible()
  await expect(page.locator('.resources-away')).toHaveCount(0)
  await expect(grid(page).locator('[data-away]')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('sophia.resources.seen.v2.fixture.luis'))).toContain(
    'davide-claude',
  )
})

test('earlier · a session’s earlier reports fold under its last one, newest first, and grow as it reports', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto(`${PAGE}#resource-davide-claude`)
  const s = sheet(page, 'Davide · Claude Code')
  const toggle = s.getByRole('button', { name: '3 earlier' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(s.getByRole('list', { name: 'Earlier reports' })).toHaveCount(0)
  await toggle.click()
  const earlier = s.getByRole('list', { name: 'Earlier reports' }).locator('.session-earlier-said')
  await expect(earlier).toHaveText([
    'Edited pdf-retry.ts: retries the render twice',
    'Wrote the failing test for a timed-out render',
    'Read ExportStatus.tsx',
  ])
  // Codex's reviewer reports again: what it said before goes to the top of its earlier ones.
  await page.goto(`${PAGE}#resource-davide-codex`)
  await page.reload()
  const codex = sheet(page, 'Davide · Codex')
  await expect(codex.getByRole('button', { name: '2 earlier' })).toBeVisible()
  await page.clock.runFor(9000)
  await codex.getByRole('button', { name: '3 earlier' }).click()
  await expect(
    codex.getByRole('list', { name: 'Earlier reports' }).locator('.session-earlier-said').first(),
  ).toHaveText('Reading ReportPane.tsx')
})

test('@phone · earlier reports keep to the sheet’s one column', async ({ page }) => {
  await page.goto(`${PAGE}#resource-davide-claude`)
  const worker = page.locator('.resource-session').filter({ hasText: 'Implement the PDF retry' })
  await worker.getByRole('button', { name: '3 earlier' }).click()
  const [role, earlier] = await Promise.all([
    leftOf(worker.locator('.resource-role')),
    leftOf(worker.locator('.session-earlier')),
  ])
  expect(earlier, 'under the role').toBeCloseTo(role, 0)
  expect(await worker.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
})

test('away · what isn’t said marks nothing: a request that comes, a host gone unknown', async ({ page }) => {
  await page.goto(`${PAGE}?quiet=1`) // a first visit: remembered as it is
  await expect(grid(page).getByRole('button').first()).toBeVisible()
  await page.evaluate(() => {
    window.resourcesFixture?.addRequest?.()
    window.resourcesFixture?.setHost?.('davide-claude', 'unknown')
  })
  await expect(page.getByRole('button', { name: /request waits on Davide/ })).toBeVisible() // said on top
  await expect(page.locator('.resources-away')).toHaveCount(0)
  await expect(grid(page).locator('[data-away]')).toHaveCount(0)
})

test('@phone · the away line wraps whole, its Mark seen in reach', async ({ page }) => {
  await page.goto(`${PAGE}?since=1&more=1`)
  const said = page.locator('.resources-away .away-line-said')
  await expect(said).toBeVisible()
  expect(await said.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
  await expect(page.locator('.resources-away').getByRole('button', { name: 'Mark seen' })).toBeInViewport()
})

test('effort · Escape anywhere in the picker closes the picker, never the sheet', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide#resource-davide-claude`)
  const s = sheet(page, 'Davide · Claude Code')
  const worker = s.getByRole('listitem').filter({ hasText: 'worker' })
  const bar = worker.getByRole('button', { name: /Change it/ })
  await bar.click()
  await page.keyboard.press('ArrowLeft')
  await worker.getByRole('button', { name: 'Cancel' }).focus()
  await page.keyboard.press('Escape')
  await expect(worker.locator('.effort-picker')).toHaveCount(0)
  await expect(s).toBeVisible()
  await expect(bar).toBeFocused()
  // From the restart's question too: the picker closes, the sheet stays.
  await bar.click()
  await page.keyboard.press('ArrowLeft')
  await worker.getByRole('button', { name: /Restart now/ }).click()
  await expect(worker.getByRole('button', { name: 'Keep it running' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(worker.locator('.effort-picker')).toHaveCount(0)
  await expect(s).toBeVisible()
})

test('effort · a request its runtime refuses is said so, then let go', async ({ page }) => {
  await page.clock.install()
  await page.goto(`${PAGE}?viewer=davide#resource-davide-claude`)
  const worker = sheet(page, 'Davide · Claude Code').getByRole('listitem').filter({ hasText: 'worker' })
  await worker.getByRole('button', { name: /Change it/ }).click()
  await page.keyboard.press('ArrowLeft')
  await worker.getByRole('button', { name: 'Set for its next run' }).click()
  const line = worker.locator('.effort-asked')
  await expect(line).toContainText('Next run')
  await page.evaluate(() => window.resourcesFixture?.refuseEffort?.('claude-worker'))
  await expect(line).toHaveText('Not accepted · nothing changed')
  await expect(line.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await page.clock.runFor(4500)
  await expect(line).toHaveCount(0)
})

test('sort · its options aren’t Tab stops; Tab leaves the menu closed, from Sort onward', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.resource-sort-button').click()
  const menu = page.getByRole('menu', { name: 'Sort' })
  await expect(menu).toBeVisible()
  expect(await menu.getByRole('menuitemradio').evaluateAll((all) => all.every((b) => b.tabIndex === -1))).toBe(true)
  await page.keyboard.press('Tab')
  await expect(menu).toHaveCount(0)
  // The focus went on past Sort, to the tiles: not left in a closed menu, nor dropped to the page.
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.resource-grid')))).toBe(true)
})

test('act · sent is said "Sending…" until its runtime records it; a draft typed since is kept', async ({ page }) => {
  await page.clock.install()
  await page.goto(`${PAGE}?viewer=davide#resource-davide-claude`)
  // Time moves only as the check moves it: a slow machine mustn't let the runtime's reply come first.
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000))
  const worker = page.locator('.resource-session').filter({ hasText: 'Implement the PDF retry' })
  await worker.getByRole('button', { name: 'Act' }).click()
  const field = worker.getByRole('textbox', { name: 'Guidance for its session' })
  await field.fill('Use the staging fixtures')
  await worker.getByRole('button', { name: 'Send', exact: true }).click()
  const steps = worker.locator('.act-steps')
  await expect(steps).toContainText('Sending…')
  await expect(steps.locator('li[data-reached]')).toHaveCount(0)
  await field.fill('And the PDF ones') // typed while the first goes
  await page.clock.runFor(200)
  await expect(steps.locator('li[data-reached]')).toHaveCount(1) // recorded, as its runtime said
  await page.clock.runFor(600) // queued: the guidance sent leaves its field, what was typed since stays
  await expect(field).toHaveValue('And the PDF ones')
  await worker.getByRole('button', { name: 'Send', exact: true }).click()
  await page.clock.runFor(800)
  await expect(field).toHaveValue('')
})

test('@phone · on touch, the effort bar and its scale reach past what they draw', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide#resource-davide-claude`)
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  const worker = page.locator('.resource-session').filter({ hasText: 'Implement the PDF retry' })
  const bar = worker.getByRole('button', { name: /Change it/ })
  expect(await reaches(bar, 10), 'the bar, 10 px above it').toBe(true)
  await bar.click()
  expect(await reaches(worker.getByRole('slider'), 10), 'the scale, 10 px above it').toBe(true)
})

test('effort · a change that comes while the scale is open brings the focus back to the bar', async ({ page }) => {
  await page.goto(`${PAGE}?more=1&viewer=davide`)
  const claude = await open(page, 'Davide · Claude Code')
  const worker = claude.getByRole('listitem').filter({ hasText: 'worker' })
  await worker.getByRole('button', { name: 'Effort: Ultracode. Change it' }).click()
  await page.keyboard.press('Home')
  await claude.getByRole('button', { name: 'Restart now with Low…' }).click()
  await claude.getByRole('button', { name: 'Restart', exact: true }).click()
  // Asked, not yet underway: the scale can open again, and the focus is in it when the runtime takes the restart.
  const bar = worker.locator('.effort-button')
  await bar.click()
  await expect(worker.getByRole('slider')).toBeFocused()
  await page.evaluate(() => window.resourcesFixture?.advance?.('claude-worker'))
  await expect(worker.locator('.effort-picker')).toHaveCount(0)
  await expect(bar).toBeFocused()
})

test('type · the view and its sheet keep to the scale: at most five sizes each', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&tight=1&more=1`)
  await expect(tile(page, 'Davide · Claude Code')).toBeVisible()
  const view = await typeSizes(page, '.resources')
  expect(view, view.join(' ')).toEqual(['10.5px', '12px', '13px', '14px', '20px'])
  await open(page, 'Davide · Claude Code')
  const inSheet = await typeSizes(page, '.resource-sheet')
  expect(inSheet.length, inSheet.join(' ')).toBeLessThanOrEqual(5)
  expect(inSheet.filter((s) => !['10.5px', '12px', '13px', '14px', '15px'].includes(s))).toEqual([])
})
