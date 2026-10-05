import { expect, test, type Locator, type Page } from '@playwright/test'
import { contrastOf, lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Personal's fixture page (fixtures/personal.tsx): the Studio's own PersonalSpace over a labelled simulated
// conversation. The "$20" pass (docs/plans/personal-pass.md): speakers marked by Umbral's halves, no bubbles, Home's
// head, rows and line.

const PAGE = '/personal.html'

const sent = (page: Page) => page.evaluate(() => window.personalFixture?.sent ?? [])
const pressed = (page: Page) => page.evaluate(() => window.personalFixture?.pressed ?? [])
const field = (page: Page) => page.locator('#c-input')
const css = (page: Page, selector: string, property: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property)

test('personal · each speaker’s turn begins with its half of Umbral: hers small and light, yours warm', async ({
  page,
}) => {
  await page.goto(PAGE)
  const firsts = page.locator('.msg.first:not(.typing)')
  const count = await firsts.count()
  expect(count).toBeGreaterThan(3)
  for (let i = 0; i < count; i++) {
    const turn = firsts.nth(i)
    const who = (await turn.getAttribute('class'))?.includes(' me ') ? 'you' : 'sophia'
    await expect(turn.locator('svg.c3-who')).toHaveAttribute('data-who', who)
  }
  await expect(page.locator('.s-dot')).toHaveCount(0)
  // The halves are drawn, never read; each turn still says who speaks.
  expect(await page.locator('svg.c3-who:not([aria-hidden="true"])').count()).toBe(0)
  await expect(page.locator('.msg.me .sr-only').first()).toHaveText('You:')
  await expect(page.locator('.msg.sophia .sr-only').first()).toHaveText('Sophia:')
  // A turn that follows one of its own side carries no mark: they read as one.
  await expect(page.locator('.msg.cont svg.c3-who')).toHaveCount(0)
})

test('personal · no bubbles: both sides start on one column, yours with no box, border or fill', async ({ page }) => {
  await page.goto(PAGE)
  const mine = page.locator('.msg.me .body').first()
  const hers = page.locator('.msg.sophia .body').first()
  expect(await mine.evaluate((b) => getComputedStyle(b).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  expect(await mine.evaluate((b) => getComputedStyle(b).borderTopWidth)).toBe('0px')
  const [a, b] = [await mine.boundingBox(), await hers.boundingBox()]
  expect(Math.abs((a?.x ?? 0) - (b?.x ?? 1))).toBeLessThanOrEqual(1)
  // Your words in your warm colour, hers at full contrast: two voices, not two boxes.
  expect(await mine.evaluate((m) => getComputedStyle(m).color)).not.toBe(
    await hers.evaluate((h) => getComputedStyle(h).color),
  )
})

test('personal · the head is Home’s: a quiet label, and the notes as a count in words', async ({ page }) => {
  await page.goto(PAGE)
  expect(await css(page, '#c-p-h', 'font-family')).toMatch(/Mono/i)
  const toggle = page.getByRole('button', { name: /1 note/ })
  await expect(toggle).toBeVisible()
  // On the head's line, at the far end from its label: neither covers the other.
  const [label, notes] = [await page.locator('#c-p-h').boundingBox(), await toggle.boundingBox()]
  if (!label || !notes) throw new Error('no head')
  expect(notes.x).toBeGreaterThan(label.x + label.width + 24)
  expect(Math.abs(notes.y + notes.height / 2 - (label.y + label.height / 2))).toBeLessThanOrEqual(4)
  expect(notes.width).toBeLessThan(120)
})

test('personal · with no notes yet, the toggle is still there, says so, and opens them', async ({ page }) => {
  await page.goto(`${PAGE}?notes=none`)
  const toggle = page.getByRole('button', { name: /No notes/ })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(page.locator('#c-notes')).toBeVisible()
})

test('personal · nothing said yet: the ways to start are rows, each a sentence and an arrow; one press sends it', async ({
  page,
}) => {
  await page.goto(`${PAGE}?talk=new`)
  const ways = page.getByRole('group', { name: 'Ways to start' }).getByRole('button')
  await expect(ways).toHaveCount(3)
  expect(await css(page, '.c3-starters button', 'border-left-width')).toBe('0px')
  await expect(ways.first().locator('.c3-go')).toHaveText('→')
  const words = (await ways.first().locator('.c3-way').textContent()) ?? ''
  await ways.first().click()
  await expect.poll(() => sent(page)).toEqual([words])
})

test('personal · the field is Home’s line: no box, and its hairline turns violet while you write', async ({ page }) => {
  await page.goto(PAGE)
  const bar = '.ps-composer .message-bar'
  expect(await css(page, bar, 'border-left-width')).toBe('0px')
  expect(await css(page, bar, 'background-color')).toBe('rgba(0, 0, 0, 0)')
  const before = await css(page, bar, 'border-top-color')
  await field(page).focus()
  await expect.poll(() => css(page, bar, 'border-top-color')).not.toBe(before)
  await expect(page.locator('.ps-composer .c3-private')).toHaveAttribute('title', 'Only she hears this')
  await expect(field(page)).toHaveAccessibleDescription('Only she hears this')
})

test('personal · a message goes as before, and Sophia answers under it', async ({ page }) => {
  await page.goto(PAGE)
  await field(page).fill('How do I start the email to Davide?')
  await page.keyboard.press('Enter')
  await expect.poll(() => sent(page)).toEqual(['How do I start the email to Davide?'])
  await expect(page.locator('.msg.sophia .body').last()).toHaveText('I’m here. Tell me more about that.')
})

test('personal · on your turn, Note this and its time show on hover', async ({ page }) => {
  await page.goto(PAGE)
  const mine = page.locator('.msg.me').last()
  await mine.hover()
  await expect.poll(() => mine.locator('.note-this').evaluate((n) => getComputedStyle(n).opacity)).toBe('1')
  await expect.poll(() => mine.locator('.at').evaluate((n) => getComputedStyle(n).opacity)).toBe('1')
  const [at, note] = [await mine.locator('.at').boundingBox(), await mine.locator('.note-this').boundingBox()]
  if (!at || !note) throw new Error('no time or Note this')
  expect(note.x).toBeGreaterThanOrEqual(at.x + at.width + 4)
})

test('personal · Note this opens its form under your turn, on the words’ side', async ({ page }) => {
  await page.goto(PAGE)
  const mine = page.locator('.msg.me').last()
  await mine.hover()
  await mine.locator('.note-this').click()
  const [form, words] = [await page.locator('.c3-noteform').boundingBox(), await mine.locator('.body').boundingBox()]
  if (!form || !words) throw new Error('no form')
  expect(Math.abs(form.x - words.x)).toBeLessThanOrEqual(1)
  // While its form is open, the turn offers no second Note this.
  await expect(mine.locator('.note-this')).toHaveCount(0)
})

test('personal · while she writes, her half breathes; with less motion asked for, it is still', async ({ page }) => {
  const running = () =>
    page
      .locator('.msg.typing svg.c3-who[data-who="sophia"]')
      .evaluate((s) => s.getAnimations().filter((a) => a.playState === 'running').length)
  await page.goto(`${PAGE}?writing=1`)
  expect(await running()).toBeGreaterThan(0)
  // Seen in words too, so it reads as her writing with motion or without.
  await expect(page.locator('.msg.typing .body')).toHaveText('Sophia is writing…')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  expect(await running()).toBe(0)
})

test('personal · her suggestion reads as a line of hers, not a card: keep it or let it go', async ({ page }) => {
  await page.goto(`${PAGE}?suggestion=1`)
  const offer = page.locator('.c3-suggest').first()
  await expect(offer).toContainText('Say the date you can keep, before Thursday')
  expect(await offer.evaluate((o) => getComputedStyle(o).borderTopWidth)).toBe('0px')
  expect(await offer.evaluate((o) => getComputedStyle(o).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await expect(offer.getByRole('button', { name: 'Keep' })).toBeVisible()
})

test('personal · beside the conversation, the notes are a column on a hairline, not a card', async ({ page }) => {
  await page.goto(`${PAGE}?notes=open`)
  const notes = page.locator('#c-notes')
  await expect(notes).toBeVisible()
  expect(await notes.evaluate((n) => getComputedStyle(n).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  expect(await notes.evaluate((n) => getComputedStyle(n).boxShadow)).toBe('none')
  expect(await css(page, '#c-notes-h', 'font-family')).toMatch(/Mono/i)
})

test('personal · where the notes can’t sit beside the conversation, they cover what they overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto(`${PAGE}?notes=open`)
  const [notes, convo] = [await page.locator('#c-notes').boundingBox(), await page.locator('.c3-convo').boundingBox()]
  if (!notes || !convo) throw new Error('no notes or conversation')
  // Here they overlap the conversation's column, so they must not be see-through.
  expect(notes.x).toBeLessThan(convo.x + convo.width)
  expect(await css(page, '#c-notes', 'background-color')).not.toBe('rgba(0, 0, 0, 0)')
})

test('personal · a reply that failed can be asked again', async ({ page }) => {
  await page.goto(`${PAGE}?failed=1`)
  await expect(page.getByRole('button', { name: 'Ask again' })).toBeVisible()
})

test('@phone · personal · every half sits inside the gutter, and nothing goes past the screen', async ({ page }) => {
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(PAGE)
    const halves = await page.locator('svg.c3-who').evaluateAll((all) => all.map((h) => h.getBoundingClientRect().left))
    expect(halves.length).toBeGreaterThan(3)
    for (const left of halves) expect(left, `${String(width)} px`).toBeGreaterThanOrEqual(16)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.locator('.c3-space').evaluate((s) => s.scrollWidth <= s.clientWidth)).toBe(true)
    expect(await page.locator('.msgs').evaluate((m) => m.scrollWidth <= m.clientWidth)).toBe(true)
    // A touch size for the notes toggle.
    const toggle = await page.getByRole('button', { name: /note/ }).boundingBox()
    expect(toggle?.height ?? 0).toBeGreaterThanOrEqual(40)
  }
})

// What would make it worth $20 (docs/plans/personal-twenty.md).

test('$20 · on a new day, how you arrive: three answers under her line; one press sends it, and they go', async ({
  page,
}) => {
  await page.goto(`${PAGE}?arrive=1`)
  const ways = page.getByRole('group', { name: 'How you arrive today' }).getByRole('button')
  await expect(ways).toHaveText(['Light today→', 'Steady→', 'Heavy today→'])
  await ways.nth(2).click()
  await expect.poll(() => sent(page)).toEqual(['Heavy today.'])
  await expect(page.getByRole('group', { name: 'How you arrive today' })).toHaveCount(0)
})

test('$20 · a session about to start leads the ways in: get ready for it with her', async ({ page }) => {
  await page.goto(`${PAGE}?talk=new&ready=1`)
  const first = page.getByRole('group', { name: 'Ways to start' }).getByRole('button').first()
  await expect(first).toContainText('Get ready for Standup · Product launch')
  await expect(first.locator('.c3-way-note')).toHaveText('starts in 10 min')
  await first.click()
  await expect.poll(() => sent(page)).toEqual(['Help me get ready for Standup in Product launch. It starts in 10 min.'])
  await page.goto(`${PAGE}?arrive=1&ready=1`)
  await expect(page.getByRole('group', { name: 'How you arrive today' }).getByRole('button').first()).toContainText(
    'Get ready for Standup',
  )
})

test('$20 · without the API’s parts, nothing of them shows: no memory, no week, no talk', async ({ page }) => {
  await page.goto(`${PAGE}?notes=open`)
  await expect(page.locator('#c-notes')).toBeVisible()
  await expect(page.locator('.c3-memory')).toHaveCount(0)
  await expect(page.locator('.c3-week')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Talk with her' })).toHaveCount(0)
})

test('$20 · what she remembers: each yours to correct or have her forget', async ({ page }) => {
  await page.goto(`${PAGE}?memory=1&notes=open`)
  const memory = page.getByRole('region', { name: 'She remembers' })
  await expect(memory.getByRole('listitem')).toHaveCount(3)
  await expect(memory).toContainText('Nothing here leaves this space.')
  const first = memory.getByRole('listitem').first()
  await first.hover()
  await first.getByRole('button', { name: 'Forget' }).click()
  await expect(memory.getByRole('listitem')).toHaveCount(2)
  // The focus goes on to the next one, never to the page; each button says which memory it acts on.
  const next = memory.getByRole('listitem').first()
  await expect(next.getByRole('button', { name: 'Correct' })).toBeFocused()
  await expect(next.getByRole('button', { name: 'Forget' })).toHaveAccessibleDescription(/hard date early/)
  await next.getByRole('button', { name: 'Correct' }).click()
  await page.keyboard.type('You say a hard date early.')
  await page.keyboard.press('Enter')
  await expect(next).toContainText('You say a hard date early.')
  await expect(next.getByRole('button', { name: 'Correct' })).toBeFocused()
  expect(await pressed(page)).toEqual(['forget m1', 'correct m2 You say a hard date early.'])
})

test('$20 · her look back at your week: talk about it, keep it, or not now', async ({ page }) => {
  await page.goto(`${PAGE}?week=1`)
  const week = page.getByRole('region', { name: 'Your week with Sophia' })
  await expect(week).toContainText('Thursday was the heaviest day.')
  await expect(week).toContainText('promises you can keep')
  await week.getByRole('button', { name: 'Talk about it' }).click()
  await expect.poll(() => sent(page)).toEqual(['Let’s talk about my week: the launch, promises you can keep, Davide.'])
  // Talked about, it is put away: her reply is the newest thing, under it, not above it.
  await expect(week).toHaveCount(0)
  await page.goto(`${PAGE}?week=1`)
  await page.getByRole('button', { name: 'Keep as a note' }).click()
  await expect(page.getByRole('region', { name: 'Your week with Sophia' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /2 notes/ })).toBeVisible()
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  await page.goto(`${PAGE}?week=1`)
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByRole('region', { name: 'Your week with Sophia' })).toHaveCount(0)
  expect(await pressed(page)).toEqual(['dismiss week'])
})

test('$20 · talking with her: her light, the lines as they’re said, mute; End writes them into the conversation', async ({
  page,
}) => {
  await page.goto(`${PAGE}?voice=1&step=150`)
  await page.getByRole('button', { name: 'Talk with her' }).click()
  const talk = page.getByRole('dialog', { name: 'Talking with Sophia' })
  await expect(talk.getByRole('button', { name: 'End' })).toBeFocused()
  await expect(talk.locator('.light')).toHaveAttribute('data-mark', /\d+ \d+ \d+/)
  await expect(talk.getByRole('list', { name: 'What was said' })).toContainText('He thanked me for saying it early.')
  await talk.getByRole('button', { name: 'Mute' }).click()
  await expect(talk.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'true')
  // A modal: Tab stays in it, and nothing behind it can be reached.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('.c3-talk'))).toBe(true)
  await talk.getByRole('button', { name: 'End', exact: true }).click()
  await expect(talk).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Talk with her' })).toBeFocused()
  await expect(page.locator('.msg .body').last()).toHaveText('He thanked me for saying it early.')
  expect(await pressed(page)).toEqual(['mute on', 'talk ended'])
})

test('$20 · Esc ends a talk too', async ({ page }) => {
  await page.goto(`${PAGE}?voice=1&step=150`)
  await page.getByRole('button', { name: 'Talk with her' }).click()
  await expect(page.getByRole('dialog', { name: 'Talking with Sophia' })).toBeVisible()
  await page.mouse.click(640, 300) // on the talk's ground: the focus leaves its buttons, Esc still ends it
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Talking with Sophia' })).toHaveCount(0)
})

test('$20 · locking the space ends a talk at once: no voice goes on behind the padlock', async ({ page }) => {
  await page.goto(`${PAGE}?voice=1&step=150`)
  await page.getByRole('button', { name: 'Talk with her' }).click()
  await expect(page.getByRole('list', { name: 'What was said' })).toContainText('Better than I feared')
  await page.getByRole('button', { name: 'Lock (fixture)' }).click()
  await expect(page.getByRole('dialog', { name: 'Talking with Sophia' })).toHaveCount(0)
  expect(await pressed(page)).toContain('talk ended')
  // Unlocked again, it doesn't come back on its own.
  await page.getByRole('button', { name: 'Unlock (fixture)' }).click()
  await page.waitForTimeout(300)
  await expect(page.getByRole('dialog', { name: 'Talking with Sophia' })).toHaveCount(0)
})

test('@phone · $20 · the day’s answers, the week and a talk fit the phone', async ({ page }) => {
  await page.goto(`${PAGE}?arrive=1&all=1&step=150`)
  expect(await page.locator('.msgs').evaluate((m) => m.scrollWidth <= m.clientWidth)).toBe(true)
  await page.getByRole('button', { name: 'Talk with her' }).click()
  const talk = page.getByRole('dialog', { name: 'Talking with Sophia' })
  await expect(talk.getByRole('button', { name: 'End' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

// Detail and access (docs/plans/personal-detail.md): measured, not judged.

test('detail · every text in Personal reads: no contrast under 4.5:1, its times and notes included', async ({
  page,
}) => {
  await page.goto(`${PAGE}?all=1&notes=open`)
  const mine = page.locator('.msg.me').last()
  await mine.hover()
  await expect.poll(() => mine.locator('.at').evaluate((n) => getComputedStyle(n).opacity)).toBe('1')
  expect(await lowContrast(page, '.c3-space', '.c3-edge')).toEqual([])
  await page.goto(`${PAGE}?arrive=1&ready=1`)
  expect(await lowContrast(page, '.c3-space', '.c3-edge')).toEqual([])
  await page.goto(`${PAGE}?writing=1`)
  await expect(page.locator('.msg.typing .body')).toHaveText('Sophia is writing…')
  expect(await lowContrast(page, '.c3-space', '.c3-edge')).toEqual([])
})

test('detail · the field shows its focus as Home’s line does, a ring of light, not only a 1 px shift', async ({
  page,
}) => {
  await page.goto(PAGE)
  await field(page).focus()
  await expect
    .poll(() => css(page, '.ps-composer .message-bar', 'box-shadow'))
    .toMatch(/rgba\(185, 168, 255, 0\.55\) 0px -1px 0px/)
})

test('detail · every control is at least 24 px tall, the day dividers too', async ({ page }) => {
  await page.goto(`${PAGE}?all=1`)
  const short = await page
    .locator('.c3-space button:visible, .c3-space input:visible, .c3-space textarea:visible')
    .evaluateAll(
      (all) =>
        all
          .filter((el) => !el.closest('[inert], .c3-edge'))
          .map((el) => ({ name: el.textContent.trim().slice(0, 20), h: el.getBoundingClientRect().height }))
          .filter((c) => c.h < 23.5), // 24 px, a renderer's sub-pixel aside
    )
  expect(short).toEqual([])
})

test('detail · one type scale: Personal’s text comes in five sizes, in every state it shows', async ({ page }) => {
  const sizes = new Set<string>()
  const read = async () => {
    for (const part of ['.c3-space.you .c3-head', '.c3-space.you .c3-body']) {
      for (const s of await typeSizes(page, part)) sizes.add(s)
    }
  }
  for (const state of [
    '?all=1&notes=open&arrive=1&ready=1',
    '?failed=1',
    '?suggestion=1',
    '?writing=1',
    '?kept=sophia&notes=open',
  ]) {
    await page.goto(`${PAGE}${state}`)
    await read()
  }
  // Note this, open; the days, listed.
  await page.goto(PAGE)
  const mine = page.locator('.msg.me').last()
  await mine.hover()
  await mine.locator('.note-this').click()
  await read()
  await page.locator('.c3-day').first().click()
  await read()
  expect([...sizes].toSorted()).toEqual(['10.5px', '11px', '13px', '15px', '17px'])
})

test('detail · with less motion asked for, nothing in Personal moves: no breathing wash, no flicker', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${PAGE}?writing=1`)
  await page.waitForTimeout(400)
  // What loops for ever: under the global 1 ms rule it would flicker every frame.
  const moving = () =>
    page
      .locator('.c3-space')
      .evaluate(
        (s) =>
          s
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length,
      )
  expect(await moving()).toBe(0)
  await page.goto(PAGE)
  await page.getByRole('button', { name: 'Talk instead' }).click()
  await expect(page.locator('.c3-wave')).toBeVisible()
  expect(await moving()).toBe(0)
})

test('@phone · detail · a long way in wraps inside its row, its lines given room, never past it', async ({ page }) => {
  await page.goto(`${PAGE}?arrive=1&ready=1`)
  const rows = await page.locator('.c3-starters button').evaluateAll((all) =>
    all.map((r) => {
      const way = r.querySelector('.c3-way')
      const s = way ? getComputedStyle(way) : null
      return {
        over: r.scrollHeight > r.clientHeight + 1,
        leading: s ? parseFloat(s.lineHeight) / parseFloat(s.fontSize) : 0,
      }
    }),
  )
  expect(rows.filter((r) => r.over)).toEqual([])
  expect(Math.min(...rows.map((r) => r.leading))).toBeGreaterThanOrEqual(1.25)
})

test('@phone · detail · in the notes, what she remembers and your notes line up, each under its own label', async ({
  page,
}) => {
  await page.goto(`${PAGE}?memory=1&notes=open`)
  const notes = page.locator('#c-notes')
  await expect(notes.getByRole('heading', { name: 'Your notes' })).toBeVisible()
  const [memory, note] = [
    await notes.locator('.c3-mem p').first().boundingBox(),
    await notes.locator('.c2-t p').first().boundingBox(),
  ]
  expect(Math.abs((memory?.x ?? 0) - (note?.x ?? 1))).toBeLessThanOrEqual(1)
})

test('detail · “Talk with her” carries her half, as her turns do', async ({ page }) => {
  await page.goto(`${PAGE}?voice=1`)
  await expect(
    page.getByRole('button', { name: 'Talk with her' }).locator('svg.c3-who[data-who="sophia"]'),
  ).toBeAttached()
})

test('$20 · a talk covers the whole screen: nothing behind it, the bar included, can be pressed', async ({ page }) => {
  await page.goto(`${PAGE}?voice=1&step=150`)
  await page.getByRole('button', { name: 'Talk with her' }).click()
  const talk = page.getByRole('dialog', { name: 'Talking with Sophia' })
  await talk.evaluate((t) => Promise.all(t.getAnimations().map((a) => a.finished)))
  const box = await talk.boundingBox()
  const view = page.viewportSize()
  expect(box?.x).toBe(0)
  expect(box?.y).toBe(0)
  expect(box?.width).toBe(view?.width)
  expect(box?.height).toBe(view?.height)
  expect(await page.evaluate(() => !!document.elementFromPoint(4, 4)?.closest('.c3-talk'))).toBe(true)
})

test('$20 · while a message is on its way, “Talk about it” waits: the week stays until her prompt goes', async ({
  page,
}) => {
  await page.goto(`${PAGE}?week=1&slow=1`)
  await field(page).fill('One more thing about Thursday.')
  await page.keyboard.press('Enter')
  await expect(page.locator('.msg.me .body').last()).toHaveText('One more thing about Thursday.') // on its way
  await page.getByRole('button', { name: 'Talk about it' }).click()
  await expect(page.getByRole('region', { name: 'Your week with Sophia' })).toBeVisible()
  expect(await sent(page)).toEqual(['One more thing about Thursday.'])
})

// Presence (docs/plans/personal-presence.md): the conversation rests on the field, her voice reads first, and an
// exchange reads as one.

/**
 * The space between the last thing in a conversation that fits (nothing scrolled) and the field; null when either is
 * missing or the list overflows, where scrolling to its end would hide where it rests.
 */
const restsAbove = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector('.msgs')
    const said = [...document.querySelectorAll('.msgs > *')].filter((e) => e.getBoundingClientRect().height > 0)
    const bar = document.querySelector('.ps-composer .message-bar')
    const last = said.at(-1)
    if (!list || !bar || !last || list.scrollHeight > list.clientHeight) return null
    return bar.getBoundingClientRect().top - last.getBoundingClientRect().bottom
  })
/** Measured at rest: what is still arriving (a turn's fade and rise) is waited for; what loops for ever is not. */
const settled = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    ),
  )
const expectRests = async (page: Page) => {
  await settled(page)
  const gap = await restsAbove(page)
  expect(gap).not.toBeNull()
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(gap).toBeLessThanOrEqual(48)
}

test('presence · a short conversation rests on the field, not at the top of an empty room', async ({ page }) => {
  await page.goto(PAGE)
  await expectRests(page)
})

test('@phone · presence · her first greeting and the ways in sit just above where you write', async ({ page }) => {
  await page.goto(`${PAGE}?talk=new`)
  await expect(page.locator('.c3-starters')).toBeVisible()
  await expectRests(page)
})

test('@phone · presence · a long conversation still scrolls back to its first day', async ({ page }) => {
  await page.goto(PAGE)
  await settled(page)
  const list = page.locator('.msgs')
  expect(await list.evaluate((l) => l.scrollHeight > l.clientHeight)).toBe(true)
  // Where the first day stands in what scrolls: at or after its start, so scrolling up reaches it (an unsafe end
  // would push it above, where no scroll goes).
  const from = await list.evaluate((l) => {
    l.style.scrollBehavior = 'auto'
    l.scrollTop = 0
    const day = l.querySelector(':scope > .c3-day')
    return day ? day.getBoundingClientRect().top - l.getBoundingClientRect().top + l.scrollTop : null
  })
  expect(from).not.toBeNull()
  expect(from).toBeGreaterThanOrEqual(0)
})

test('presence · her voice reads first: her turns at 17 px, yours at 15', async ({ page }) => {
  await page.goto(PAGE)
  expect(await css(page, '.msg.sophia:not(.typing) .body', 'font-size')).toBe('17px')
  expect(await css(page, '.msg.me .body', 'font-size')).toBe('15px')
  await page.goto(`${PAGE}?talk=new`)
  expect(await css(page, '.msg.sophia .body', 'font-size')).toBe('17px')
})

test('presence · an exchange reads as one: her answer sits closer to you than your next turn to her', async ({
  page,
}) => {
  await page.goto(PAGE)
  await settled(page)
  const gaps = await page.evaluate(() => {
    const turns = [...document.querySelectorAll('.msgs > *')]
    const out = { answer: [] as number[], next: [] as number[] }
    for (let i = 1; i < turns.length; i++) {
      const [a, b] = [turns[i - 1], turns[i]]
      if (!a?.matches('.msg') || !b?.matches('.msg')) continue
      const gap = b.getBoundingClientRect().top - a.getBoundingClientRect().bottom
      if (a.matches('.me') && b.matches('.sophia')) out.answer.push(gap)
      if (a.matches('.sophia') && b.matches('.me')) out.next.push(gap)
    }
    return out
  })
  expect(gaps.answer.length).toBeGreaterThan(1)
  expect(gaps.next.length).toBeGreaterThan(1)
  expect(Math.max(...gaps.answer) * 2).toBeLessThan(Math.min(...gaps.next))
})

test('presence · “Write to Sophia…” reads at 4.5:1, as every word in Personal', async ({ page }) => {
  await page.goto(PAGE)
  const seen = await field(page).evaluate((f) => {
    const grounds: string[] = []
    let opacity = 1
    for (let up: Element | null = f; up; up = up.parentElement) {
      grounds.push(getComputedStyle(up).backgroundColor)
      opacity *= parseFloat(getComputedStyle(up).opacity)
    }
    const ph = getComputedStyle(f, '::placeholder')
    return { words: 'placeholder', ink: ph.color, opacity: opacity * parseFloat(ph.opacity), grounds, size: 15 }
  })
  expect(contrastOf(seen)).toBeGreaterThanOrEqual(4.5)
})

test('presence · a reply that failed stands where her answer would, as close to you', async ({ page }) => {
  await page.goto(`${PAGE}?failed=1`)
  await settled(page)
  const gap = await page
    .locator('.c3-failed')
    .evaluate((f) => f.getBoundingClientRect().top - (f.previousElementSibling?.getBoundingClientRect().bottom ?? 0))
  expect(Math.round(gap)).toBe(12)
})

test('presence · her half stays centred on her first line, a size up', async ({ page }) => {
  await page.goto(PAGE)
  await settled(page)
  const off = await page
    .locator('.msg.sophia.first:not(.typing)')
    .first()
    .evaluate((turn) => {
      const half = turn.querySelector('.c3-who')?.getBoundingClientRect()
      const body = turn.querySelector('.body')
      if (!half || !body) return null
      const line = parseFloat(getComputedStyle(body).lineHeight)
      return half.top + half.height / 2 - (body.getBoundingClientRect().top + line / 2)
    })
  expect(off).not.toBeNull()
  expect(Math.abs(off ?? 99)).toBeLessThanOrEqual(1)
})

// Touch (docs/plans/personal-moments.md §1): her words copied, a reply that lands while you read up, the field's limit
// said before it bites, a kept note that lands somewhere.

test('touch · her words can be copied from her turn, and it says so', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(PAGE)
  const hers = page.locator('.msg.sophia:not(.typing)').last()
  await hers.hover()
  await hers.getByRole('button', { name: 'Copy' }).click()
  await expect(hers.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await hers.locator('.body').innerText())
  await expect(hers.getByRole('button', { name: 'Copy' })).toBeAttached({ timeout: 3000 })
  // Your own turns keep Note this, not Copy.
  await expect(page.locator('.msg.me').getByRole('button', { name: 'Copy' })).toHaveCount(0)
})

test('touch · a copy the browser refuses says so', async ({ page }) => {
  await page.goto(PAGE)
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('refused', 'NotAllowedError'))
  })
  const hers = page.locator('.msg.sophia:not(.typing)').last()
  await hers.hover()
  await hers.getByRole('button', { name: 'Copy' }).click()
  await expect(hers.getByRole('button', { name: 'Couldn’t copy' })).toBeVisible()
})

/** Sends a message with `slow=1` (her answer 2.5 s after it lands) and reads further up before she answers. */
async function readUpWhileSheAnswers(page: Page) {
  await page.goto(`${PAGE}?slow=1`)
  await field(page).fill('One more thing.')
  await page.keyboard.press('Enter')
  await expect(page.locator('.msg.me .body').last()).toHaveText('One more thing.', { timeout: 5000 })
  const list = page.locator('.msgs')
  await list.evaluate((l) => {
    l.style.scrollBehavior = 'auto'
    l.scrollTop = 0
  })
  await expect(page.locator('.msg.sophia .body').last()).toHaveText('I’m here. Tell me more about that.', {
    timeout: 5000,
  })
  return list
}

const answeredLine = (page: Page) => page.getByRole('button', { name: 'Sophia answered' })
const toEndOf = (list: Locator) => list.evaluate((l) => l.scrollHeight - l.scrollTop - l.clientHeight)

test('@phone · touch · a reply that lands while you read further up waits below, and a press brings you to it', async ({
  page,
}) => {
  const list = await readUpWhileSheAnswers(page)
  await expect(answeredLine(page)).toBeVisible()
  expect(await list.evaluate((l) => l.scrollTop)).toBeLessThan(10) // she didn't pull you down
  // Pressed from the keyboard: the line goes, and the focus stays in the conversation, never the page.
  await answeredLine(page).focus()
  await page.keyboard.press('Enter')
  await expect(answeredLine(page)).toHaveCount(0)
  await expect.poll(() => toEndOf(list)).toBeLessThan(48)
  expect(await page.evaluate(() => !!document.activeElement?.closest('.c3-convo'))).toBe(true)
})

test('@phone · touch · reading down to her reply clears the line too', async ({ page }) => {
  const list = await readUpWhileSheAnswers(page)
  await expect(answeredLine(page)).toBeVisible()
  await list.evaluate((l) => {
    l.scrollTop = l.scrollHeight
  })
  await expect(answeredLine(page)).toHaveCount(0)
})

test('@phone · touch · a reply that lands while you read at the end needs no line', async ({ page }) => {
  await page.goto(PAGE)
  expect(await page.locator('.msgs').evaluate((l) => l.scrollHeight > l.clientHeight)).toBe(true)
  // Never shown, not even for a moment.
  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.querySelector('.c3-answered')) document.body.dataset['answered'] = 'seen'
    }).observe(document.body, { childList: true, subtree: true })
  })
  await field(page).fill('One more thing.')
  await page.keyboard.press('Enter')
  await expect(page.locator('.msg.sophia .body').last()).toHaveText('I’m here. Tell me more about that.')
  await expect(answeredLine(page)).toHaveCount(0)
  expect(await page.evaluate(() => document.body.dataset['answered'])).toBeUndefined()
})

test('touch · the field says its limit before it bites: a count from 3,600, warm at 4,000', async ({ page }) => {
  await page.goto(PAGE)
  const count = page.locator('#c-count')
  await field(page).fill('a'.repeat(3599))
  await expect(count).toHaveCount(0)
  expect(await field(page).getAttribute('aria-describedby')).not.toContain('c-count')
  await field(page).fill('a'.repeat(3600))
  await expect(count).toBeVisible()
  await expect(count).toHaveText('3,600 / 4,000')
  expect(await field(page).getAttribute('aria-describedby')).toContain('c-count')
  await field(page).fill('a'.repeat(3999))
  await expect(count).not.toHaveClass(/full/)
  await field(page).fill('a'.repeat(4000))
  await expect(count).toHaveText('4,000 / 4,000 · the most one message holds')
  await expect(count).toHaveClass(/full/)
})

test('@phone · touch · at the limit, the count fits the phone: the field and send stay in the column', async ({
  page,
}) => {
  await page.goto(PAGE)
  await field(page).fill('Something I keep coming back to. '.repeat(125).slice(0, 4000))
  await expect(page.locator('#c-count')).toHaveClass(/full/)
  const box = async (selector: string) => {
    const b = await page.locator(selector).boundingBox()
    if (!b) throw new Error(`${selector} not laid out`)
    return { right: b.x + b.width, width: b.width }
  }
  const column = await box('.c3-convo')
  expect((await box('.ps-composer .message-bar')).right).toBeLessThanOrEqual(column.right + 1)
  expect((await box('.ps-composer .send')).right).toBeLessThanOrEqual(column.right + 1)
  expect((await box('#c-input')).width).toBeGreaterThan(220)
})

/** Keeps a note on your last turn, counting the lights that fly to the notes. */
async function keepWatching(page: Page) {
  await page.evaluate(() => {
    document.body.dataset['flown'] = '0'
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n instanceof Element && n.classList.contains('c3-noteflight')) {
            document.body.dataset['flown'] = String(Number(document.body.dataset['flown']) + 1)
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true })
  })
  const mine = page.locator('.msg.me').last()
  await mine.hover()
  await mine.locator('.note-this').click()
  await page.locator('#c-note-in').fill('Say it to him directly')
  await page.getByRole('button', { name: 'Keep', exact: true }).click()
  await expect(page.locator('.c3-notes-toggle')).toHaveClass(/ticked/)
  return page.evaluate(() => Number(document.body.dataset['flown']))
}

test('touch · a note kept flies to the notes as a small light, and their count brightens once', async ({ page }) => {
  await page.goto(PAGE)
  expect(await keepWatching(page)).toBe(1)
  await expect(page.locator('.c3-notes-toggle')).not.toHaveClass(/ticked/, { timeout: 3000 })
  await expect(page.locator('.c3-noteflight')).toHaveCount(0) // the light is gone once it lands
})

test('touch · with less motion asked for, a note kept doesn’t fly; the count still brightens', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(PAGE)
  expect(await keepWatching(page)).toBe(0)
})

test('touch · a long unbroken word (a pasted link) wraps inside the field; the column stays where it is', async ({
  page,
}) => {
  await page.goto(PAGE)
  const column = await page.locator('.c3-convo').boundingBox()
  await field(page).fill(`https://example.test/${'a'.repeat(1500)}`)
  const bar = await page.locator('.ps-composer .message-bar').boundingBox()
  expect(bar?.width ?? Infinity).toBeLessThanOrEqual((column?.width ?? 0) + 1)
  expect(await field(page).evaluate((f) => f.scrollWidth <= f.clientWidth + 1)).toBe(true)
  await expect(page.locator('.c3-head h2')).toBeInViewport()
})

// Moments (docs/plans/personal-moments.md §2): her light follows the hour; the days carry where you began, time
// together and time away. `at=HH:MM` fixes the fixture's clock; `away=N` puts the first day N days back.

test('moments · her light follows the hour: morning, day, evening, night each its own', async ({ page }) => {
  const washes = new Set<string>()
  for (const [at, light] of [
    ['07:30', 'morning'],
    ['14:00', 'day'],
    ['19:30', 'evening'],
    ['23:30', 'night'],
  ] as const) {
    await page.goto(`${PAGE}?at=${at}`)
    await expect(page.locator('.c3-space.you')).toHaveAttribute('data-hour', light)
    washes.add(await css(page, '.c3-space.you .c3-ambient', 'background-image'))
  }
  expect(washes.size).toBe(4)
})

test('moments · at night the field asks “Still up?”; by day it doesn’t', async ({ page }) => {
  await page.goto(`${PAGE}?at=23:30`)
  await expect(field(page)).toHaveAttribute('placeholder', 'Still up? Write to Sophia…')
  await page.goto(`${PAGE}?at=14:00`)
  await expect(field(page)).toHaveAttribute('placeholder', 'Write to Sophia…')
  // Where she can't answer, the field says so, night or day.
  await page.goto(`${PAGE}?at=23:30&unavailable=1`)
  await expect(field(page)).toHaveAttribute('placeholder', 'Sophia can’t answer here yet')
})

test('@phone · moments · the day pill names the day alone, as the days’ menu does', async ({ page }) => {
  await page.goto(`${PAGE}?at=14:00`)
  await settled(page)
  await expect(page.locator('.msgs > .c3-day').first()).toContainText('Where you began')
  await page.locator('.msgs').evaluate((l) => {
    l.style.scrollBehavior = 'auto'
    l.scrollTop = 200
  })
  await expect(page.locator('.c3-daypill')).toContainText('Yesterday')
  await expect(page.locator('.c3-daypill')).not.toContainText('began')
})

test('moments · the days say where you began, and how long you were away', async ({ page }) => {
  await page.goto(`${PAGE}?away=12&at=14:00`)
  const days = page.locator('.msgs > .c3-day')
  await expect(days.first()).toContainText('Where you began')
  await expect(days.last()).toHaveText('Today · 12 days later')
  expect(await lowContrast(page, '.c3-space', '.c3-edge')).toEqual([])
})

// Ease (docs/plans/personal-moments.md §3): find in your conversation; offline, said before you send.

const finder = (page: Page) => page.getByRole('searchbox', { name: 'Find in your conversation' })
const findCount = (page: Page) => page.locator('.c3-find-count')

test('ease · Ctrl F finds in the conversation: each match marked, “1 of N”, Enter on, Shift Enter back, Esc gives the focus back', async ({
  page,
}) => {
  await page.goto(PAGE)
  await field(page).focus()
  // Typed at once, as a person does: every letter lands in the finder, none in the message.
  await page.keyboard.press('Control+f')
  await page.keyboard.type('keep')
  await expect(finder(page)).toHaveValue('keep')
  await expect(field(page)).toHaveValue('')
  const marks = page.locator('.msgs mark')
  await expect(marks.first()).toBeVisible()
  const n = await marks.count()
  expect(n).toBeGreaterThan(2)
  await expect(findCount(page)).toHaveText(`1 of ${String(n)}`)
  await expect(page.locator('.msgs mark.current')).toHaveCount(1)
  await expect(page.locator('.msgs mark.current')).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(findCount(page)).toHaveText(`2 of ${String(n)}`)
  await page.keyboard.press('Shift+Enter')
  await expect(findCount(page)).toHaveText(`1 of ${String(n)}`)
  await page.keyboard.press('Shift+Enter') // from the first, round to the last
  await expect(findCount(page)).toHaveText(`${String(n)} of ${String(n)}`)
  await page.keyboard.press('Escape')
  await expect(finder(page)).toHaveCount(0)
  await expect(marks).toHaveCount(0)
  await expect(field(page)).toBeFocused()
})

test('ease · Find from the head; a word not said says so', async ({ page }) => {
  await page.goto(PAGE)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await expect(finder(page)).toBeFocused()
  await finder(page).fill('zebra')
  await expect(findCount(page)).toHaveText('No match')
  await expect(page.locator('.msgs mark')).toHaveCount(0)
})

test('ease · “Look further back” reads earlier days into what is found', async ({ page }) => {
  await page.goto(`${PAGE}?earlier=1`)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await finder(page).fill('promise')
  await expect(findCount(page)).toHaveText('1 of 1')
  const current = page.locator('.msg:has(mark.current) .body')
  await expect(current).toContainText('I promised a date')
  await page.getByRole('button', { name: 'Look further back' }).click()
  // The match you were on stays current; the earlier one comes before it. The focus stays in the finder.
  await expect(findCount(page)).toHaveText('2 of 2')
  await expect(current).toContainText('I promised a date')
  await expect(page.getByRole('button', { name: 'Look further back' })).toHaveCount(0)
  await expect(finder(page)).toBeFocused()
})

test('ease · offline, the field says so before you send: your words wait, and go once you’re back', async ({
  page,
  context,
}) => {
  await page.goto(PAGE)
  await context.setOffline(true)
  await expect(page.locator('.ps-composer .chat-line')).toHaveText('You’re offline. Your words wait here.')
  expect(await lowContrast(page, '.ps-composer')).toEqual([])
  await expect(field(page)).toHaveAttribute('placeholder', 'You’re offline. Your words wait here.')
  await field(page).fill('Still here.')
  await expect(page.locator('.ps-composer .send')).toBeDisabled()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600) // a send let through would have gone by now
  expect(await sent(page)).toEqual([])
  await expect(field(page)).toHaveValue('Still here.')
  await context.setOffline(false)
  await expect(page.locator('.ps-composer .chat-line')).not.toHaveText('You’re offline. Your words wait here.')
  await field(page).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => sent(page)).toEqual(['Still here.'])
})

test('ease · Esc closes find wherever its focus is, after ↓ too, and leaves the notes open', async ({ page }) => {
  await page.goto(`${PAGE}?notes=open`)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await finder(page).fill('keep')
  await page.getByRole('button', { name: 'Next match' }).click()
  await page.keyboard.press('Escape')
  await expect(finder(page)).toHaveCount(0)
  await expect(page.locator('#c-notes')).toBeVisible()
})

test('ease · offline, a way in puts its words in the field to wait, rather than nothing', async ({ page, context }) => {
  await page.goto(`${PAGE}?talk=new`)
  await context.setOffline(true)
  await page.getByRole('button', { name: /Just talk/ }).click()
  await expect(field(page)).not.toHaveValue('')
  expect(await sent(page)).toEqual([])
})

test('ease · in a talk, Ctrl F is the browser’s: Personal’s find doesn’t take it', async ({ page }) => {
  await page.goto(`${PAGE}?voice=1`)
  await page.getByRole('button', { name: 'Talk with her' }).click()
  await expect(page.getByRole('dialog', { name: 'Talking with Sophia' })).toBeVisible()
  const taken = await page.evaluate(() => {
    const key = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })
    ;(document.activeElement ?? document.body).dispatchEvent(key)
    return key.defaultPrevented
  })
  expect(taken).toBe(false)
  await expect(finder(page)).toHaveCount(0)
})

test('@phone · ease · the find line fits a phone: the words have room, every control in the column', async ({
  page,
}) => {
  await page.goto(`${PAGE}?earlier=1`)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await finder(page).fill('keep')
  const right = await page.locator('.c3-head').evaluate((h) => h.getBoundingClientRect().right)
  const outside = await page
    .locator('.c3-head')
    .evaluate(
      (h, edge) =>
        [...h.querySelectorAll('button, input')]
          .filter((el) => el.getBoundingClientRect().right > edge + 1)
          .map((el) => el.textContent || el.getAttribute('aria-label')),
      right,
    )
  expect(outside).toEqual([])
  expect((await finder(page).boundingBox())?.width ?? 0).toBeGreaterThan(200)
  // Each button's words on one line.
  const wrapped = await page.locator('.c3-find button').evaluateAll((bs) =>
    bs
      .filter((b) => {
        const words = document.createRange()
        words.selectNodeContents(b)
        return new Set([...words.getClientRects()].map((r) => Math.round(r.top))).size > 1
      })
      .map((b) => b.textContent),
  )
  expect(wrapped).toEqual([])
})

test('ease · behind the padlock, Ctrl F is the browser’s, and find comes back empty', async ({ page }) => {
  await page.goto(PAGE)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await finder(page).fill('keep')
  await page.getByRole('button', { name: 'Lock (fixture)' }).click()
  const taken = await page.evaluate(() => {
    const key = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(key)
    return key.defaultPrevented
  })
  expect(taken).toBe(false)
  await page.getByRole('button', { name: 'Unlock (fixture)' }).click()
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await expect(finder(page)).toHaveValue('')
  await expect(page.locator('.msgs mark')).toHaveCount(0)
})

// Codex's P2s on #89 and #90 (docs/plans/personal-codex-p2.md).

test('codex · while another tab sends, “Talk about it” waits: the week stays until her prompt can go', async ({
  page,
  context,
}) => {
  await page.goto(`${PAGE}?week=1`)
  const other = await context.newPage()
  await other.goto(PAGE)
  // The device's send, held by the other tab until it goes (its name is draft.ts's sendLock for the fixture's account).
  await other.evaluate(
    () =>
      new Promise<void>((held) => {
        void navigator.locks.request('sophia.personal.send.fixture', () => {
          held()
          return new Promise(() => undefined)
        })
      }),
  )
  const week = page.getByRole('region', { name: 'Your week with Sophia' })
  await page.getByRole('button', { name: 'Talk about it' }).click()
  await expect(page.locator('.ps-composer .chat-line')).toBeVisible() // the wait is said
  await expect(week).toBeVisible()
  expect(await sent(page)).toEqual([])
  await other.close() // the other tab's send lets go
  await expect.poll(() => page.evaluate(async () => ((await navigator.locks.query()).held ?? []).length)).toBe(0)
  await page.getByRole('button', { name: 'Talk about it' }).click()
  await expect(week).toHaveCount(0)
  await expect.poll(() => sent(page)).toHaveLength(1)
})

test('codex · starting a talk stops the field’s dictation first: one microphone at a time', async ({ page }) => {
  await page.goto(`${PAGE}?voice=1`)
  await page.getByRole('button', { name: 'Talk instead' }).click()
  await expect(page.locator('.ps-composer .c3-wave')).toBeVisible()
  await page.getByRole('button', { name: 'Talk with her' }).click()
  await expect(page.getByRole('dialog', { name: 'Talking with Sophia' })).toBeVisible()
  await expect(page.locator('.ps-composer .c3-wave')).toHaveCount(0)
})

test('codex · every Personal state reads at 4.5:1: no notes yet, and a talk', async ({ page }) => {
  await page.goto(`${PAGE}?notes=none`)
  await page.getByRole('button', { name: 'No notes' }).click()
  await expect(page.locator('.ps-empty')).toBeVisible()
  expect(await lowContrast(page, '.c3-space', '.c3-edge')).toEqual([])
  // The days' menu, with what each day was about.
  await page.locator('.msgs > .c3-day').first().click()
  await expect(page.getByRole('menu')).toBeVisible()
  expect(await lowContrast(page, '[role="menu"]')).toEqual([])
  await page.goto(`${PAGE}?voice=1&step=600`)
  await page.getByRole('button', { name: 'Talk with her' }).click()
  const talk = page.getByRole('dialog', { name: 'Talking with Sophia' })
  await expect(talk).toBeVisible()
  await talk.evaluate((t) =>
    Promise.all(
      t
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  )
  // The status line says who speaks only while someone does: it is measured the moment it has words. Then, once
  // there are earlier lines, they step back and still read.
  const status = await talk.locator('.c3-talk-who').evaluate(async (who) => {
    for (let i = 0; i < 200 && !who.textContent; i++) await new Promise((r) => setTimeout(r, 15))
    const grounds: string[] = []
    let opacity = 1
    for (let up: Element | null = who; up; up = up.parentElement) {
      grounds.push(getComputedStyle(up).backgroundColor)
      opacity *= parseFloat(getComputedStyle(up).opacity)
    }
    return { words: who.textContent, ink: getComputedStyle(who).color, opacity, grounds, size: 10.5 }
  })
  expect(status.words).not.toBe('')
  expect(contrastOf(status)).toBeGreaterThanOrEqual(4.5)
  // Your words among the earlier lines too (the third line on).
  await expect.poll(() => talk.locator('.c3-talk-lines li').count()).toBeGreaterThan(2)
  expect(await lowContrast(page, '.c3-talk')).toEqual([])
})
