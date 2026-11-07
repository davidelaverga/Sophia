// A designed page's inline citations, read in the viewer (SDD-01): each [1] links to the page's own source entry
// (`href="#source-1"`). The page is framed through `srcdoc`, whose document takes Studio's address as its base, so the
// link read as Studio's own page: a click navigated the frame away and left it empty (B-HTML-CITATION-LOCAL-TRIAGE-01).
// These checks read the page Sophia published, its bytes as stored (`designed=cited`), with a real click.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Frame, type Page } from '@playwright/test'
import { CITED_PAGE, ENTITY_PAGE, STYLED_PAGE } from '../fixtures/report-data.ts'

const FIXTURES = 'http://127.0.0.1:5199'
const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== FIXTURES,
    (route) => route.abort(),
  )
})

/** The cited page open in the viewer, and every request and frame navigation from then on. */
async function openCited(page: Page) {
  await page.goto('/room.html?place=work&designed=cited')
  await page.getByRole('button', { name: 'Open fixture-report-v1.html, HTML page' }).click()
  const iframe = pane(page).locator('iframe.report-html-frame')
  await expect(page.frameLocator('iframe.report-html-frame').locator('#source-1')).toHaveText(
    '[1] Supplied synthetic note',
  )
  const frame = page.frames().find((f) => f !== page.mainFrame())
  if (!frame) throw new Error('the designed page has no frame')
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  const away: string[] = []
  page.on('framenavigated', (f) => {
    if (!f.url().startsWith('about:srcdoc')) away.push(f.url())
  })
  return { iframe, frame, requests, away }
}

/** The framed document as it stands: which one it is (its time origin), and where its source entry is. */
const seen = (frame: Frame) =>
  frame.evaluate(() => {
    const target = document.getElementById('source-1')?.getBoundingClientRect()
    return {
      document: performance.timeOrigin,
      title: document.title,
      markers: document.querySelectorAll('a[data-cite]').length,
      fragment: location.hash,
      height: document.scrollingElement?.clientHeight ?? 0,
      top: target?.top ?? null,
      bottom: target?.bottom ?? null,
    }
  })

test('HTML · an inline [1] brings the page’s own source entry into view, in the same page: nothing is loaded', async ({
  page,
}) => {
  const { iframe, frame, requests, away } = await openCited(page)
  const outer = page.url()
  // The page as checked: no permission at all, and Download keeps its bytes and hash.
  await expect(iframe).toHaveAttribute('sandbox', '')
  await expect(pane(page).getByRole('button', { name: 'Download', exact: true })).toHaveAccessibleDescription(
    /^[\d.]+ KB · c824d3a7$/,
  )
  const before = await seen(frame)
  expect(before).toMatchObject({ title: 'Reading-room decision brief', markers: 6, fragment: '' })
  expect(before.top).toBeGreaterThan(before.height) // the entry is further down, out of sight

  await page.frameLocator('iframe.report-html-frame').locator('a[data-cite]').first().click()

  await expect.poll(async () => (await seen(frame)).fragment).toBe('#source-1')
  const after = await seen(frame)
  // The same document, its source entry on screen; the frame went nowhere and nothing was asked of any server.
  expect(after).toMatchObject({ document: before.document, title: before.title, markers: 6 })
  expect(after.top).toBeGreaterThanOrEqual(0)
  expect(after.bottom).toBeLessThanOrEqual(after.height)
  expect(away).toEqual([])
  expect(requests).toEqual([])
  expect(page.url()).toBe(outer)
  await expect(iframe).toHaveAttribute('sandbox', '')

  const saved = page.waitForEvent('download')
  await pane(page).getByRole('button', { name: 'Download', exact: true }).click()
  expect(await readFile(await (await saved).path(), 'utf8')).toBe(CITED_PAGE.text)
})

test('HTML · read back up, another [1] brings the same entry into view again', async ({ page }) => {
  const { iframe, frame, requests, away } = await openCited(page)
  const inner = page.frameLocator('iframe.report-html-frame')
  await inner.locator('a[data-cite]').first().click()
  await expect.poll(async () => (await seen(frame)).fragment).toBe('#source-1')
  const first = await seen(frame)
  // Back up the page by the wheel, as a reader would: the entry is out of sight again, the fragment unchanged.
  await iframe.hover()
  await page.mouse.wheel(0, -5000)
  await expect.poll(async () => (await seen(frame)).top ?? 0).toBeGreaterThan(first.height)

  await inner.locator('a[data-cite]').nth(1).click()

  await expect.poll(async () => (await seen(frame)).top ?? Infinity).toBeLessThanOrEqual(first.height)
  const again = await seen(frame)
  expect(again).toMatchObject({ document: first.document, fragment: '#source-1', markers: 6 })
  expect(again.top).toBeGreaterThanOrEqual(0)
  expect(away).toEqual([])
  expect(requests).toEqual([])
})

// A citation's move within the frame is an entry of the tab's history, beside the page's own: Close, which steps Back
// over the viewer's own entries, stepped back over that move instead, and the report stayed open with its address
// (B-HTML-CITATION-CLOSE-LIFECYCLE-TRIAGE-01). Each check below failed so before DocumentViewer's stepBack.

/** Clicks the page's first inline [1], and waits for its move within the frame. */
async function cite(page: Page) {
  await page.frameLocator('iframe.report-html-frame').locator('a[data-cite]').first().click()
  // The pane's own frame: Knowledge's list frames each report's cover too.
  const frame = await (await pane(page).locator('iframe.report-html-frame').elementHandle()).contentFrame()
  if (!frame) throw new Error('the designed page has no frame')
  await expect.poll(() => frame.evaluate(() => location.hash)).toBe('#source-1')
}

const close = (page: Page) => pane(page).getByRole('button', { name: 'Close', exact: true }).click()

test('HTML · after a citation, one Close closes the report on searched Knowledge; Forward opens it, Back closes it', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge&designed=cited')
  const knowledge = page.url()
  const search = page.getByRole('searchbox', { name: 'Search reports' })
  await search.fill('Fixture')
  await page.getByRole('button', { name: 'Open Fixture report, HTML page' }).click()
  await expect(page.frameLocator('iframe.report-html-frame').locator('#source-1')).toHaveText(
    '[1] Supplied synthetic note',
  )
  const opened = page.url()
  await cite(page)
  expect(page.url()).toBe(opened)

  await close(page)

  await expect(pane(page)).toHaveCount(0)
  expect(page.url()).toBe(knowledge)
  await expect(search).toHaveValue('Fixture') // Knowledge as it was searched
  // The viewer's entry is still Forward of Knowledge, and Back again leaves it.
  await page.goForward()
  await expect(pane(page).locator('iframe.report-html-frame')).toHaveCount(1)
  expect(page.url()).toBe(opened)
  await page.goBack()
  await expect(pane(page)).toHaveCount(0)
  expect(page.url()).toBe(knowledge)
})

test('HTML · after a citation on the full page, Back to side panel steps down once, and Close then closes', async ({
  page,
}) => {
  await page.goto('/room.html?place=work&designed=cited')
  const work = page.url()
  const opener = page.getByRole('button', { name: 'Open fixture-report-v1.html, HTML page' })
  await opener.click()
  const side = page.url()
  await pane(page).getByRole('button', { name: 'Enlarge', exact: true }).click()
  await expect(page.locator('.report-pane')).toHaveAttribute('data-size', 'full')
  await cite(page)

  await pane(page).getByRole('button', { name: 'Back to side panel', exact: true }).click()
  await expect(page.locator('.report-pane')).toHaveAttribute('data-size', 'side')
  expect(page.url()).toBe(side)
  await cite(page)
  await close(page)
  await expect(pane(page)).toHaveCount(0)
  expect(page.url()).toBe(work)
  await expect(opener).toBeFocused() // what opened the report has the focus back
})

test('HTML · after citations, another format and another version, one Close closes the report', async ({ page }) => {
  await page.goto('/room.html?place=work&designed=cited&versions=2')
  const work = page.url()
  await page.getByRole('button', { name: 'Open fixture-report-v1.html, HTML page' }).click()
  await cite(page)
  const formats = pane(page).getByRole('group', { name: 'Format' })
  await formats.getByRole('button', { name: 'Markdown' }).click()
  await formats.getByRole('button', { name: 'HTML' }).click()
  await cite(page) // a new frame, a move of its own; the first frame's is still in the tab's history
  await pane(page)
    .getByRole('tab', { name: /^History/ })
    .click()
  const shown = new URL(page.url()).searchParams.get('version')
  const other = pane(page)
    .locator('.report-history > li')
    .filter({ has: page.getByText('v2', { exact: true }) })
  await other.getByRole('button', { name: 'Show this version' }).click()
  await expect(other.getByRole('button', { name: 'On screen' })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('version')).not.toBe(shown)

  await close(page)
  await expect(pane(page)).toHaveCount(0)
  expect(page.url()).toBe(work)
})

/** in-page-links.ts as the fixture server serves it to the page, read through the browser's own parser. */
const MODULE = `/@fs${fileURLToPath(new URL('../src/features/artifacts/in-page-links.ts', import.meta.url))}`

/** What in-page-links.ts's `name` makes of each page, in the browser. */
const inBrowser = (page: Page, name: 'framed' | 'keptInPage', pages: readonly string[]) =>
  page.evaluate(
    async ([path, fn, all]) => {
      const loaded: unknown = await import(path)
      const call: unknown = typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, fn) : null
      if (typeof call !== 'function') throw new Error(`in-page-links.ts has no ${fn}()`)
      return all.map((html) => {
        const made: unknown = Reflect.apply(call, undefined, [html])
        return typeof made === 'string' ? made : null
      })
    },
    [MODULE, name, pages] as const,
  )

test('HTML · only links to the page’s own fragments change in the framed copy; one read differently is not framed', async ({
  page,
}) => {
  await page.goto('/room.html')
  const framedOf = (pages: string[]) => inBrowser(page, 'framed', pages)
  const head = '<!doctype html><html><head><title>t</title></head><body>'
  const pages = [
    `${head}<p>No links.</p></body></html>`,
    `${head}<p><a href="#a">1</a> <A HREF='#b'>2</A> <a href=#c>3</a> <a href=" #d ">4</a></p><map><area href="#e"></map></body></html>`,
    `${head}<p><a href="https://example.test/#a">x</a> <a href="other.html#a">y</a> <a href="">z</a></p></body></html>`,
    `${head}<p>Write href="#a" as text.</p><!-- <a href="#b"> --><textarea><a href="#c"></textarea></body></html>`,
    // An entity the browser reads as "#a" that the copy would leave: not framed at all, never half-changed.
    `${head}<p><a href="&#35;a">1</a> <a href="#b">2</a></p></body></html>`,
  ]
  expect(await framedOf(pages)).toEqual([
    pages[0],
    `${head}<p><a href="about:srcdoc#a">1</a> <A HREF='about:srcdoc#b'>2</A> <a href=about:srcdoc#c>3</a> <a href="about:srcdoc#d">4</a></p><map><area href="about:srcdoc#e"></map></body></html>`,
    pages[2],
    pages[3],
    null,
  ])
  // The page Sophia published: its six markers' links change, and not one other byte.
  const [cited] = await framedOf([CITED_PAGE.text])
  expect(cited).toBe(CITED_PAGE.text.replaceAll('href="#source-1"', 'href="about:srcdoc#source-1"'))
  expect(CITED_PAGE.text.split('href="#source-1"')).toHaveLength(7)
})

/**
 * The designed page of `designed=<as>` opened: it is not shown, and nothing in the pane is a frame or holds a link a
 * click could follow; the reader is offered the Markdown, and Download keeps the page's bytes.
 */
async function notShown(page: Page, as: 'styled' | 'entity', stored: { text: string; sha256: string }) {
  await page.goto(`/room.html?place=work&designed=${as}`)
  await page.getByRole('button', { name: 'Open fixture-report-v1.html, HTML page' }).click()
  const note = pane(page).locator('.report-html-refused')
  await expect(note).toContainText('This designed page isn’t shown here')
  await expect(pane(page).locator('iframe')).toHaveCount(0)
  expect(page.frames()).toHaveLength(1)
  await expect(pane(page).getByRole('group', { name: 'Format' }).getByRole('button', { name: 'HTML' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const download = pane(page).getByRole('button', { name: 'Download', exact: true })
  await expect(download).toHaveAccessibleDescription(new RegExp(`· ${stored.sha256.slice(0, 8)}$`))
  const saved = page.waitForEvent('download')
  await download.click()
  expect(await readFile(await (await saved).path(), 'utf8')).toBe(stored.text)
  // The version's Markdown, chosen from the note: the report read as text, the page unchanged in its record.
  await note.getByRole('button', { name: 'Read as Markdown' }).click()
  await expect(
    pane(page).getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Markdown' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(pane(page).locator('.md')).toContainText('The first version of a labelled fixture report.')
  await expect(pane(page).locator('.report-html-refused')).toHaveCount(0)
}

/** A page with one link to its own fragment, styled by `css` (and on its paragraph, `attribute`). */
const withCss = (css: string, attribute = '') =>
  `<!doctype html><html><head><style>${css}</style></head><body><p${attribute}><a href="#s">[1]</a></p><p id="s">S</p></body></html>`

test('HTML · a page whose citations show through an href selector is not shown: no frame, its Markdown offered', async ({
  page,
}) => {
  // The design policy accepts this page (safe and complete, no finding; cited-page.ts): its citations are hidden by
  // `a[data-cite] { display: none }` and shown by `a[data-cite][href^="#"]`. Their links rewritten, they would vanish;
  // framed as stored, a click on one would empty the frame. So it is not framed.
  await notShown(page, 'styled', STYLED_PAGE)
  // Any CSS of the page's that mentions href, however written, keeps it out of a frame; CSS that never does, not.
  const refused = [
    withCss('a[href^="#"] { color: red }'),
    withCss('A[HREF] { color: red }'),
    withCss('a[\\68 ref] { color: red }'),
    withCss('a[h\\r\\00065 f] { color: red }'),
    withCss('a::after { content: attr(href) }'),
    withCss('p { color: red }', ' style="--x: attr(href)"'),
    // An escape and the line break after it, as CSS reads one: CR LF (raw, as compile keeps a styles.css's, or as
    // character references in an attribute, which the HTML parser does not fold), CR, FF.
    withCss('a[\\68\r\nref] { color: red }'),
    withCss('a[\\68\rref] { color: red }'),
    withCss('a[\\68\fref] { color: red }'),
    withCss('p { color: red }', ' style="--x: attr(\\68&#13;&#10;ref)"'),
    withCss('p { color: red }', ' style="--x: attr(\\68&#13;ref)"'),
  ]
  const plain = withCss('a { color: red } p:has(a) { margin: 0 }')
  expect(await inBrowser(page, 'framed', [...refused, plain])).toEqual([
    ...refused.map(() => null),
    plain.replace('href="#s"', 'href="about:srcdoc#s"'),
  ])
})

test('HTML · a page whose citation the viewer reads otherwise than the browser is not shown: no frame', async ({
  page,
}) => {
  // Its link is `href="&#35;source-1"`: the browser follows `#source-1`, the viewer's reading of the bytes sees no
  // fragment, so it could not keep the link in the page.
  await notShown(page, 'entity', ENTITY_PAGE)
})

test('HTML · a format chosen from the keyboard where the page is not shown leaves the focus on the report’s title', async ({
  page,
}) => {
  await page.goto('/room.html?place=work&designed=styled')
  await page.getByRole('button', { name: 'Open fixture-report-v1.html, HTML page' }).click()
  const read = pane(page).locator('.report-html-refused').getByRole('button', { name: 'Read as Markdown' })
  await read.focus()
  await expect(read).toBeFocused()
  await page.keyboard.press('Enter')
  // The button went with the note; the focus is not dropped to the page but held where the pane puts it.
  await expect(pane(page).locator('.md')).toContainText('The first version of a labelled fixture report.')
  await expect(read).toHaveCount(0)
  await expect(pane(page).locator('#report-pane-title')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.report-pane') !== null)).toBe(true)
})

/** The policy every compiled designed page carries (packages/design's DESIGN_CSP). */
const DESIGN_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

/** A local endpoint the checks count, never answered by a server: `/__probe/<what asked>`. */
const PROBE = `${FIXTURES}/__probe/`

/** Every way a page asks for something or runs code, each aimed at the probe; and its own link, so it is read. */
const ADVERSARIAL = (csp: string) =>
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    csp,
    `<base href="${PROBE}base/">`,
    `<link rel="stylesheet" href="${PROBE}stylesheet"><link rel="preload" as="image" href="${PROBE}preload">`,
    `<link rel="prefetch" href="${PROBE}prefetch"><link rel="icon" href="${PROBE}icon">`,
    `<meta http-equiv="refresh" content="0;url=${PROBE}refresh">`,
    `<style>@import url(${PROBE}import); body { background: url(${PROBE}background) }`,
    `@font-face { font-family: probe; src: url(${PROBE}font) } p { font-family: probe }</style>`,
    `<script>window.__ran = 'script'; fetch('${PROBE}script-fetch')</script><script src="${PROBE}script-src"></script>`,
    `</head><body onload="window.__ran = 'onload'">`,
    `<p><a href="#source-1" ping="${PROBE}ping">[1]</a></p>`,
    `<img src="${PROBE}img" srcset="${PROBE}srcset 2x" onerror="window.__ran = 'onerror'"><img src="relative.png">`,
    `<picture><source srcset="${PROBE}source"><img src="${PROBE}picture"></picture>`,
    `<video poster="${PROBE}poster" src="${PROBE}video"></video><audio src="${PROBE}audio"></audio>`,
    `<object data="${PROBE}object"></object><embed src="${PROBE}embed"><input type="image" src="${PROBE}input">`,
    `<iframe src="${PROBE}iframe"></iframe><iframe srcdoc="<script>parent.__ran = 'srcdoc'</script>"></iframe>`,
    `<svg onload="window.__ran = 'svg'"><image href="${PROBE}svg-image"/></svg>`,
    `<div style="background: url(${PROBE}inline-style)">x</div>`,
    '<p id="source-1" data-source="s">[1] Source</p></body></html>',
  ].join('')

test('HTML · reading a page’s own links outside the frame loads nothing and runs nothing, its CSP or not', async ({
  page,
  context,
}) => {
  const asked: string[] = []
  await context.route(`${PROBE}**`, (route) => {
    asked.push(route.request().url())
    return route.fulfill({ status: 204 })
  })
  // The probe counts: the same page in a live document asks for its resources.
  const control = await context.newPage()
  await control.goto('/room.html')
  await control.evaluate((html) => {
    document.createElement('div').innerHTML = html
  }, ADVERSARIAL(''))
  await expect.poll(() => asked.length).toBeGreaterThan(0)
  await control.close()
  asked.length = 0

  await page.goto('/room.html')
  const csp = `<meta http-equiv="Content-Security-Policy" content="${DESIGN_CSP}">`
  const pages = [ADVERSARIAL(''), ADVERSARIAL(csp)]
  // Each has a link to its own fragment, so framed() reads it through the parser, not as it is.
  expect((await inBrowser(page, 'keptInPage', pages)).every((kept, i) => kept !== pages[i])).toBe(true)
  const framed = await inBrowser(page, 'framed', pages)
  expect(framed).toHaveLength(2)
  await page.waitForTimeout(1500)
  expect(asked).toEqual([])
  expect(await page.evaluate(() => Reflect.has(window, '__ran'))).toBe(false)
})
