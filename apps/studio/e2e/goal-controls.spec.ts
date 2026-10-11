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
    hold.disabled = true
    const disabled = { cursor: getComputedStyle(hold).cursor, opacity: getComputedStyle(hold).opacity }
    hold.disabled = false
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
