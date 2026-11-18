import { expect, test, type Locator, type Page } from '@playwright/test'

// One icon family (docs/plans/conversations-kit-icons.md): Conversations' icon presses draw the kit's Icon (`svg.icon`,
// its 24-unit grid), not glyphs of their own, at the box, name and focus ring they had (32 px on a desktop, 40 px on
// touch). On the fixture page; only the API is faked.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const context = (page: Page) => page.getByRole('complementary', { name: 'Project context' })
const start = (page: Page) => list(page).getByRole('button', { name: 'New conversation', exact: true })
const back = (page: Page) => open(page).getByRole('button', { name: 'All conversations', exact: true })
const toggle = (page: Page) => open(page).getByRole('button', { name: 'Context', exact: true })
const close = (page: Page) => context(page).getByRole('button', { name: 'Close the context', exact: true })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** What a press draws and how it stands: its one picture, the kit's or not, its box and its focus ring. */
const look = (press: Locator) =>
  press.evaluate((el) => {
    const pictures = [...el.querySelectorAll('svg')]
    const r = el.getBoundingClientRect()
    const ring = getComputedStyle(el)
    return {
      pictures: pictures.length,
      kit: pictures.every((svg) => svg.classList.contains('icon') && svg.getAttribute('viewBox') === '0 0 24 24'),
      hidden: pictures.every((svg) => svg.getAttribute('aria-hidden') === 'true'),
      box: [Math.round(r.width), Math.round(r.height)],
      ring: el.matches(':focus-visible') ? ring.outlineStyle : 'not focused',
    }
  })

const KIT_32 = { pictures: 1, kit: true, hidden: true, box: [32, 32] }

test('icons · on a desktop, New conversation draws the kit’s plus at 32 px, its ring on the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.goto(PAGE)
  await start(page).focus()
  expect(await look(start(page))).toEqual({ ...KIT_32, ring: 'solid' })
})

test('icons · under 1180 px, the context’s Close draws the kit’s close at 32 px, its ring on the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto(PAGE)
  await toggle(page).press('Enter')
  await expect(close(page)).toBeFocused()
  expect(await look(close(page))).toEqual({ ...KIT_32, ring: 'solid' })
})

test('icons @phone · on touch, New conversation, back and Close draw the kit’s icons at 40 px', async ({ page }) => {
  await page.goto(PAGE)
  const seen = { start: await look(start(page)), back: {}, close: {} }
  await rows(page).first().click()
  seen.back = await look(back(page))
  await toggle(page).click()
  await expect(context(page)).toBeVisible()
  seen.close = await look(close(page))
  // Its ring is the desktop checks' business: a finger's press shows none.
  const KIT_40 = expect.objectContaining({ pictures: 1, kit: true, hidden: true, box: [40, 40] })
  expect(seen).toEqual({ start: KIT_40, back: KIT_40, close: KIT_40 })
})

const send = (page: Page) => open(page).getByRole('button', { name: 'Send', exact: true })
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })

test('icons · under 1180 px, «Context» and Send draw the kit’s icons at their boxes, their rings on the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto(PAGE)
  await field(page).fill('Ready to go.')
  await toggle(page).focus()
  const opener = await look(toggle(page))
  await send(page).focus()
  expect({ context: opener, send: await look(send(page)) }).toEqual({
    context: { ...KIT_32, ring: 'solid' },
    send: { ...KIT_32, box: [36, 36], ring: 'solid' },
  })
})

test('icons @phone · on touch, «Context» and Send draw the kit’s icons at 40 px', async ({ page }) => {
  await page.goto(PAGE)
  await rows(page).first().click()
  await field(page).fill('Reach')
  const KIT_40 = expect.objectContaining({ pictures: 1, kit: true, hidden: true, box: [40, 40] })
  expect({ context: await look(toggle(page)), send: await look(send(page)) }).toEqual({ context: KIT_40, send: KIT_40 })
})
