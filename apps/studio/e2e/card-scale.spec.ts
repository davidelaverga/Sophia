import { expect, test, type Locator, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// One card (docs/plans/card-scale.md): the board's research card and its tiles, the Knowledge cards with their covers
// and the resource tiles stand on the one `.card` surface: a 1 px edge in the app's line, 12 px of radius and 14 of
// padding (the tile 8 and 10 × 12), the raised plane; a live card's edge lights under the pointer, a press sinks it
// half a pixel, the keyboard draws the ring. Measured on a desktop.

/**
 * A tile's states that colour its own surface (board.css): the marks whose edge is their own (`--edge`), and the marks
 * whose plane is (a free tile is see-through, a complete one steps back). Their colour is theirs; the rest is the kit's.
 */
const OWN = { edge: ['waiting', 'working', 'changes'], plane: ['free', 'complete'] }

/** Every card on screen as the page sees it: its kind, radius, edge, plane and padding. */
function readCards(own: typeof OWN) {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  return [...document.querySelectorAll<HTMLElement>('.card')].filter(seen).map((card) => {
    const cs = getComputedStyle(card)
    const mark = card.getAttribute('data-mark') ?? ''
    const ownEdge =
      ['data-changed', 'data-lit', 'data-waiting'].some((a) => card.hasAttribute(a)) || own.edge.includes(mark)
    return {
      name: card.className
        .replace(/\b(card-tile|card|live)\b/g, '')
        .trim()
        .slice(0, 24),
      kind: card.classList.contains('card-tile') ? 'tile' : 'base',
      radius: cs.borderRadius,
      edge: `${cs.borderTopWidth} ${cs.borderTopStyle}${ownEdge ? '' : ` ${cs.borderTopColor}`}`,
      plane: own.plane.includes(mark) ? 'own' : cs.backgroundColor,
      pad: cs.padding,
      cover: [...card.querySelectorAll('.card-cover')].map((c) => {
        const s = getComputedStyle(c)
        return `${s.borderRadius} · ${s.borderTopWidth} ${s.borderTopColor} · ${s.backgroundColor}`
      }),
    }
  })
}

const LINE = 'rgba(236, 235, 241, 0.08)'
const PLANE = 'rgb(18, 17, 24)'

/** The cards off the surface, said; a page measures one at least. */
async function offSurface(page: Page) {
  const cards = await page.evaluate(readCards, OWN)
  expect(cards.length).toBeGreaterThan(0)
  return cards
    .filter((c) => {
      const tile = c.kind === 'tile'
      const pad = tile ? '10px 12px' : c.name.includes('report-card') ? '8px 8px 14px' : '14px'
      return (
        c.radius !== (tile ? '8px' : '12px') ||
        !c.edge.startsWith('1px solid') ||
        (c.edge.includes('rgb') && c.edge !== `1px solid ${LINE}`) ||
        (c.plane !== 'own' && c.plane !== PLANE) ||
        c.pad !== pad ||
        c.cover.some((cover) => cover !== `8px · 1px ${LINE} · rgb(11, 10, 15)`)
      )
    })
    .map(
      (c) =>
        `${c.name}: ${c.radius} · ${c.edge} · ${c.plane} · ${c.pad}${c.cover.length ? ` · cover ${c.cover.join()}` : ''}`,
    )
}

/** A live card answers: the edge lights under the pointer, a press sinks it half a pixel. */
async function answers(page: Page, card: Locator) {
  await card.hover()
  await expect(card).toHaveCSS('border-top-color', 'rgba(236, 235, 241, 0.14)')
  await page.mouse.down()
  await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0.5)')
  await page.mouse.up()
  await page.mouse.move(0, 0)
  await expect(card).toHaveCSS('border-top-color', LINE)
}

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

test('cards · the board: the research card and the tiles on the one surface; a tile answers', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  expect(await offSurface(page)).toEqual([])
  await answers(page, page.locator('.task-tile').last())
})

test('cards · Knowledge: the cards and their covers on the one surface; a card answers', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=knowledge')
  await drawn(page, DRAWN.knowledge)
  expect(await offSurface(page)).toEqual([])
  await answers(page, page.locator('.report-card').first())
})

test('cards · Resources: the tiles on the one surface; a tile answers, and the keyboard draws its ring', async ({
  page,
}) => {
  await page.goto('/resources.html')
  await drawn(page, DRAWN.resources)
  expect(await offSurface(page)).toEqual([])
  await answers(page, page.locator('.resource-tile:not([data-waiting])').first())
  // The tiles' one Tab stop, reached from the keyboard: the ring in the halo, 2 px outside the edge.
  const first = page.locator('.resource-tile').first()
  await first.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await expect(first).toHaveCSS('outline-color', 'rgb(156, 130, 245)')
  await expect(first).toHaveCSS('outline-width', '2px')
})
