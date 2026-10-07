import type { ChatCaption } from '@sophia/contracts/room-chat'
import { expect, test, type Page } from '@playwright/test'

// Captions on the stage (docs/plans/room-stage-captions.md): what is said aloud, in the room's sight while Chat is
// closed, as Meet shows it, over the fixture's people and Sophia (room-people). Every word here is synthetic.

const MARCO = '00000000-0000-4000-8000-0000000000b1'
const EXCHANGE = '00000000-0000-4000-8000-0000000000ae'

const caption = (n: number, sequence: number, state: ChatCaption['state'], text: string, actorId: string | null) =>
  ({
    kind: 'caption',
    id: `00000000-0000-4000-8000-0000000000c${String(n)}`,
    exchangeId: EXCHANGE,
    speaker: actorId === null ? 'sophia' : 'member',
    actorId,
    sequence,
    state,
    text,
  }) satisfies ChatCaption

/** The same caption, placed before the `n`th (its words transcribed after the reply to them had begun). */
const placedBefore = (packet: ChatCaption, n: number): ChatCaption => ({
  ...packet,
  before: `00000000-0000-4000-8000-0000000000c${String(n)}`,
})

const say = (page: Page, ...packets: ChatCaption[]) =>
  page.evaluate((list) => {
    for (const p of list) window.fixture?.caption(p)
  }, packets)

const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const lines = (page: Page) => page.locator('.stage-captions .stage-caption')
const chatToggle = (page: Page) => page.getByRole('button', { name: 'Chat', exact: true })

async function enter(page: Page, query = 'people=2&floor=1&sophia=listening') {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(leave(page)).toBeVisible()
}

/** A box's place on the page. */
const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`${selector} has no box`)
  return b
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('captions · what is said shows on the stage, each with its speaker, in order', async ({ page }) => {
  await enter(page)
  await say(page, caption(1, 1, 'partial', 'The pilot ran with fourteen teams', null))
  await expect(lines(page)).toHaveCount(1)
  await expect(lines(page).nth(0).locator('.caption-who')).toHaveText('Sophia')
  await expect(lines(page).nth(0)).toHaveAttribute('data-speaker', 'sophia')
  await expect(lines(page).nth(0).locator('.caption-words')).toHaveText('The pilot ran with fourteen teams')
  await say(page, caption(1, 2, 'final', '', null), caption(2, 1, 'final', 'And the two that left?', MARCO))
  await expect(lines(page)).toHaveCount(2)
  await expect(lines(page).nth(1).locator('.caption-who')).toHaveText('Marco')
  await expect(lines(page).nth(1).locator('.caption-words')).toHaveText('And the two that left?')
  // Hidden from assistive tech: the chat holds them, and Sophia's line is the room's announced state.
  await expect(page.locator('.stage-captions')).toHaveAttribute('aria-hidden', 'true')
})

test('captions · two at most: a third leaves the two latest, the older one quieter', async ({ page }) => {
  await enter(page)
  await say(
    page,
    caption(1, 1, 'final', 'One', MARCO),
    caption(2, 1, 'final', 'Two', null),
    caption(3, 1, 'partial', 'Three', MARCO),
  )
  await expect(lines(page)).toHaveCount(2)
  await expect(lines(page).locator('.caption-words')).toHaveText(['Two', 'Three'])
  await expect(lines(page).nth(0)).toHaveAttribute('data-older', '')
  await expect(lines(page).nth(1)).not.toHaveAttribute('data-older')
})

test('captions · one place at a time: Chat open, they leave the stage; closed, they are back', async ({ page }) => {
  await enter(page)
  await say(page, caption(1, 1, 'partial', 'Still talking', MARCO))
  await expect(lines(page)).toHaveCount(1)
  await chatToggle(page).click()
  await expect(page.locator('.stage-captions')).toHaveCount(0)
  await chatToggle(page).click()
  await expect(lines(page)).toHaveCount(1)
})

test('captions · six seconds after the last one ended they go; a new word brings them back', async ({ page }) => {
  await page.clock.install()
  await enter(page)
  await say(page, caption(1, 1, 'final', 'That is all', MARCO))
  await expect(lines(page)).toHaveCount(1)
  await page.clock.fastForward(5000)
  await expect(lines(page)).toHaveCount(1)
  await page.clock.fastForward(1500)
  await expect(page.locator('.stage-captions')).toHaveCount(0)
  await say(page, caption(2, 1, 'partial', 'One more', null))
  await expect(lines(page)).toHaveCount(1)
  await expect(lines(page).locator('.caption-words')).toHaveText('One more')
})

test('captions · on the stage’s axis, ending above the dock', async ({ page }) => {
  await enter(page)
  await say(page, caption(1, 1, 'partial', 'Centred words', null))
  const stage = await box(page, '.room-stage')
  const words = await box(page, '.stage-captions')
  const dock = await box(page, '.dock')
  expect(Math.abs(words.x + words.width / 2 - (stage.x + stage.width / 2))).toBeLessThanOrEqual(1)
  expect(words.y + words.height).toBeLessThanOrEqual(dock.y)
})

for (const video of ['camera', 'screen'] as const) {
  test(`captions · with video (${video}), no tile reaches under them`, async ({ page }) => {
    await enter(page, `people=2&floor=1&sophia=listening&video=${video}`)
    await say(page, caption(1, 1, 'partial', 'Words over the video', MARCO))
    await expect(lines(page)).toHaveCount(1)
    // The video makes room a frame after the captions come (their height is published then).
    await expect
      .poll(async () => {
        const words = await box(page, '.stage-captions')
        const area = await box(page, video === 'camera' ? '.gallery' : '.present')
        return words.y - (area.y + area.height)
      })
      .toBeGreaterThanOrEqual(0)
  })
}

test('captions · out of the call, they go', async ({ page }) => {
  await enter(page)
  await say(page, caption(1, 1, 'partial', 'Mid-sentence', MARCO))
  await expect(lines(page)).toHaveCount(1)
  await leave(page).click()
  await expect(page.locator('.stage-captions')).toHaveCount(0)
})

test('@phone · captions fit a phone, above the dock, nothing off the side', async ({ page }) => {
  await enter(page)
  await say(
    page,
    caption(1, 1, 'final', 'A longer sentence that has to wrap on a phone’s narrow stage', null),
    caption(2, 1, 'partial', 'And Marco answers it at some length as well', MARCO),
  )
  await expect(lines(page)).toHaveCount(2)
  const words = await box(page, '.stage-captions')
  const dock = await box(page, '.dock')
  expect(words.y + words.height).toBeLessThanOrEqual(dock.y)
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(sideways).toBe(0)
})

test('captions · after leaving and joining again, the last call’s captions don’t come back', async ({ page }) => {
  await page.clock.install()
  await enter(page)
  await say(page, caption(1, 1, 'final', 'Said in the last call', MARCO))
  await expect(lines(page)).toHaveCount(1)
  await leave(page).click()
  await page.clock.fastForward(7000)
  // Leaving opens what the meeting left (room-recap.spec.ts); put away, the way back is Join.
  await page.getByRole('dialog', { name: 'This meeting' }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Join the room' }).click()
  await expect(leave(page)).toBeVisible()
  await expect(page.locator('.stage-captions')).toHaveCount(0)
})

test('captions · closing Chat long after anyone spoke brings nothing back', async ({ page }) => {
  await page.clock.install()
  await enter(page)
  await say(page, caption(1, 1, 'final', 'Read in the chat', MARCO))
  await chatToggle(page).click()
  await page.clock.fastForward(7000)
  await chatToggle(page).click()
  await expect(page.locator('.stage-captions')).toHaveCount(0)
})

test('captions · words that stop coming, never ended, go after the same six seconds', async ({ page }) => {
  await page.clock.install()
  await enter(page)
  await say(page, caption(1, 1, 'partial', 'And then', MARCO))
  await page.clock.fastForward(6500)
  await expect(page.locator('.stage-captions')).toHaveCount(0)
})

test('captions · an earlier caption still being said brings them back with its next words', async ({ page }) => {
  await page.clock.install()
  await enter(page)
  await say(page, caption(1, 1, 'partial', 'Marco starts', MARCO), caption(2, 1, 'final', 'Sophia answers', null))
  await page.clock.fastForward(6500)
  await expect(page.locator('.stage-captions')).toHaveCount(0)
  await say(page, caption(1, 2, 'partial', ' and goes on', MARCO))
  await expect(lines(page)).toHaveCount(1)
  await expect(lines(page).locator('.caption-words')).toHaveText('Marco starts and goes on')
})

test('captions · in the chat’s order: one placed before another shows above it', async ({ page }) => {
  await enter(page)
  await say(
    page,
    caption(1, 1, 'partial', 'Sophia’s reply', null),
    placedBefore(caption(2, 1, 'final', 'Marco’s question', MARCO), 1),
  )
  await expect(lines(page).locator('.caption-words')).toHaveText(['Marco’s question', 'Sophia’s reply'])
})

test('captions · with a lens open, its body ends above them', async ({ page }) => {
  await enter(page)
  await page.keyboard.press('2')
  await say(page, caption(1, 1, 'partial', 'Words under Explore', MARCO))
  await expect(lines(page)).toHaveCount(1)
  await expect
    .poll(async () => {
      const words = await box(page, '.stage-captions')
      const body = await box(page, '.stage-body')
      return words.y - (body.y + body.height)
    })
    .toBeGreaterThanOrEqual(0)
})

test('captions · back from another view, the room’s old captions don’t come back', async ({ page }) => {
  await page.clock.install()
  await enter(page)
  await say(page, caption(1, 1, 'final', 'Said before reading Knowledge', MARCO))
  await expect(lines(page)).toHaveCount(1)
  await page.getByRole('link', { name: 'Knowledge', exact: true }).click()
  await expect(page.locator('.room-stage')).toHaveCount(0)
  await page.clock.fastForward(7000)
  await page.getByRole('link', { name: 'Studio', exact: true }).click()
  await expect(page.locator('.room-stage')).toBeVisible()
  await expect(page.locator('.stage-captions')).toHaveCount(0)
})

test('captions · a word five seconds in keeps them six seconds from that word', async ({ page }) => {
  await page.clock.install()
  await enter(page)
  await say(page, caption(1, 1, 'partial', 'Slowly', MARCO))
  await page.clock.fastForward(5000)
  await say(page, caption(1, 2, 'partial', ' thinking', MARCO))
  await page.clock.fastForward(4000)
  await expect(lines(page)).toHaveCount(1)
  await expect(lines(page).locator('.caption-words')).toHaveText('Slowly thinking')
})
