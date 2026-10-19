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
  // In a call: drawn once the call is live, not while it is still joining (C57: under load the room drew its pre-join
  // controls first, then the call replaced «Check audio and video» and moved Chat, People and Brief along the dock).
  [
    'the room in a call',
    '/room.html?demo=1&call=on&people=2&floor=1&sophia=listening',
    [...DRAWN.room.slice(0, 1), (page: Page) => page.getByRole('button', { name: 'Leave the room' })],
  ],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations', DRAWN.conversations],
  ['Goals', '/room.html?demo=1&place=goals', DRAWN.goals],
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
  ['Resources', '/resources.html', DRAWN.resources],
  ['the work space', '/work.html', DRAWN.work],
] as const

/**
 * A press a person can see and may press: a button, a link, anything in the button, tab or menu item role; not the
 * one that is already on (the page's own link, the chosen tab or option), which a press would not change.
 */
const PRESSES = [
  'summary', // a native disclosure (the mission's «Settings and history») is a press too (Codex on #232)
  'select', // a select (the Invite sheet's Length) and a checkbox (the carry package's) are presses too (Codex on #232)
  'input[type="checkbox"]',
  'input[type="date"]', // Calendar's native pickers are presses too (Codex P2 on #232)
  'input[type="time"]',
  'button:not([aria-checked="true"]):not([aria-selected="true"]):not(.segmented [aria-pressed="true"])',
  'a[href]:not([aria-current])',
  '[role="button"]',
  '[role="tab"]:not([aria-selected="true"])',
  '[role="menuitem"]',
  '[role="menuitemradio"]:not([aria-checked="true"])',
].join(', ')

/** In the page (inside `scope`): the presses on screen, each with its index in that order, its name and its centre. */
function listPresses({ selector, scope }: { selector: string; scope: string }) {
  const within = document.querySelector(scope) ?? document.body
  return [...within.querySelectorAll<HTMLElement>(selector)].flatMap((el, i) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    // Inside a box that scrolls (the views' nav), what lies past its edge is not on screen.
    const clipped = (() => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX
        if (o !== 'auto' && o !== 'scroll') continue
        const b = a.getBoundingClientRect()
        if (r.left < b.left - 0.5 || r.right > b.right + 0.5) return true
      }
      return false
    })()
    const seen = (() =>
      r.width > 0 &&
      r.height > 0 &&
      cs.visibility !== 'hidden' &&
      r.top >= 0 &&
      r.bottom <= innerHeight &&
      r.left >= 0 &&
      !clipped)()
    const live = (() =>
      !el.closest('.fixture-label') && !el.matches(':disabled') && el.getAttribute('aria-disabled') !== 'true')()
    // A point of the press the pointer reaches: its centre, else another of its points; one covered all over (a dock or
    // a sticky bar over it at this width) is not a press a person can point at here (CI's layout differs from a desk's).
    const reached = (() =>
      [0.5, 0.25, 0.75]
        .flatMap((f) => [
          { x: r.left + r.width * f, y: r.top + r.height / 2 },
          { x: r.left + r.width / 2, y: r.top + r.height * f },
        ])
        .find((p) => {
          const top = document.elementFromPoint(p.x, p.y)
          return top !== null && el.contains(top)
        }))()
    if (!seen || !live || !reached) return []
    const name = (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 28)
    return [{ i, name: `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]} «${name}»`, ...reached }]
  })
}

/** In the page: what the pointer can change on a press and what it holds, as one string. */
function lookOf(args: { selector: string; scope: string; i: number; tips: boolean }) {
  const within = document.querySelector(args.scope) ?? document.body
  const el = within.querySelectorAll<HTMLElement>(args.selector)[args.i]
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
  // A press drawn by its label (a transparent full-chip checkbox, as «Ask Sophia»): the label is what the eye sees, so
  // it is what answers; the invisible input itself does not count (Codex on #232).
  const hidden = getComputedStyle(el).opacity === '0'
  const root = hidden ? (el.closest('label') ?? el) : el
  // Without tips: a tip shows under any pointer that rests, so it can't say the press itself answers (Codex on #232).
  return [root, ...root.querySelectorAll('*')]
    .filter((e) => !(hidden && e === el))
    .filter((e) => args.tips || e.closest('.tip') === null)
    .map(read)
    .join('\n')
}

/** The presses on the page (inside `scope`: a sheet, a group, a form) that do not answer the pointer, said. */
async function unanswering(page: Page, scope = 'body', tips = true) {
  const presses = await page.evaluate(listPresses, { selector: PRESSES, scope })
  expect(presses.length).toBeGreaterThan(0)
  // A running animation changes the look by itself, so only the pointer may: an entrance (a tile arriving) is let finish,
  // and an endless one (a listening microphone's) is held still while the sweep reads (Codex P2 on #232). Holding an
  // entrance would freeze it mid-way over the hover's own look. Transitions, the hover's own, still run.
  await page.evaluate(async () => {
    // Time-based ones only (a scroll-driven animation finishes only when scrolled), and two seconds at most.
    const entrances = document
      .getAnimations()
      .filter(
        (a) =>
          !(a instanceof CSSTransition) &&
          a.timeline === document.timeline &&
          a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY,
      )
    await Promise.race([
      Promise.all(entrances.map((a) => a.finished.catch(() => undefined))),
      new Promise((done) => setTimeout(done, 2000)),
    ])
    for (const a of document.getAnimations())
      if (a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY) a.pause()
  })
  const mute: string[] = []
  for (const press of presses) {
    await page.mouse.move(0, 0)
    // The pointer left: a press it rested on (one just pressed to reach this state) eases back over 140 ms, and read at
    // once its rest is still its hover's look (Home's microphone, listening). Its transitions end before rest is read.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          // A live ring's eased share, retaken each second, is no press easing back.
          .filter((a) => a instanceof CSSTransition && !a.transitionProperty.startsWith('--'))
          .map((a) => a.finished.catch(() => undefined)),
      ),
    )
    const rest = await page.evaluate(lookOf, { selector: PRESSES, scope, i: press.i, tips })
    await page.mouse.move(press.x, press.y)
    // The kit's answers take 140 ms; on a loaded machine (CI) the hover can come later: read again until it answers,
    // a second at most, rather than once after a fixed wait.
    let over = rest
    for (let tries = 0; tries < 8 && over === rest; tries += 1) {
      await page.waitForTimeout(130)
      over = await page.evaluate(lookOf, { selector: PRESSES, scope, i: press.i, tips })
    }
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
    // The door's one press waits for a name: given one, it is a press a person can see.
    if (name === 'the door') await page.getByPlaceholder('Your name').fill('Ana')
    expect(await unanswering(page)).toEqual([])
  })
}

/**
 * States a page reaches by a press, each swept inside what it opens (Codex on #232); the last field, when false, reads
 * the presses without their tips (a control on, whose own look must answer).
 */
const REACHED: readonly [string, string, (page: Page) => Promise<void>, string, boolean?][] = [
  [
    'Conversations, the new conversation’s form open (its press on)',
    '/room.html?place=conversations&conversations=1',
    async (page) => {
      const start = page.getByRole('button', { name: 'New conversation' }).first()
      await start.click()
      await expect(start).toHaveAttribute('aria-pressed', 'true')
    },
    '.conv-list-head',
    false,
  ],
  [
    'the account menu open (its press on)',
    '/room.html?demo=1',
    async (page) => {
      await drawn(page, DRAWN.room)
      const account = page.getByRole('button', { name: 'Account' })
      await account.click()
      await expect(account).toHaveAttribute('aria-expanded', 'true')
    },
    '.account',
    false,
  ],
  [
    'Personal, the carry package open (its checkboxes)',
    '/personal.html?notes=open&ready=1&many=1',
    async (page) => {
      await page.getByRole('button', { name: 'Review what to carry' }).click()
      await expect(
        page.getByRole('group', { name: 'Carry only what you choose' }).getByRole('checkbox').first(),
      ).toBeVisible()
    },
    '.c3-pack',
  ],
  [
    'the Invite sheet’s Calendar tab (its Length select)',
    '/room.html?demo=1',
    async (page) => {
      await drawn(page, DRAWN.room)
      await page.getByRole('button', { name: 'Invite' }).click()
      await page.getByRole('tablist', { name: 'Invite' }).getByRole('tab', { name: 'Calendar' }).click()
      await expect(page.getByRole('combobox', { name: 'Length' })).toBeVisible()
    },
    '[role="tabpanel"]:not([hidden])',
  ],
  [
    'Home, its microphone listening',
    '/home.html?demo=1',
    async (page) => {
      await drawn(page, DRAWN.home)
      const mic = page.getByRole('button', { name: 'Speak instead' })
      await mic.click()
      await expect(mic).toHaveAttribute('aria-pressed', 'true')
    },
    '.hw-say',
  ],
  [
    'Personal, its microphone listening',
    '/personal.html?demo=1',
    async (page) => {
      await drawn(page, DRAWN.personal)
      await page.getByRole('button', { name: 'Talk instead' }).click()
      await expect(page.getByRole('button', { name: 'Stop listening' })).toBeVisible()
    },
    '.ps-composer',
  ],
]

for (const [name, url, reach, scope, tips = true] of REACHED) {
  test(`answers · ${name}: every press in it changes under the pointer`, async ({ page }) => {
    test.slow()
    await page.goto(url)
    await reach(page)
    expect(await unanswering(page, scope, tips)).toEqual([])
  })
}

test('answers · pressed, the kit’s four kinds sink half a pixel: a pill, a ghost, a square, a text press', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&conversations=1&place=conversations')
  await drawn(page, DRAWN.conversations)
  // One press of each kind that opens nothing over the page while held (a sheet's backdrop would take the pointer).
  // The account press is its own kind (.account-btn), not a square: the square measured is the header's Search. The
  // presses that open a sheet on release say so: the sheet is seen, then shut, before the next press.
  const kinds: [string, () => ReturnType<typeof page.locator>, boolean][] = [
    ['.pill', () => page.getByRole('button', { name: /^Join the room/ }), false],
    ['.ghost', () => page.getByRole('button', { name: 'Invite' }), true],
    ['.round', () => page.getByRole('button', { name: 'Search' }), true],
    ['.text-button', () => page.getByRole('button', { name: 'Earlier messages' }), false],
  ]
  const backdrop = page.locator('.sheet-backdrop')
  for (const [kind, find, opens] of kinds) {
    const press = find().first()
    await press.scrollIntoViewIfNeeded()
    await press.hover()
    await page.mouse.down()
    await expect(press, kind).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0.5)')
    await page.mouse.up()
    if (opens) {
      await expect(backdrop).toHaveCount(1)
      await page.keyboard.press('Escape')
    }
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(backdrop).toHaveCount(0)
  }
})

test('answers · in light mode, an «Ask Sophia» on and a listening microphone deepen in the light halo (Codex P2 on #234)', async ({
  page,
}) => {
  await page.goto('/home.html?demo=1&theme=light')
  await drawn(page, DRAWN.home)
  const mic = page.getByRole('button', { name: 'Speak instead' })
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await mic.hover()
  // The light theme's halo channel (109 91 208), not the dark one's fixed violet (156 130 245).
  await expect.poll(() => mic.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgba\(109, 91, 208,/)
})

test('answers · in light mode, Conversations’ «Ask Sophia» on and Personal’s listening microphone deepen in the light halo too (Codex on #279)', async ({
  page,
}) => {
  await page.goto('/room.html?place=conversations&conversations=1&theme=light')
  const ask = page.locator('.conv-compose .conv-ask').first()
  await expect(ask).toBeVisible()
  if (!(await ask.locator('input').isChecked())) await ask.click()
  await expect(ask.locator('input')).toBeChecked()
  await ask.hover()
  await expect.poll(() => ask.evaluate((e) => getComputedStyle(e).backgroundColor)).toMatch(/^rgba\(109, 91, 208,/)

  await page.goto('/personal.html?demo=1&theme=light')
  await drawn(page, DRAWN.personal)
  await page.getByRole('button', { name: 'Talk instead' }).click()
  const stop = page.getByRole('button', { name: 'Stop listening' })
  await expect(stop).toHaveAttribute('aria-pressed', 'true')
  await stop.hover()
  await expect.poll(() => stop.evaluate((e) => getComputedStyle(e).backgroundColor)).toMatch(/^rgba\(109, 91, 208,/)
})
