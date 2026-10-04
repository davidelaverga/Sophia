import { expect, test, type Page } from '@playwright/test'

// Personal's fixture page (fixtures/personal.tsx): the Studio's own PersonalSpace over a labelled simulated
// conversation. The "$20" pass (docs/plans/personal-pass.md): speakers marked by Umbral's halves, no bubbles, Home's
// head, rows and line.

const PAGE = '/personal.html'

const sent = (page: Page) => page.evaluate(() => window.personalFixture?.sent ?? [])
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
