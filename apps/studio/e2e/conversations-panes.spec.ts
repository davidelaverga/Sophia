import { expect, test, type Locator, type Page } from '@playwright/test'

import { contrastOf } from './contrast'

// Conversations in three panes (docs/plans/conversations-panes.md): the list, the open conversation and its context
// side by side on a wide screen; the context as a panel under 1180 px; one screen at a time on a phone. On the fixture
// page; only the API is faked, and each check ends by asking the page whether anything reached for it unanswered.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&conversations=1'
const list = (page: Page) => page.getByRole('region', { name: 'All conversations' })
const rows = (page: Page) => list(page).getByRole('listitem').getByRole('button')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const context = (page: Page) => page.getByRole('complementary', { name: 'Project context' })
// The thread's messages: its own items, not those of a list inside one of Sophia's answers (C6).
const messages = (page: Page) => open(page).locator('.conv-messages > li')
const field = (page: Page) => open(page).getByRole('textbox', { name: 'Continue this question with the team' })
const send = (page: Page) => open(page).getByRole('button', { name: 'Send' })
const toggle = (page: Page) => open(page).getByRole('button', { name: 'Context' })
const dock = (page: Page) => page.getByRole('group', { name: 'Project room' })

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** Whether nothing covers the middle of what `locator` names: a press there reaches it. */
const onTop = (locator: Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
  })

test('panes · over 1180 px: the list, the conversation and its context side by side; the page does not scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.goto(PAGE)
  await expect(messages(page).first()).toBeVisible()
  const [l, o, c] = await Promise.all([list(page).boundingBox(), open(page).boundingBox(), context(page).boundingBox()])
  if (!l || !o || !c) throw new Error('a pane is missing')
  expect(l.x + l.width).toBeLessThanOrEqual(o.x + 1)
  expect(o.x + o.width).toBeLessThanOrEqual(c.x + 1)
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0)
  await expect(toggle(page)).toBeHidden()
  // The field rests at the window's foot while the thread's first message is read.
  await messages(page).first().scrollIntoViewIfNeeded()
  await expect(field(page)).toBeInViewport()
  await expect(messages(page).first()).toBeInViewport()
})

for (const width of [1440, 1000, 900]) {
  test(`panes · at ${String(width)} px the room’s dock never covers Send`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(PAGE)
    await field(page).fill('Ready to go.')
    expect(await onTop(send(page)), 'Send').toBe(true)
    if (width > 1180) {
      // A short window: the context scrolls, and read to its end, its last line stays clear of the dock.
      await page.setViewportSize({ width, height: 520 })
      await context(page).evaluate((el) => (el.scrollTop = el.scrollHeight))
      const last = context(page).locator('p:visible, li:visible, summary:visible').last()
      expect(await onTop(last), 'the context’s last line').toBe(true)
    }
  })
}

test('panes · at 1000 px the context opens from «Context» and Esc gives the focus back', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto(PAGE)
  await expect(context(page)).toBeHidden()
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  await toggle(page).click()
  await expect(context(page)).toBeVisible()
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(context(page).getByRole('button', { name: 'Close the context' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(context(page)).toBeHidden()
  await expect(toggle(page)).toBeFocused()
})

test('panes @phone · one screen at a time: the list, then the conversation alone, and back', async ({ page }) => {
  await page.goto(PAGE)
  await expect(rows(page).first()).toBeVisible()
  await expect(open(page)).toBeHidden()
  // The room's dock waits on the list.
  await expect(dock(page)).toBeVisible()
  await rows(page).nth(1).click()
  await expect(open(page)).toBeVisible()
  await expect(list(page)).toBeHidden()
  await expect(dock(page)).toBeHidden()
  await expect(open(page).getByRole('heading', { level: 3 })).toHaveText('Short or long briefs?')
  await open(page).getByRole('button', { name: 'All conversations' }).click()
  await expect(list(page)).toBeVisible()
  await expect(rows(page).nth(1)).toBeFocused()
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide).toBeLessThanOrEqual(0)
})

test('panes @phone · a conversation’s context rises from the foot', async ({ page }) => {
  await page.goto(PAGE)
  await rows(page).first().click()
  await toggle(page).click()
  await expect(context(page)).toBeVisible()
  // It rises over 220 ms: once risen, it rests on the window's foot.
  const gap = async () => {
    const box = await context(page).boundingBox()
    const viewport = page.viewportSize()
    return box && viewport ? Math.round(Math.abs(box.y + box.height - viewport.height)) : Infinity
  }
  await expect.poll(gap).toBeLessThanOrEqual(1)
})

test('panes · a note sent while the thread is scrolled up comes into sight', async ({ page }) => {
  // A short window, so the thread scrolls; read from its top, away from its end.
  await page.setViewportSize({ width: 1440, height: 480 })
  await page.goto(PAGE)
  await expect(messages(page)).toHaveCount(6)
  const thread = open(page).locator('.conv-scroll')
  expect(await thread.evaluate((el) => el.scrollHeight > el.clientHeight + 100)).toBe(true)
  await thread.evaluate((el) => {
    el.scrollTop = 0
    el.dispatchEvent(new Event('scroll'))
  })
  await expect(messages(page).first()).toBeInViewport()
  const ask = open(page).getByRole('checkbox', { name: 'Ask Sophia' })
  if (await ask.isChecked()) await ask.uncheck()
  await field(page).fill('Sent from up here.')
  await field(page).press('Enter')
  await expect(messages(page).filter({ hasText: 'Sent from up here.' })).toBeInViewport({ ratio: 1 })
})

test('panes · your words on the right, the team’s on the left', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.goto(PAGE)
  const edge = (text: string) =>
    messages(page)
      .filter({ hasText: text })
      .locator('.conv-msg-body')
      .evaluate((el) => {
        const r = el.getBoundingClientRect()
        const pane = el.closest('.conv-open')?.getBoundingClientRect()
        return pane ? { left: r.left - pane.left, right: pane.right - r.right } : null
      })
  const mine = await edge('Let’s look at it together tomorrow.')
  const theirs = await edge('And every claim keeps its source')
  expect(mine && mine.right < mine.left, 'yours nearer the right').toBe(true)
  expect(theirs && theirs.left < theirs.right, 'theirs nearer the left').toBe(true)
})

test('panes · the summary is the context’s first card, «This conversation»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.goto(PAGE)
  const card = context(page).getByRole('region', { name: 'This conversation' })
  await expect(card).toContainText('Compared a short brief')
  await expect(open(page).getByText('Compared a short brief')).toHaveCount(0)
})

test('panes @phone · the first conversation opens at its newest message', async ({ page }) => {
  // A short phone: the thread is longer than its pane.
  await page.setViewportSize({ width: 390, height: 560 })
  await page.goto(PAGE)
  await rows(page).first().click()
  const thread = open(page).locator('.conv-scroll')
  expect(await thread.evaluate((el) => el.scrollHeight > el.clientHeight + 100)).toBe(true)
  await expect(messages(page).last()).toBeInViewport()
})

test('panes · at 1000 px the account menu opens over the context', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto(PAGE)
  await toggle(page).click()
  await expect(context(page)).toBeVisible()
  await page.getByRole('button', { name: 'Account' }).click()
  const menu = page.getByRole('menu', { name: 'Account' })
  await expect(menu).toBeVisible()
  const item = menu.getByRole('menuitem').first()
  // Once the panel has slid in.
  await expect.poll(async () => (await context(page).boundingBox())?.x).toBeLessThan(760)
  const [m, c] = await Promise.all([item.boundingBox(), context(page).boundingBox()])
  if (!m || !c) throw new Error('the menu or the panel is missing')
  // The item's middle lies on the panel: one of them has to be over the other there.
  expect(m.x + m.width / 2).toBeGreaterThan(c.x)
  expect(m.y + m.height / 2).toBeGreaterThan(c.y)
  expect(await onTop(item), 'the menu over the panel').toBe(true)
})

test('panes · Esc in a modal over the context leaves the context open', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto(PAGE)
  await toggle(page).click()
  await expect(context(page)).toBeVisible()
  // A modal over the panel (a sheet, a confirmation) owns its Esc.
  await page.evaluate(() => {
    const box = document.createElement('div')
    box.setAttribute('role', 'dialog')
    box.setAttribute('aria-modal', 'true')
    box.innerHTML = '<button type="button">Inside a sheet</button>'
    document.body.append(box)
  })
  await page.getByRole('button', { name: 'Inside a sheet' }).focus()
  await page.keyboard.press('Escape')
  // Still open (a closing panel stays visible while it slides out).
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
})

test('panes · the context open as a panel holds the focus: what is behind it is inert', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto(PAGE)
  await toggle(page).click()
  expect(await page.locator('.conv-open').evaluate((el) => el.hasAttribute('inert'))).toBe(true)
  expect(await page.locator('.conv-list').evaluate((el) => el.hasAttribute('inert'))).toBe(true)
  // The room's dock lies under the panel: Tab from the panel's last control never lands there, unseen.
  await context(page).getByText('How conversation context works').focus()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('.mini-dock'))).toBe(false)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Escape')
  expect(await page.locator('.conv-open').evaluate((el) => el.hasAttribute('inert'))).toBe(false)
})

test('panes · a panel left open closes when the window grows past 1180 px', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto(PAGE)
  await toggle(page).click()
  await page.setViewportSize({ width: 1440, height: 800 })
  await expect(page.locator('.conversations')).not.toHaveAttribute('data-context')
  expect(await page.locator('.conv-open').evaluate((el) => el.hasAttribute('inert'))).toBe(false)
  // Three panes again, filling the height: nothing pushed into a row of its own.
  const [o, c] = await Promise.all([open(page).boundingBox(), context(page).boundingBox()])
  expect(o && c && Math.abs(o.y - c.y) <= 1).toBe(true)
})

for (const width of [1440, 1280, 1000]) {
  test(`panes · at ${width} px, what it made opened beside the conversation leaves it room to write`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(PAGE)
    await open(page).locator('.conv-output').click()
    await expect(page.locator('.report-pane')).toBeVisible()
    await expect.poll(async () => (await open(page).boundingBox())?.width).toBeGreaterThanOrEqual(400)
    await field(page).fill('Beside the report')
    // Once the pane and the dock have moved aside.
    await expect.poll(() => onTop(send(page)), { message: 'Send in reach' }).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  })
}

test('panes · on a wide screen the messages line up with the field under them', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 })
  await page.goto(PAGE)
  const [m, f] = await Promise.all([
    open(page).locator('.conv-messages').boundingBox(),
    open(page).locator('.conv-field-box').boundingBox(),
  ])
  if (!m || !f) throw new Error('the messages or the field is missing')
  expect(Math.abs(m.x - f.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(m.x + m.width - (f.x + f.width))).toBeLessThanOrEqual(1)
})

test('panes · «Ask Sophia» off is a ring that reads at 3:1', async ({ page }) => {
  await page.goto(PAGE)
  const ring = open(page).locator('.conv-ask-box')
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  const seen = await ring.evaluate((el) => {
    let opacity = 1
    const grounds: string[] = []
    for (let up: Element | null = el; up; up = up.parentElement) {
      opacity *= parseFloat(getComputedStyle(up).opacity)
      grounds.push(getComputedStyle(up).backgroundColor)
    }
    const s = getComputedStyle(el)
    return { words: '', ink: s.borderTopColor, opacity, grounds, size: 0, box: el.getBoundingClientRect().width }
  })
  expect(contrastOf(seen)).toBeGreaterThanOrEqual(3)
  expect(seen.box).toBeGreaterThanOrEqual(10)
})

test('panes · while a note is on its way, Send shows it: a turning arc in the arrow’s place', async ({ page }) => {
  await page.goto(`${PAGE}&send=slow`)
  await open(page).getByRole('checkbox', { name: 'Ask Sophia' }).uncheck()
  await field(page).fill('On its way')
  await send(page).click()
  const sending = open(page).getByRole('button', { name: 'Sending…' })
  await expect(sending.locator('.conv-send-arc')).toBeVisible()
  await expect(sending).toHaveAttribute('data-busy', 'true')
  // Landed: the arrow again.
  await expect(send(page).locator('.conv-send-arc')).toHaveCount(0)
})

for (const where of ['none', 'new'] as const) {
  test(`panes · at 1000 px with no conversation open (${where === 'none' ? 'none yet' : 'a new one being written'}), the context opens from the list`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    await page.goto(where === 'none' ? PAGE.replace('conversations=1', 'conversations=none') : PAGE)
    if (where === 'new') await page.getByRole('button', { name: 'New conversation' }).click()
    await expect(open(page)).toHaveCount(0)
    const opener = list(page).getByRole('button', { name: 'Context' })
    await opener.click()
    await expect(context(page)).toBeVisible()
    await expect(opener).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(opener).toHaveAttribute('aria-expanded', 'false')
    await expect(opener).toBeFocused()
  })
}

test('panes · over 1180 px the list keeps no «Context»: the context is a pane there', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.goto(PAGE.replace('conversations=1', 'conversations=none'))
  await expect(list(page).getByRole('button', { name: 'Context' })).toBeHidden()
  await expect(context(page)).toBeVisible()
})

/** The controls narrower or shorter than a finger's 40 px. */
const small = (controls: { w: number; h: number }[]) => controls.filter((b) => b.w < 40 || b.h < 40)

test('panes @phone · on touch, every icon control and Send are at least 40 px', async ({ page }) => {
  await page.goto(PAGE)
  const sizes = async () =>
    page
      .locator('.conversations')
      .locator('.icon-button:visible, .conv-send:visible')
      .evaluateAll((all) =>
        all.map((b) => {
          const r = b.getBoundingClientRect()
          return { name: b.getAttribute('aria-label') ?? b.textContent, w: r.width, h: r.height }
        }),
      )
  // The list (New conversation), then a conversation (back, Context, Send), then its context (Close).
  expect(small(await sizes())).toEqual([])
  await rows(page).first().click()
  await field(page).fill('Reach')
  expect(small(await sizes())).toEqual([])
  await toggle(page).click()
  await expect(context(page)).toBeVisible()
  expect(small(await sizes())).toEqual([])
})
