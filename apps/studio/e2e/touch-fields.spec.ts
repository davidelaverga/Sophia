import { expect, test, type Browser, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// A phone's room (docs/plans/touch-fields.md): the fields a person types in on touch are 16 px, so the browser
// doesn't zoom into them, at the height they had; and a session's time range never breaks across lines. Every name
// is synthetic, and the page says it is a fixture.

/** A phone: 390 px, touch. Where the browser doesn't report a coarse pointer for it, the check says so and skips. */
async function phone(browser: Browser, path: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto(path)
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  test.skip(!coarse, 'this browser does not report a coarse pointer for a touch context')
  return page
}

/**
 * A field's type size, and whether it and its row stand as tall as they would at the 13 px it had: read at once both
 * ways, so the fonts of the machine running it don't matter.
 */
const sized = (page: Page, selector: string, row: string) =>
  page.locator(selector).evaluate((el: HTMLElement, rowOf) => {
    const box = el.closest(rowOf)
    const heights = () => [el, box].map((e) => Math.round(e?.getBoundingClientRect().height ?? 0)).join(' ')
    const now = heights()
    const font = getComputedStyle(el).fontSize
    el.style.fontSize = '13px'
    const before = heights()
    el.style.fontSize = ''
    return { font, sameHeight: now === before }
  }, row)

test('touch · the chat’s field and Invite’s addresses are 16 px, at the height they had', async ({ browser }) => {
  const page = await phone(browser, '/room.html?demo=1')
  await drawn(page, DRAWN.room)
  const chat = page.getByRole('button', { name: 'Chat', exact: true })
  if ((await chat.getAttribute('aria-pressed')) !== 'true') await chat.click()
  await expect(page.locator('.message-bar textarea')).toBeVisible()
  const same = { font: '16px', sameHeight: true }
  expect(await sized(page, '.message-bar textarea', '.message-bar')).toEqual(same)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  expect(await sized(page, '#member-email', '.field')).toEqual(same)
  await page.getByRole('tab', { name: 'Guests' }).click()
  expect(await sized(page, '#guest-email', '.field')).toEqual(same)
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
  await page.context().close()
})

test('touch · the session’s time range («18:30 – 19:30») stays on one line at 390 px', async ({ browser }) => {
  const page = await phone(browser, '/room.html?demo=1&session=soon')
  const line = page.locator('.line-session')
  await expect(line).toContainText('starts in 10 min')
  // Where the line breaks, it breaks outside the range: start, dash and end share one line box.
  const range = await line.evaluate((el) => {
    const text = el.firstChild
    if (!(text instanceof Text)) return null
    const dash = text.data.indexOf('–')
    const tops = [dash - 6, dash, dash + 7].map((i) => {
      const r = document.createRange()
      r.setStart(text, i)
      r.setEnd(text, i + 1)
      return Math.round(r.getBoundingClientRect().top)
    })
    return new Set(tops).size
  })
  expect(range).toBe(1)
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
  await page.context().close()
})
