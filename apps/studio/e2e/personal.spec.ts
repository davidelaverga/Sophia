import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'

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
})

test('detail · the field shows its focus as Home’s line does, a ring of light, not only a 1 px shift', async ({
  page,
}) => {
  await page.goto(PAGE)
  await field(page).focus()
  await expect.poll(() => css(page, '.ps-composer .message-bar', 'box-shadow')).toMatch(/rgba\(185, 168, 255/)
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

test('detail · one type scale: Personal’s text comes in four sizes', async ({ page }) => {
  await page.goto(`${PAGE}?all=1&notes=open&arrive=1&ready=1`)
  const sizes = await page.locator('.c3-space').evaluate((space) => {
    const seen = new Set<string>()
    for (const el of space.querySelectorAll('*')) {
      if (el.closest('.sr-only, .c3-edge, [aria-hidden="true"]')) continue
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
      if (own && el.getBoundingClientRect().width > 0) seen.add(getComputedStyle(el).fontSize)
    }
    return [...seen].toSorted()
  })
  expect(sizes).toEqual(['10.5px', '11px', '13px', '15px'])
})

test('detail · with less motion asked for, nothing in Personal moves: no breathing wash, no flicker', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${PAGE}?writing=1`)
  await page.waitForTimeout(400)
  const moving = await page
    .locator('.c3-space')
    .evaluate((s) => s.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)
  expect(moving).toBe(0)
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
