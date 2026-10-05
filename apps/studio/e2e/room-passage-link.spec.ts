import { expect, test, type Page } from '@playwright/test'

// A link to the exact passage (docs/plans/room-passage-link.md): «Link» in the passage bar copies a link that says where
// the passage is, with no word of it; opened, the viewer lights the passage, brings it into view and takes the
// parameter out of the address. Every word is the fixture report's.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const V1 = '00000000-0000-4000-8000-0000000000d1'
const LOCATOR = /^\d+\.\d+\.\d+$/

const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const bar = (page: Page) => page.getByRole('toolbar', { name: 'The selected passage' })
const paragraph = (page: Page, text: string) => pane(page).locator('.md p', { hasText: text })
const linked = (page: Page) => pane(page).locator('.md [data-linked]')
/** The words the page lights for a linked passage, as the highlight registry holds them. */
const lit = (page: Page) =>
  page.evaluate(() =>
    [...(CSS.highlights.get('report-passage') ?? [])].map((r) => {
      const copy = document.createRange()
      copy.setStart(r.startContainer, r.startOffset)
      copy.setEnd(r.endContainer, r.endOffset)
      return copy.toString()
    }),
  )

/** Selects from one paragraph's text offset to another's, as a drag would. */
const select = (page: Page, from: { text: string; at: number }, to: { text: string; at: number }) =>
  page.evaluate(
    ([a, b]) => {
      const paragraphs = [...document.querySelectorAll('.report-pane .md p')]
      const start = paragraphs.find((p) => p.textContent === a.text)?.firstChild
      const end = paragraphs.find((p) => p.textContent === b.text)?.firstChild
      if (!start || !end) throw new Error('no paragraph')
      const range = document.createRange()
      range.setStart(start, a.at)
      range.setEnd(end, b.at)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    },
    [from, to] as const,
  )

/** Link pressed on the selection: the copied link, read back from the clipboard. */
async function copyLink(page: Page): Promise<URL> {
  await bar(page).getByRole('button', { name: 'Link' }).click()
  await expect(pane(page).locator('.passage-linked')).toHaveText('Link copied.')
  return new URL(await page.evaluate(() => navigator.clipboard.readText()))
}

async function open(page: Page, query = '') {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`/room.html?call=on&exchange=open&report=${REPORT}${query}`)
  await expect(paragraph(page, 'The fixture holds.')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('link · Link copies where the passage is, with no word of it; opened, it is lit, in view and focused', async ({
  page,
}) => {
  await open(page)
  await paragraph(page, 'Read it once.').selectText()
  const link = await copyLink(page)
  expect(link.searchParams.get('report')).toBe(REPORT)
  expect(link.searchParams.get('version')).toBe(V1)
  expect(link.searchParams.get('passage')).toMatch(LOCATOR)
  expect(link.href.toLowerCase()).not.toContain('read')
  expect(link.href.toLowerCase()).not.toContain('once')
  await page.setViewportSize({ width: 1280, height: 420 })
  await page.goto(link.pathname + link.search)
  await expect(linked(page)).toHaveText('Read it once.')
  await expect(linked(page)).toBeInViewport()
  await expect(linked(page)).toBeFocused()
  await expect.poll(() => lit(page)).toEqual(['Read it once'])
  // Decided, it is taken out of the address: another tab, a reload, another version never look for it again.
  await expect(page).not.toHaveURL(/passage=/)
})

test('link · a selection begun and ended mid-word takes the words whole', async ({ page }) => {
  await open(page)
  await select(page, { text: 'The fixture holds.', at: 1 }, { text: 'The fixture holds.', at: 15 })
  const link = await copyLink(page)
  await page.goto(link.pathname + link.search)
  await expect.poll(() => lit(page)).toEqual(['The fixture holds'])
})

test('link · a selection across paragraphs links its first paragraph’s part', async ({ page }) => {
  await open(page)
  await select(page, { text: 'The fixture holds.', at: 4 }, { text: 'Read it once.', at: 4 })
  const link = await copyLink(page)
  await page.goto(link.pathname + link.search)
  await expect.poll(() => lit(page)).toEqual(['fixture holds'])
})

test('link · a passage not in the version says so', async ({ page }) => {
  await page.goto(`/room.html?report=${REPORT}&version=${V1}&passage=40.0.3`)
  await expect(pane(page).getByText('The fixture holds.')).toBeVisible()
  await expect(pane(page).locator('.report-passage-note')).toHaveText('This passage isn’t in this version.')
  expect(await lit(page)).toEqual([])
})

test('link · once the reader moves to another version, the passage is neither lit nor said missing', async ({
  page,
}) => {
  await open(page)
  await paragraph(page, 'Read it once.').selectText()
  const link = await copyLink(page)
  await page.goto(`${link.pathname}${link.search}&versions=2`)
  await expect(linked(page)).toHaveCount(1)
  await pane(page).getByRole('button', { name: 'Show it' }).click()
  await expect(pane(page).getByText('Read it once, then again.')).toBeVisible()
  await expect(linked(page)).toHaveCount(0)
  await expect(pane(page).locator('.report-passage-note')).toHaveCount(0)
  expect(await lit(page)).toEqual([])
})

test('link · where there is no clipboard, the link is shown, focused and selected, to copy by hand', async ({
  page,
}) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }))
  await page.goto(`/room.html?call=on&exchange=open&report=${REPORT}`)
  await expect(paragraph(page, 'The fixture holds.')).toBeVisible()
  await paragraph(page, 'The fixture holds.').selectText()
  await bar(page).getByRole('button', { name: 'Link' }).click()
  const field = pane(page).getByRole('textbox', { name: 'Link to the passage' })
  await expect(field).toBeFocused()
  expect(new URL(await field.inputValue()).searchParams.get('passage')).toMatch(LOCATOR)
})

test('link · a reader who moved to another version before the text came is not shown the passage there', async ({
  page,
}) => {
  await open(page)
  await paragraph(page, 'Read it once.').selectText()
  const link = await copyLink(page)
  // The text waits; meanwhile the reader takes the offer of v2, whose text also has these words.
  await page.goto(`${link.pathname}${link.search}&versions=2&hold=text`)
  await pane(page).getByRole('button', { name: 'Show it' }).click()
  await page.evaluate(() => window.fixture?.releaseText())
  await expect(pane(page).getByText('Read it once, then again.')).toBeVisible()
  await expect(linked(page)).toHaveCount(0)
  expect(await lit(page)).toEqual([])
})

test('link · a passage with a citation is found though the sources come after the text', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`/room.html?call=on&exchange=open&versions=3&report=${REPORT}`)
  await expect(pane(page).getByRole('button', { name: /Source 1/ })).toBeVisible()
  await paragraph(page, 'It cites one page').selectText()
  const link = await copyLink(page)
  // Until its sources come, the citation is drawn as its label: the passage is looked for once they have.
  await page.goto(`${link.pathname}${link.search}&versions=3&hold=sources`)
  await expect(paragraph(page, 'It cites one page')).toBeVisible()
  await expect(pane(page).locator('.report-passage-note')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.releaseSources())
  await expect(linked(page)).toHaveCount(1)
  await expect.poll(async () => (await lit(page))[0] ?? '').toMatch(/^It cites one page/)
})

test('link · the Sources tab and back keep the passage lit', async ({ page }) => {
  await open(page)
  await paragraph(page, 'Read it once.').selectText()
  const link = await copyLink(page)
  await page.goto(link.pathname + link.search)
  await expect(linked(page)).toHaveText('Read it once.')
  await pane(page)
    .getByRole('tab', { name: /^Sources/ })
    .click()
  await pane(page).getByRole('tab', { name: 'Document' }).click()
  await expect(linked(page)).toHaveText('Read it once.')
  await expect.poll(() => lit(page)).toEqual(['Read it once'])
})
