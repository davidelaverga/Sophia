import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// Every press answers (docs/plans/press-answers.md, informe-30 §2.3): on each fixture page, once drawn, every press a
// person can see changes under the pointer (its own ink, plane, edge, shadow, line or a child's), and the kit's four
// kinds sink half a pixel while pressed. Measured on a desktop, with a real pointer.

const PAGES = [
  ['sign-in', '/signin.html', DRAWN.signin],
  ['the door', '/join.html?demo=1', DRAWN.join],
  ['home', '/home.html?demo=1', DRAWN.home],
  ['personal', '/personal.html?demo=1', DRAWN.personal],
  ['the room', '/room.html?demo=1', DRAWN.room],
  ['the room in a call', '/room.html?demo=1&call=on&people=2&floor=1&sophia=listening', DRAWN.room.slice(0, 1)],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations', DRAWN.conversations],
  ['Goals', '/room.html?demo=1&place=goals', DRAWN.goals],
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
  ['Resources', '/resources.html', DRAWN.resources],
  ['the work space', '/work.html', DRAWN.work],
] as const

/** A press a person can see and may press: a button, a link, anything in the button, tab or menu item role. */
const PRESSES = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"]'

/** In the page: the presses on screen, each with its index in the page's order, its name and its centre. */
function listPresses(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].flatMap((el, i) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const seen =
      r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0
    const live =
      !el.closest('.fixture-label') && !el.matches(':disabled') && el.getAttribute('aria-disabled') !== 'true'
    if (!seen || !live) return []
    const name = (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 28)
    return [
      {
        i,
        name: `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]} «${name}»`,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      },
    ]
  })
}

/** In the page: what the pointer can change on a press and what it holds, as one string. */
function lookOf(args: { selector: string; i: number }) {
  const el = document.querySelectorAll<HTMLElement>(args.selector)[args.i]
  if (!el) return ''
  const keys = [
    'color',
    'backgroundColor',
    'borderTopColor',
    'boxShadow',
    'opacity',
    'transform',
    'textDecorationColor',
    'textDecorationLine',
    'outlineColor',
    'filter',
  ] as const
  const read = (e: Element) => {
    const cs = getComputedStyle(e)
    return keys.map((k) => cs[k]).join('|')
  }
  return [el, ...el.querySelectorAll('*')].map(read).join('\n')
}

/** The presses on the page that do not answer the pointer, said. */
async function unanswering(page: Page) {
  const presses = await page.evaluate(listPresses, PRESSES)
  expect(presses.length).toBeGreaterThan(0)
  const mute: string[] = []
  for (const press of presses) {
    await page.mouse.move(0, 0)
    const rest = await page.evaluate(lookOf, { selector: PRESSES, i: press.i })
    await page.mouse.move(press.x, press.y)
    // The kit's answers take 140 ms; the slowest a step more.
    await page.waitForTimeout(260)
    const over = await page.evaluate(lookOf, { selector: PRESSES, i: press.i })
    if (over === rest) mute.push(press.name)
  }
  await page.mouse.move(0, 0)
  return mute
}

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
    ...(window.workFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

for (const [name, url, parts] of PAGES) {
  test(`answers · on ${name}, every press a person can see changes under the pointer`, async ({ page }) => {
    test.slow()
    await page.goto(url)
    // The page has drawn: each of its reads (drawn.ts), never «the network is idle».
    await drawn(page, parts)
    expect(await unanswering(page)).toEqual([])
  })
}

test('answers · pressed, the kit’s four kinds sink half a pixel: a pill, a ghost, a square, a text press', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&conversations=1&place=conversations')
  await drawn(page, DRAWN.conversations)
  for (const kind of ['.pill', '.ghost', '.round', '.text-button']) {
    const press = page.locator(`${kind}:not(:disabled):not([aria-disabled="true"])`).first()
    await press.scrollIntoViewIfNeeded()
    await press.hover()
    await page.mouse.down()
    await expect(press, kind).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0.5)')
    await page.mouse.up()
    await page.keyboard.press('Escape')
  }
})
