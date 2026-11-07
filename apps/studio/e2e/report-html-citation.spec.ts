// A designed page's inline citations, read in the viewer (SDD-01): each [1] links to the page's own source entry
// (`href="#source-1"`). The page is framed through `srcdoc`, whose document takes Studio's address as its base, so the
// link read as Studio's own page: a click navigated the frame away and left it empty (B-HTML-CITATION-LOCAL-TRIAGE-01).
// These checks read the page Sophia published, its bytes as stored (`designed=cited`), with a real click.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Frame, type Page } from '@playwright/test'
import { CITED_PAGE } from '../fixtures/report-data.ts'

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

/** in-page-links.ts as the fixture server serves it to the page, read through the browser's own parser. */
const MODULE = `/@fs${fileURLToPath(new URL('../src/features/artifacts/in-page-links.ts', import.meta.url))}`

test('HTML · only links to the page’s own fragments change in the framed copy; one read differently is framed as stored', async ({
  page,
}) => {
  await page.goto('/room.html')
  const framedOf = (pages: string[]) =>
    page.evaluate(
      async ([path, all]) => {
        const loaded: unknown = await import(path)
        const framed: unknown = typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'framed') : null
        if (typeof framed !== 'function') throw new Error('in-page-links.ts has no framed()')
        return all.map((html) => String(Reflect.apply(framed, undefined, [html])))
      },
      [MODULE, pages] as const,
    )
  const head = '<!doctype html><html><head><title>t</title></head><body>'
  const pages = [
    `${head}<p>No links.</p></body></html>`,
    `${head}<p><a href="#a">1</a> <A HREF='#b'>2</A> <a href=#c>3</a> <a href=" #d ">4</a></p><map><area href="#e"></map></body></html>`,
    `${head}<p><a href="https://example.test/#a">x</a> <a href="other.html#a">y</a> <a href="">z</a></p></body></html>`,
    `${head}<p>Write href="#a" as text.</p><!-- <a href="#b"> --><textarea><a href="#c"></textarea></body></html>`,
    // An entity the browser reads as "#a" that the copy would leave: framed exactly as stored, never half-changed.
    `${head}<p><a href="&#35;a">1</a> <a href="#b">2</a></p></body></html>`,
  ]
  expect(await framedOf(pages)).toEqual([
    pages[0],
    `${head}<p><a href="about:srcdoc#a">1</a> <A HREF='about:srcdoc#b'>2</A> <a href=about:srcdoc#c>3</a> <a href="about:srcdoc#d">4</a></p><map><area href="about:srcdoc#e"></map></body></html>`,
    pages[2],
    pages[3],
    pages[4],
  ])
  // The page Sophia published: its six markers' links change, and not one other byte.
  const [cited] = await framedOf([CITED_PAGE.text])
  expect(cited).toBe(CITED_PAGE.text.replaceAll('href="#source-1"', 'href="about:srcdoc#source-1"'))
  expect(CITED_PAGE.text.split('href="#source-1"')).toHaveLength(7)
})
