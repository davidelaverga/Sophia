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
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect(first.getByRole('status')).toHaveText('Copied')
  await expect(first.getByRole('status')).toHaveCount(1)
})

test('acts · two presses overlapping: the latest one’s outcome is said, an earlier write refused late changes nothing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let presses = 0
    // The first write hangs until the page settles it (refused); the ones after go through at once.
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () =>
          presses++ === 0
            ? new Promise<void>((_, reject) => {
                window.settleFirstCopy = () => reject(new Error('denied'))
              })
            : Promise.resolve(),
      },
    })
  })
  await page.goto(PAGE)
  const first = messages(page).first()
  await first.hover()
  await first.getByRole('button', { name: 'Copy' }).click()
  await first.getByRole('button', { name: 'Copy' }).click()
  // The second write waits its turn behind the first (one clipboard for the page): nothing is said yet.
  await page.waitForTimeout(150)
  await expect(first.getByRole('status')).toHaveCount(0)
  await page.evaluate(() => window.settleFirstCopy?.())
  // The first, refused late, says nothing; the second goes through and is the one said.
  await expect(first.getByRole('status')).toHaveText('Copied')
  await expect(first.getByRole('status')).toHaveCount(1)
})

test('acts · a write that never settles is given up after its wait: the next copy is said, the page keeps its Copy', async ({
  page,
}) => {
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
  await first.getByRole('button', { name: 'Copy' }).click()
  await expect(first.getByRole('status')).toHaveCount(0)
  // Past the wait, the stuck write is given up (it was not the latest press, so it says nothing) and the queue moves on.
  await expect(first.getByRole('status')).toHaveText('Copied', { timeout: 8000 })
  await expect(first.getByRole('status')).toHaveCount(1)
})

declare global {
  interface Window {
    settleFirstCopy?: () => void
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
  // At the turn's right edge, on the name's line, within reach of its bubble: never up at a day's label.
  expect(Math.abs(read.row.right - (read.turnRight + 12))).toBeLessThan(1.5)
  expect(read.bubbleTop - read.row.bottom).toBeLessThan(24)
})
