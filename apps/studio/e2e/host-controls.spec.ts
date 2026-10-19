import { expect, test, type Page } from '@playwright/test'

// An admin mutes or removes someone in the call (docs/plans/host-controls.md, A24): the side panel's People lists
// everyone, you first, and an admin's menu on each other member mutes their microphone while it is on, or takes them
// out of the call. A guest leaves by the door's Deny, so their row offers nothing. Every name is synthetic.

const MARCO = '00000000-0000-4000-8000-0000000000b1'
const LUCIA = '00000000-0000-4000-8000-0000000000b2'
const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const list = (page: Page) => page.getByRole('list', { name: 'People in the call' })
const actions = (page: Page, name: string) => list(page).getByRole('button', { name: `Actions for ${name}` })
const menu = (page: Page, name: string) => page.getByRole('menu', { name: `Actions for ${name}` })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

async function enter(page: Page, query = '') {
  await page.goto(`/room.html?call=on&people=2${query}`)
  await expect(leave(page).first()).toBeVisible()
  await page.locator('.panel-toggles [data-panel="people"]').click()
  await expect(list(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('host · People lists everyone in the call, you first, with whether each microphone is on', async ({ page }) => {
  await enter(page)
  await expect(list(page).locator('.person-name')).toHaveText(['Fixture · you', 'Marco', 'Lucía'])
  await expect(list(page).getByRole('img', { name: 'Microphone on' })).toHaveCount(3)
})

test('host · an admin mutes a member whose microphone is on, and takes another out of the call', async ({ page }) => {
  await enter(page)
  await actions(page, 'Marco').click()
  await expect(menu(page, 'Marco').getByRole('menuitem')).toHaveText(['Mute microphone', 'Remove from call'])
  await menu(page, 'Marco').getByRole('menuitem', { name: 'Mute microphone' }).click()
  await expect.poll(() => served(page)).toContain(`mute:${MARCO}`)
  await expect(
    list(page).locator('li', { hasText: 'Marco' }).getByRole('img', { name: 'Microphone off' }),
  ).toBeVisible()
  await actions(page, 'Marco').click()
  await expect(menu(page, 'Marco').getByRole('menuitem')).toHaveText(['Remove from call'])
  await page.keyboard.press('Escape')
  await actions(page, 'Lucía').click()
  await menu(page, 'Lucía').getByRole('menuitem', { name: 'Remove from call' }).click()
  await expect.poll(() => served(page)).toContain(`remove:${LUCIA}`)
  await expect(list(page).locator('.person-name')).toHaveText(['Fixture · you', 'Marco'])
})

test('host · an editor sees the people, and no actions', async ({ page }) => {
  await enter(page, '&role=editor')
  await expect(list(page).locator('.person-name')).toHaveCount(3)
  await expect(list(page).getByRole('button', { name: /^Actions for/ })).toHaveCount(0)
})

test('host · a guest’s row offers nothing: a guest leaves by the door', async ({ page }) => {
  await enter(page, '&guest=1')
  await expect(list(page).locator('li', { hasText: 'Lucía' })).toContainText('Guest')
  await expect(actions(page, 'Lucía')).toHaveCount(0)
  await expect(actions(page, 'Marco')).toHaveCount(1)
})

test('host · a refusal is said in the panel, and nothing changes', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.failHost())
  await actions(page, 'Marco').click()
  await menu(page, 'Marco').getByRole('menuitem', { name: 'Mute microphone' }).click()
  await expect(list(page).getByRole('alert')).toContainText('Couldn’t mute Marco')
  await expect(list(page).locator('li', { hasText: 'Marco' }).getByRole('img', { name: 'Microphone on' })).toBeVisible()
})

test('host · while a control is on its way, its row waits; the menu hands focus back to its opener', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.holdHost(true))
  await actions(page, 'Marco').click()
  await menu(page, 'Marco').getByRole('menuitem', { name: 'Mute microphone' }).press('Enter')
  await expect(actions(page, 'Marco')).toBeFocused()
  const row = list(page).locator('li', { hasText: 'Marco' })
  await expect(row.getByRole('status')).toHaveText('Muting Marco…')
  await expect(actions(page, 'Marco')).toHaveAttribute('aria-disabled', 'true')
  // A press on the waiting menu (dimmed, so Playwright would wait for it) opens nothing.
  await actions(page, 'Marco').click({ force: true })
  await expect(menu(page, 'Marco')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.holdHost(false))
  await expect(row.getByRole('img', { name: 'Microphone off' })).toBeVisible()
  await expect(row.getByRole('status')).toHaveCount(0)
  await expect(actions(page, 'Marco')).not.toHaveAttribute('aria-disabled', 'true')
  expect((await served(page)).filter((s) => s === `mute:${MARCO}`)).toHaveLength(1)
})

test('host · an admin turns a member’s camera off, and stops a member’s screen', async ({ page }) => {
  await enter(page, '&video=camera')
  await actions(page, 'Marco').click()
  await expect(menu(page, 'Marco').getByRole('menuitem')).toHaveText([
    'Mute microphone',
    'Turn off camera',
    'Remove from call',
  ])
  await menu(page, 'Marco').getByRole('menuitem', { name: 'Turn off camera' }).click()
  await expect.poll(() => served(page)).toContain(`stop-camera:${MARCO}`)
  await page.goto('/room.html?call=on&people=2&video=screen')
  await page.locator('.panel-toggles [data-panel="people"]').click()
  await actions(page, 'Marco').click()
  await menu(page, 'Marco').getByRole('menuitem', { name: 'Stop screen sharing' }).click()
  await expect.poll(() => served(page)).toContain(`stop-screen:${MARCO}`)
})

test('host · «Mute everyone» asks first, then every other microphone is off', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'Mute everyone' }).click()
  await expect(page.getByText('Everyone else’s microphone goes off')).toBeVisible()
  await page.getByRole('button', { name: 'Mute them' }).click()
  await expect.poll(() => served(page)).toContain('mute-all')
  await expect(
    list(page).locator('li', { hasText: 'Marco' }).getByRole('img', { name: 'Microphone off' }),
  ).toBeVisible()
  await expect(
    list(page).locator('li', { hasText: 'Lucía' }).getByRole('img', { name: 'Microphone off' }),
  ).toBeVisible()
})

test('host · an editor has no «Mute everyone»', async ({ page }) => {
  await enter(page, '&role=editor')
  await expect(list(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mute everyone' })).toHaveCount(0)
})

test('host · a control past six seconds says it is slow, as every Studio write does (Codex P2 on #351)', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate(() => window.fixture?.holdHost(true))
  await actions(page, 'Marco').click()
  await menu(page, 'Marco').getByRole('menuitem', { name: 'Mute microphone' }).click()
  const row = list(page).locator('li', { hasText: 'Marco' })
  await expect(row.getByRole('status')).toContainText('Taking longer than usual', { timeout: 9000 })
  await page.evaluate(() => window.fixture?.holdHost(false))
})

test('host · removed by keyboard, the focus goes to the list, never the page (Codex P2 on #351)', async ({ page }) => {
  await enter(page)
  await actions(page, 'Lucía').focus()
  await page.keyboard.press('Enter')
  await menu(page, 'Lucía').getByRole('menuitem', { name: 'Remove from call' }).press('Enter')
  await expect(list(page).locator('.person-name')).toHaveText(['Fixture · you', 'Marco'])
  await expect(list(page)).toBeFocused()
})

test('host · the corner keeps room for its three toggles beside the dock (Codex P2 on #351)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/room.html?call=on&people=2')
  await expect(page.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
  const fits = await page.evaluate(() => {
    const corner = document.querySelector<HTMLElement>('.panel-toggles')
    const stage = document.querySelector<HTMLElement>('.room-stage')
    if (!corner || !stage) return null
    const room = Number.parseFloat(getComputedStyle(stage).getPropertyValue('--corner-room'))
    return { room, corner: corner.getBoundingClientRect().width }
  })
  expect(fits).not.toBeNull()
  expect(fits?.room ?? 0).toBeGreaterThanOrEqual((fits?.corner ?? 0) + 12)
})

/** Once what is arriving has arrived (the panel slides in): boxes are read where they rest. */
const arrived = (page: Page) =>
  page.evaluate(async () => {
    const arriving = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity)
    await Promise.all(arriving.map((a) => a.finished.catch(() => null)))
  })

/** Where People's parts stand against the panel's: the tabs' line, Close's end, «Mute everyone», and each row, with its
 * menu's opener where it has one. A part that is absent measures NaN, so every check on it fails. */
const peopleRead = (page: Page) =>
  page.evaluate(() => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
    const edges = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect()
      return { left: r?.left ?? NaN, right: r?.right ?? NaN, width: r?.width ?? NaN, height: r?.height ?? NaN }
    }
    const panel = document.querySelector('.side-panel')
    return {
      line: edges(panel?.querySelector('#side-tab-chat')).left,
      close: edges(panel?.querySelector('.side-panel-head > [aria-label="Close"]')).right,
      mute: edges(panel?.querySelector('.people-head button')),
      rows: [...(panel?.querySelectorAll('.people > li') ?? [])].map((li) => ({
        row: edges(li),
        name: edges(li.querySelector('.person-name')),
      })),
      openers: [...(panel?.querySelectorAll('.people > li') ?? [])].flatMap((li) => {
        const opener = li.querySelector('.person-actions > button')
        return opener ? [{ row: edges(li), opener: edges(opener) }] : []
      }),
      edge: innerWidth,
    }
  })

test('host · People sits on the panel’s gutter; each menu ends where Close does (room-dock-people.md)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enter(page)
  await arrived(page)
  const { line, close, mute, rows, openers, edge } = await peopleRead(page)
  expect(rows).toHaveLength(3)
  for (const { row, name } of rows) {
    expect(name.left).toBeCloseTo(line, 0)
    // The row's own plane frames its name: 8 px before it.
    expect(name.left - row.left).toBeCloseTo(8, 0)
  }
  // «Mute everyone» is a press on the same line, not a heading.
  expect(mute.left).toBeCloseTo(line, 0)
  expect(mute.height).toBe(28)
  expect(openers).toHaveLength(2)
  for (const { row, opener } of openers) {
    expect(opener).toMatchObject({ width: 32, height: 32 })
    expect(opener.right).toBeCloseTo(close, 0)
    expect(opener.right).toBeLessThanOrEqual(edge - 12)
    expect(opener.right).toBeLessThanOrEqual(row.right + 0.5)
  }
  // Under the pointer, a row's plane shows.
  const marco = list(page).locator('li', { hasText: 'Marco' })
  await marco.hover()
  await expect(marco).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

test('host · @phone People on a phone: rows on the gutter, every menu a finger’s size inside its row', async ({
  page,
}) => {
  await enter(page)
  await arrived(page)
  const { rows, openers, edge } = await peopleRead(page)
  expect(rows).toHaveLength(3)
  for (const { name } of rows) expect(name.left).toBeCloseTo(16, 0)
  expect(openers).toHaveLength(2)
  for (const { row, opener } of openers) {
    expect(opener.width).toBeGreaterThanOrEqual(40)
    expect(opener.height).toBeGreaterThanOrEqual(40)
    expect(opener.right).toBeLessThanOrEqual(row.right + 0.5)
    expect(opener.right).toBeLessThanOrEqual(edge - 8)
  }
})
