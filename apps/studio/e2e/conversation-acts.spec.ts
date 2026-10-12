// A message's acts (docs/plans/conversation-acts.md): copy, quote, propose at its corner, on the fixture page.
import { expect, test, type Page } from '@playwright/test'

test.use({ timezoneId: 'UTC', locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] })

const PAGE = '/room.html?place=conversations&conversations=1'
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const messages = (page: Page) => open(page).locator('.conv-messages > li')
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('acts · under the pointer a message offers Copy, Quote and Propose; Copy puts its words and who said them on the clipboard', async ({
  page,
}) => {
  await page.goto(PAGE)
  const first = messages(page).first()
  await first.hover()
  await expect(first.getByRole('button', { name: 'Copy' })).toBeVisible()
  await expect(first.getByRole('button', { name: 'Quote in your message' })).toBeVisible()
  await expect(first.getByRole('button', { name: 'Propose as decision' })).toBeVisible()
  const words = (await first.locator('.conv-msg-body p').first().innerText()).trim()
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect(first.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible()
  // Read back as the page wrote it: a Windows clipboard gives the line break as CRLF.
  const clip = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')
  expect(clip.startsWith(`${words}\n— `), clip).toBe(true)
  expect(clip).toMatch(/— .+, .+ \d\d:\d\d$/)
})

test('acts · Quote puts the words after «> » under the draft, with who said them; the field takes the focus; a second one goes under', async ({
  page,
}) => {
  await page.goto(PAGE)
  const first = messages(page).first()
  await first.hover()
  await first.getByRole('button', { name: 'Quote in your message' }).click()
  await expect(field(page)).toBeFocused()
  await expect(field(page)).toHaveValue(/^> .+\n— .+\n\n$/)
  await field(page).type('Agreed.')
  const second = messages(page).nth(1)
  await second.hover()
  await second.getByRole('button', { name: 'Quote in your message' }).click()
  await expect(field(page)).toHaveValue(/^> .+\n— .+\n\nAgreed\.\n\n> [^]+\n— .+\n\n$/)
})

test('acts · a viewer may copy a message, not quote it nor propose it', async ({ page }) => {
  await page.goto(`${PAGE}&role=viewer`)
  await expect(open(page).getByText('Viewers read conversations; members write in them.')).toBeVisible()
  const first = messages(page).first()
  await first.hover()
  await expect(first.getByRole('button', { name: 'Copy' })).toBeVisible()
  await expect(first.getByRole('button', { name: 'Quote in your message' })).toHaveCount(0)
  await expect(first.getByRole('button', { name: 'Propose as decision' })).toHaveCount(0)
})

test('acts · a copy refused says so; a second copy says «Copied» anew', async ({ page }) => {
  await page.addInitScript(() => {
    let presses = 0
    // The first write is refused (no permission), the ones after go through.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => (presses++ === 0 ? Promise.reject(new Error('denied')) : Promise.resolve()) },
    })
  })
  await page.goto(PAGE)
  const first = messages(page).first()
  await first.hover()
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect(first.getByRole('status')).toHaveText('Not copied: select the words to copy them.')
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect(first.getByRole('status')).toHaveText('Copied')
  // The third press says it anew: the status is a new node (its key), not the second's left standing (Codex on #240).
  const before = await first.getByRole('status').elementHandle()
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect.poll(() => before.evaluate((el) => el.isConnected)).toBe(false)
  await expect(first.getByRole('status')).toHaveText('Copied')
  await expect(first.getByRole('status')).toHaveCount(1)
})

test('acts · two presses overlapping: each write starts in its press, the latest one’s outcome is said, an earlier write refused late changes nothing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let presses = 0
    window.clipWrites = []
    // The first write hangs until the page settles it (refused); the ones after go through at once.
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          window.clipWrites?.push(text)
          return presses++ === 0
            ? new Promise<void>((_, reject) => {
                window.settleFirstCopy = () => reject(new Error('denied'))
              })
            : Promise.resolve()
        },
      },
    })
  })
  await page.goto(PAGE)
  const first = messages(page).first()
  await first.hover()
  // The write starts inside the press itself: Safari grants the clipboard to the gesture, not to a promise after it.
  const started = await first.getByRole('button', { name: 'Copy' }).evaluate((el) => {
    if (el instanceof HTMLButtonElement) el.click()
    return window.clipWrites?.length ?? 0
  })
  expect(started).toBe(1)
  await first.getByRole('button', { name: 'Copy' }).click()
  // The second write does not wait behind the first: it goes through and is said.
  await expect(first.getByRole('status')).toHaveText('Copied')
  await page.evaluate(() => window.settleFirstCopy?.())
  await page.waitForTimeout(150)
  // The first, refused late, says nothing.
  await expect(first.getByRole('status')).toHaveText('Copied')
  await expect(first.getByRole('status')).toHaveCount(1)
})

test('acts · an earlier write that lands late is said on the latest message, whose Copy puts its words back (Codex on #240)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let presses = 0
    window.clipWrites = []
    // The first write hangs until the page settles it (it goes through); the ones after go through at once.
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          window.clipWrites?.push(text)
          return presses++ === 0
            ? new Promise<void>((resolve) => {
                window.settleFirstCopy = resolve
              })
            : Promise.resolve()
        },
      },
    })
  })
  await page.goto(PAGE)
  const first = messages(page).first()
  const second = messages(page).nth(1)
  await first.hover()
  await first.getByRole('button', { name: 'Copy' }).click()
  await second.hover()
  await second.getByRole('button', { name: 'Copy' }).click()
  await expect(second.getByRole('status')).toHaveText('Copied')
  const writes = await page.evaluate(() => window.clipWrites ?? [])
  expect(writes).toHaveLength(2)
  expect(writes[0]).not.toBe(writes[1])
  // The first goes through now, over the second's words. Nothing is written from a promise (Safari refuses a write
  // after the gesture): the second message says so, and its Copy, pressed again, writes its words back.
  await page.evaluate(() => window.settleFirstCopy?.())
  await expect(second.getByRole('status')).toHaveText(/An earlier copy landed after this one/)
  expect(await page.evaluate(() => window.clipWrites ?? [])).toEqual([writes[0], writes[1]])
  await expect(first.getByRole('status')).toHaveCount(0)
  await second.getByRole('button', { name: 'Copy' }).click()
  await expect(second.getByRole('status')).toHaveText('Copied')
  await expect.poll(() => page.evaluate(() => window.clipWrites ?? [])).toEqual([writes[0], writes[1], writes[1]])
})

test('acts · a write long on its way is said waiting, not failed, and the next copy «Copied»', async ({ page }) => {
  test.slow() // the wait is four seconds by design
  await page.addInitScript(() => {
    let presses = 0
    // The first write never settles (a permission request left pending); the ones after go through at once.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => (presses++ === 0 ? new Promise<void>(() => undefined) : Promise.resolve()) },
    })
  })
  await page.goto(PAGE)
  const first = messages(page).first()
  await first.hover()
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect(first.getByRole('status')).toHaveCount(0)
  // Past the wait the write is said to be waiting, not failed (it may yet land); the next press goes through.
  await expect(first.getByRole('status')).toHaveText(/Waiting for the browser/, { timeout: 8000 })
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect(first.getByRole('status')).toHaveText('Copied')
  await expect(first.getByRole('status')).toHaveCount(1)
})

declare global {
  interface Window {
    settleFirstCopy?: () => void
    clipWrites?: string[]
  }
}

test('acts · Quote with a proposal’s form open on a message still fills the composer, which takes the focus', async ({
  page,
}) => {
  await page.goto(PAGE)
  const first = messages(page).first()
  await first.hover()
  await first.getByRole('button', { name: 'Propose as decision' }).click()
  await expect(first.locator('.conv-propose-form textarea')).toBeFocused()
  const second = messages(page).nth(1)
  await second.hover()
  await second.getByRole('button', { name: 'Quote in your message' }).click()
  await expect(field(page)).toBeFocused()
  await expect(field(page)).toHaveValue(/^> .+\n— .+\n\n$/)
})

test('@phone · acts · on another’s message the presses start at its left and stay inside the pane', async ({
  page,
}) => {
  await page.goto(PAGE)
  // A phone shows one pane at a time: the conversation opens from its row.
  await page
    .getByRole('button', { name: /What makes a report worth reading/ })
    .first()
    .tap()
  const first = messages(page).first()
  await first.tap()
  const copy = first.getByRole('button', { name: 'Copy' })
  await expect(copy).toBeVisible()
  const pane = await page.locator('.conv-scroll').boundingBox()
  const acts = await first.locator('.conv-acts').boundingBox()
  expect(acts && pane && acts.x >= pane.x && acts.x + acts.width <= pane.x + pane.width).toBe(true)
  // Under a thumb the row stands below the bubble, 4 px clear, in room the pressed message keeps for it: over no words
  // of this message, no name, and none of the next message.
  const bubble = await first.locator('.conv-msg-body').boundingBox()
  const next = await messages(page).nth(1).boundingBox()
  expect(acts && bubble && acts.y >= bubble.y + bubble.height + 4 - 0.5).toBe(true)
  expect(acts && next && acts.y + acts.height <= next.y + 0.5).toBe(true)
})

test('acts · another’s acts stand at the message’s right on a desktop: inside the pane, over no byline, even on its shortest bubble', async ({
  page,
}) => {
  await page.goto(PAGE)
  // The shortest of another member's messages: where a row anchored to a short bubble would run past the pane.
  const others = open(page).locator('li.conv-msg:not(.mine):not(.sophia)')
  const widths = await others.evaluateAll((els) =>
    els.map((el) => el.querySelector('.conv-msg-body')?.getBoundingClientRect().width ?? 0),
  )
  const other = others.nth(widths.indexOf(Math.min(...widths)))
  await other.hover()
  await expect(other.getByRole('button', { name: 'Copy' })).toBeVisible()
  const pane = await page.locator('.conv-scroll').boundingBox()
  // Every box as a number (NaN where a part is missing fails the comparison, as it should).
  const read = await other.evaluate((li) => {
    const box = (sel: string) => li.querySelector(sel)?.getBoundingClientRect() ?? new DOMRect(NaN, NaN, NaN, NaN)
    const row = box('.conv-acts')
    const by = box('.conv-msg-by')
    return {
      row: { left: row.left, right: row.right, bottom: row.bottom },
      byRight: by.right,
      byTop: by.top,
      turnRight: box('.conv-turn').right,
      bubbleTop: box('.conv-msg-body').top,
    }
  })
  const paneLeft = pane?.x ?? NaN
  const paneRight = paneLeft + (pane?.width ?? NaN)
  expect(read.row.left).toBeGreaterThanOrEqual(paneLeft - 0.5)
  expect(read.row.right).toBeLessThanOrEqual(paneRight + 0.5)
  // Over no byline: the row starts to the right of the name, or ends above it.
  expect(read.row.left >= read.byRight || read.row.bottom <= read.byTop, JSON.stringify(read)).toBe(true)
  // At the turn's right edge, whole above the bubble (never over its words), within reach of it: not up at a day's label.
  expect(Math.abs(read.row.right - (read.turnRight + 12))).toBeLessThan(1.5)
  expect(read.bubbleTop - read.row.bottom).toBeGreaterThanOrEqual(0)
  expect(read.bubbleTop - read.row.bottom).toBeLessThan(24)
})

test('acts · a copy on one message puts away what another said a moment ago (Codex on #240)', async ({ page }) => {
  await page.goto(PAGE)
  const first = messages(page).first()
  const second = messages(page).nth(1)
  await first.hover()
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect(first.getByRole('status')).toHaveText('Copied')
  await second.hover()
  await second.getByRole('button', { name: 'Copy' }).click()
  await expect(second.getByRole('status')).toHaveText('Copied')
  await expect(first.getByRole('status')).toHaveCount(0)
})

test('acts · words that leave the thread name their author by name, never «You» (Codex on #240)', async ({ page }) => {
  await page.goto(PAGE)
  const mine = open(page).locator('.conv-messages > li.mine').first()
  await mine.hover()
  await mine.getByRole('button', { name: 'Copy' }).click()
  await expect(mine.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible()
  const clip = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')
  expect(clip).not.toContain('— You')
})

test('acts · in a run of one’s own messages, the later one’s acts lie over none of the one above (Codex on #240)', async ({
  page,
}) => {
  await page.goto(PAGE)
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  for (const words of ['One more thing', 'and another']) {
    await field(page).fill(words)
    await page.keyboard.press('Enter')
    await expect(messages(page).last()).toContainText(words)
  }
  const later = messages(page).last()
  const earlier = messages(page).nth(-2)
  await expect(later).toHaveAttribute('data-run', 'on')
  await later.hover()
  await expect(later.getByRole('button', { name: 'Copy' })).toBeVisible()
  const row = await later.locator('.conv-acts').boundingBox()
  const above = await earlier.locator('.conv-msg-body').boundingBox()
  const overlaps =
    !!row &&
    !!above &&
    row.x < above.x + above.width &&
    row.x + row.width > above.x &&
    row.y < above.y + above.height &&
    row.y + row.height > above.y
  expect(overlaps).toBe(false)
})

test('@phone · acts · what a copy says takes its room under the bubble, never over its words (Codex on #240)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } })
  })
  await page.goto(PAGE)
  // A phone shows one pane at a time: the conversation opens from its row.
  await page
    .getByRole('button', { name: /What makes a report worth reading/ })
    .first()
    .tap()
  const first = messages(page).first()
  await first.tap()
  await first.getByRole('button', { name: 'Copy' }).tap()
  // Refused: a long line that wraps, above the presses, inside the row.
  await expect(first.getByRole('status')).toHaveText(/Not copied/)
  const [body, acts] = await Promise.all([
    first.locator('.conv-msg-body').boundingBox(),
    first.locator('.conv-acts').boundingBox(),
  ])
  expect(acts?.y ?? 0).toBeGreaterThanOrEqual((body?.y ?? 0) + (body?.height ?? 0) - 0.5)
})
