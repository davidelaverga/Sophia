import type { ChatCaption } from '@sophia/contracts/room-chat'
import { expect, test, type Page } from '@playwright/test'

// Sophia's voice through a report shown to everyone (docs/plans/room-voice-trail.md): the words she says light up in
// the text, from the captions the room already gets, and the section index marks where she is. Every word here is
// synthetic, the fixture report's second version.

const MARCO = '00000000-0000-4000-8000-0000000000b1'
const EXCHANGE = '00000000-0000-4000-8000-0000000000ae'

let n = 0
const caption = (text: string, actorId: string | null = null): ChatCaption => {
  n += 1
  return {
    kind: 'caption',
    id: `00000000-0000-4000-8000-0000000000c${String(n % 10)}`,
    exchangeId: EXCHANGE,
    speaker: actorId === null ? 'sophia' : 'member',
    actorId,
    sequence: 1,
    state: 'partial',
    text,
  }
}

const say = (page: Page, packet: ChatCaption) => page.evaluate((p) => window.fixture?.caption(p), packet)
const presented = (page: Page) => page.getByRole('region', { name: /^Fixture report, shown by/ })
const spoken = (page: Page) => presented(page).locator('.md [data-spoken]')
const sections = (page: Page) => presented(page).getByRole('navigation', { name: 'Sections' })
const here = (page: Page) => sections(page).locator('[data-sophia]')
/** The words the page lights, as the highlight registry holds them. */
const lit = (page: Page) =>
  page.evaluate(() => {
    const ranges = CSS.highlights.get('sophia-spoken')
    return [...(ranges ?? [])].map((r) => {
      const copy = document.createRange()
      copy.setStart(r.startContainer, r.startOffset)
      copy.setEnd(r.endContainer, r.endOffset)
      return copy.toString()
    })
  })

async function following(page: Page) {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=speaking&versions=2')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.evaluate(() => window.fixture?.show(1))
  await page.locator('.stage-showing').getByRole('button', { name: 'Follow' }).click()
  await expect(presented(page).getByText('Read it once, then again.')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  n = 0
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('voice · the words she says light up in the text, and the index marks her section', async ({ page }) => {
  await following(page)
  await expect(sections(page).getByRole('link')).toHaveText(['Fixture report', 'Conclusion', 'Recommendations'])
  await expect(here(page)).toHaveCount(0)
  await say(page, caption('So this is the second version of a labelled fixture report'))
  await expect(spoken(page)).toHaveText(/^The second version of a labelled fixture report/)
  await expect.poll(() => lit(page)).toEqual(['The second version of a labelled fixture report'])
  await expect(here(page)).toContainText('Fixture report')
})

test('voice · as she moves on, the light and her mark move with her', async ({ page }) => {
  await following(page)
  await say(page, caption('So this is the second version of a labelled fixture report'))
  await expect(here(page)).toContainText('Fixture report')
  await say(page, caption('and my advice is to read it once, then again'))
  await expect(spoken(page)).toHaveText('Read it once, then again.')
  await expect(spoken(page)).toHaveCount(1)
  await expect(here(page)).toContainText('Recommendations')
})

test('voice · a member’s words light nothing; her light goes when they speak after her', async ({ page }) => {
  await following(page)
  await say(page, caption('the second version of a labelled fixture report', MARCO))
  await expect(spoken(page)).toHaveCount(0)
  expect(await lit(page)).toEqual([])
  await say(page, caption('So this is the second version of a labelled fixture report'))
  await expect(spoken(page)).toHaveCount(1)
  await say(page, caption('and what about the second version of it', MARCO))
  await expect(spoken(page)).toHaveCount(0)
  await expect(here(page)).toHaveCount(0)
})

test('voice · hers outside the text light nothing', async ({ page }) => {
  await following(page)
  await say(page, caption('nothing of what she says is in the text'))
  await expect(spoken(page)).toHaveCount(0)
  expect(await lit(page)).toEqual([])
})

test('voice · a citation’s number is not a word: the words around it are hers', async ({ page }) => {
  await following(page)
  await say(page, caption('as you see it cites one page there'))
  await expect(spoken(page)).toHaveText(/^It cites one page/)
  await expect.poll(() => lit(page)).toEqual(['It cites one page'])
})

test('voice · in one turn, as she goes from a paragraph to the next, the light goes with her', async ({ page }) => {
  await following(page)
  await say(
    page,
    caption(
      'the second version of a labelled fixture report, published while the first was read. Read it once, then again',
    ),
  )
  await expect(spoken(page)).toHaveText('Read it once, then again.')
  await expect(here(page)).toContainText('Recommendations')
})

test('voice · a section in the index takes the reader there', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 })
  await following(page)
  await sections(page).getByRole('link', { name: 'Recommendations' }).click()
  // At the top of the reading area, or as near as the text lets it come: the area scrolled as far as it goes.
  const placed = await presented(page)
    .locator('#md-recommendations')
    .evaluate((h) => {
      const area = h.closest('.report-main-body')
      if (!area) return { top: Number.NaN, end: false }
      const top = h.getBoundingClientRect().top - area.getBoundingClientRect().top
      return { top, end: area.scrollTop > 0 && area.scrollTop >= area.scrollHeight - area.clientHeight - 1 }
    })
  expect(placed.top < 40 || placed.end, `top ${String(placed.top)}`).toBe(true)
})
