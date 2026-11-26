// One primary on a goal (docs/plans/goal-controls-text.md): in a goal's controls «Request review» is the one filled
// press; Hold and Stop are text buttons with their tips, 24 px on the press scale; Stop still asks in place.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const PAGES: readonly [string, string, (typeof DRAWN)[keyof typeof DRAWN]][] = [
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['the work space', '/work.html', DRAWN.work],
]

/** The first goal's controls as drawn: the filled presses, and each text button's words, height and tip. */
const controlsRead = (page: Page) =>
  page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('.controls .control-row')
    if (!row) return null
    const filled = [...row.querySelectorAll<HTMLElement>('.pill.primary')].map((b) => b.textContent.trim())
    const text = [...row.querySelectorAll<HTMLElement>('button.text-button')].map((b) => ({
      words: b.childNodes[0]?.textContent?.trim() ?? '',
      height: Math.round(b.getBoundingClientRect().height),
      tip: b.classList.contains('has-tip'),
    }))
    return { filled, text }
  })

for (const [name, url, parts] of PAGES) {
  test(`goal controls · ${name}: one filled press, Hold and Stop as text with their tips`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    const read = await controlsRead(page)
    expect(read?.filled.map((w) => w.replace(/Ask for a review.*$/, ''))).toEqual(['Request review'])
    expect(read?.text.map((t) => t.words)).toEqual(['Hold', 'Stop'])
    for (const t of read?.text ?? []) expect(t.height, t.words).toBe(24)
    expect(read?.text.find((t) => t.words === 'Hold')?.tip).toBe(true)
    // Stop too, the destructive one: its tip says what it does (Codex on #253).
    expect(read?.text.find((t) => t.words === 'Stop')?.tip).toBe(true)
  })
}

test('goal controls · a text button that is disabled shows no hover and the step sits only in a goal’s controls', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const read = await page.evaluate(() => {
    const hold = document.querySelector<HTMLButtonElement>('.controls .control-row button.text-button')
    if (!hold) return null
    const rest = getComputedStyle(hold).textDecorationColor
    hold.disabled = true // left so, for the hover below
    const disabled = { cursor: getComputedStyle(hold).cursor, opacity: getComputedStyle(hold).opacity }
    // The step after the filled press belongs to a goal's controls: a row of presses elsewhere keeps the kit's gap.
    const probe = document.createElement('div')
    probe.className = 'control-row'
    probe.innerHTML = '<button class="pill">a</button><button class="text-button">b</button>'
    document.body.append(probe)
    const strayEl = probe.lastElementChild
    const stray = strayEl ? getComputedStyle(strayEl).marginLeft : null
    probe.remove()
    return { rest, disabled, stray, step: getComputedStyle(hold).marginLeft }
  })
  expect(read?.disabled.cursor).toBe('default')
  expect(read?.disabled.opacity).toBe('0.6')
  expect(read?.step).toBe('6px')
  expect(read?.stray).toBe('0px')
  // Under the pointer the disabled press keeps its rest; enabled again, it answers (the underline's ink steps up).
  const hold = page.locator('.controls .control-row button.text-button').first()
  const decoration = () => hold.evaluate((el) => getComputedStyle(el).textDecorationColor)
  await hold.hover()
  expect(await decoration()).toBe(read?.rest)
  await hold.evaluate((el) => {
    if (el instanceof HTMLButtonElement) el.disabled = false
  })
  await page.mouse.move(0, 0)
  await hold.hover()
  await expect.poll(decoration).not.toBe(read?.rest)
})

test('goal controls @phone · on a coarse pointer Hold and Stop reach 44 × 44 px each, and their targets never meet (demo-findings-1 #9)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const targets = await page
    .locator('.controls .control-row')
    .first()
    .evaluate((row) =>
      [...row.querySelectorAll<HTMLElement>('button.text-button')].map((press) => {
        // The target is the press's ::after, placed around it: its used size, and where it starts from the press's box.
        const box = press.getBoundingClientRect()
        const after = getComputedStyle(press, '::after')
        const left = box.left + parseFloat(after.left)
        const width = parseFloat(after.width)
        return {
          words: press.childNodes[0]?.textContent?.trim() ?? '',
          left,
          right: left + width,
          width,
          height: parseFloat(after.height),
        }
      }),
    )
  expect(targets.map((t) => t.words)).toEqual(['Hold', 'Stop'])
  for (const t of targets) {
    expect(t.width, t.words).toBeGreaterThanOrEqual(44)
    expect(t.height, t.words).toBeGreaterThanOrEqual(44)
  }
  const [hold, stop] = targets
  // Apart, with room: Hold's target ends before Stop's starts (numbers in the failure, not a bare false).
  expect(hold?.right).toBeLessThanOrEqual(stop?.left ?? Number.NEGATIVE_INFINITY)
})

test('goal controls · under a mouse Hold and Stop answer across the row’s 28 px and past their sides, still apart (five-decisions.md, 12)', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  // What the mouse would press, read with elementFromPoint: 1.5 px over, under and past the sides of each drawn box,
  // and the middle of the 6 px between the two, which presses neither.
  const read = await page
    .locator('.controls .control-row')
    .first()
    .evaluate((row) => {
      const presses = [...row.querySelectorAll<HTMLElement>('button.text-button')]
      const each = presses.map((press) => {
        const box = press.getBoundingClientRect()
        const midX = box.left + box.width / 2
        const midY = box.top + box.height / 2
        const points = [
          [midX, box.top - 1.5],
          [midX, box.bottom + 1.5],
          [box.left - 1.5, midY],
          [box.right + 1.5, midY],
        ] as const
        return {
          words: press.childNodes[0]?.textContent?.trim() ?? '',
          drawn: Math.round(box.height),
          around: points.map(([x, y]) => document.elementFromPoint(x, y)?.closest('button') === press),
        }
      })
      const [first, second] = presses.map((p) => p.getBoundingClientRect())
      const between =
        first && second
          ? document.elementFromPoint((first.right + second.left) / 2, first.top + first.height / 2)?.closest('button')
          : null
      return { each, between: between ? between.textContent.trim() : null }
    })
  expect(read.each.map((p) => p.words)).toEqual(['Hold', 'Stop'])
  for (const p of read.each) {
    expect(p.drawn, p.words).toBe(24)
    expect(p.around, p.words).toEqual([true, true, true, true])
  }
  expect(read.between).toBeNull()
})

test('goal controls · Stop still asks in place; Keep working puts the text button back', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const row = page.locator('.controls .control-row').first()
  await row.getByRole('button', { name: 'Stop', exact: true }).click()
  const asking = row.getByRole('group', { name: 'Stop' })
  await expect(asking).toContainText('Stopped goals can’t be resumed.')
  await expect(asking.getByRole('button', { name: 'Stop for good' })).toBeVisible()
  await asking.getByRole('button', { name: 'Keep working' }).click()
  await expect(asking).toHaveCount(0)
  await expect(row.locator('button.text-button', { hasText: 'Stop' })).toBeVisible()
})

test('goal controls · Stop’s tip says what it does, on hover and on focus (Codex on #253)', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const stop = page.locator('.controls .control-row').first().getByRole('button', { name: /^Stop/ })
  await expect(stop.locator('.tip')).toHaveText(/End the work for good/)
  await stop.focus()
  await expect(stop.locator('.tip')).toBeVisible()
})

test('goal controls · a disabled text button outside a goal keeps the kit’s 0.45 (Codex on #253)', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const opacity = await page.evaluate(() => {
    const stray = document.createElement('button')
    stray.className = 'text-button'
    stray.disabled = true
    document.body.append(stray)
    const value = getComputedStyle(stray).opacity
    stray.remove()
    return value
  })
  expect(opacity).toBe('0.45')
})
