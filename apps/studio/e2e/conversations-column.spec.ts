// Conversations, polished (docs/plans/conversations-polish.md): the list's column has one line of words and one line of
// boxes, and the faces in the open conversation's head read on paper.
import { expect, test, type Page } from '@playwright/test'
import { contrastOf } from './contrast.ts'
import { DRAWN, drawn } from './drawn.ts'

const PAGE = '/room.html?demo=1&conversations=1&place=conversations'

/** The left edges, rounded (NaN where an element is missing, which no expectation accepts). */
const lefts = (xs: ({ left: number } | null)[]) => xs.map((x) => Math.round(x?.left ?? NaN))

/** The left and right edges of the first element a selector names: its box, or its words (a press's box has a lead). */
const edges = (page: Page, selector: string, of: 'box' | 'words' = 'box') =>
  page.evaluate(
    ([sel, what]) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const range = document.createRange()
      range.selectNodeContents(el)
      const r = what === 'words' ? range.getBoundingClientRect() : el.getBoundingClientRect()
      return { left: r.left, right: r.right }
    },
    [selector, of] as const,
  )

test('list · one line of words at 20 and one line of boxes at 8; the «+» press ends where a row’s date ends', async ({
  page,
}) => {
  await page.goto(PAGE)
  await drawn(page, DRAWN.conversations)
  const words = await Promise.all(
    ['.conv-list-head h2', '.conv-show button', '.conv-row .conv-title'].map((s) => edges(page, s, 'words')),
  )
  const boxes = await Promise.all(['.conv-filter', '.conv-row'].map((s) => edges(page, s)))
  expect(lefts(words)).toEqual([20, 20, 20])
  expect(lefts(boxes)).toEqual([8, 8])
  // One head, one tracking: the list's title and the open conversation's title share the 15 px heads' letter-spacing.
  const tracking = await page.evaluate(() =>
    ['.conv-list-head h2', '.conv-head h3'].map((s) => {
      const el = document.querySelector(s)
      return el ? getComputedStyle(el).letterSpacing : null
    }),
  )
  expect(tracking[0]).toBe(tracking[1])
  const plus = await edges(page, '.conv-list-head button')
  const date = await edges(page, '.conv-row .conv-row-at')
  expect(Math.round(plus?.right ?? NaN)).toBe(Math.round(date?.right ?? NaN))
})

/** A face of the open conversation's head, as painted: its inks, its ring, and what it stands on. */
function readFace(selector: string) {
  const face = document.querySelector(selector)
  const head = document.querySelector('.conv-head')
  if (!face || !head) return null
  const f = getComputedStyle(face)
  // What the face stands on, as painted: the first ancestor with a colour of its own (the head and the pane are
  // see-through; the page is not).
  let backing = 'rgba(0, 0, 0, 0)'
  for (let el: Element | null = face.parentElement; el && backing === 'rgba(0, 0, 0, 0)'; el = el.parentElement)
    backing = getComputedStyle(el).backgroundColor
  return {
    ink: f.color,
    disc: f.backgroundColor,
    plane: getComputedStyle(head).backgroundColor,
    ring: f.boxShadow,
    backing,
    words: face.textContent.trim(),
  }
}

test('faces · on paper the initial reads on its disc, and the disc on the head’s plane', async ({ page }) => {
  await page.goto(`${PAGE}&theme=light`)
  await drawn(page, DRAWN.conversations)
  const read = await page.evaluate(readFace, '.conv-head .conv-face:not(.sophia)')
  if (!read) throw new Error('no face in the head')
  expect(read.words.length).toBeGreaterThan(0)
  // The ring is the colour of what the face stands on: a separator, not a second disc.
  expect(read.ring, JSON.stringify(read)).toContain(read.backing)
  // The initial on its disc, the disc on the head's plane over the paper.
  const paper = 'rgb(251, 248, 243)'
  const grounds = [read.disc, read.plane, paper]
  const initial = contrastOf({ words: 'initial', size: 10.5, ink: read.ink, opacity: 1, grounds })
  const disc = contrastOf({ words: 'disc', size: 20, ink: read.disc, opacity: 1, grounds: grounds.slice(1) })
  expect(initial, JSON.stringify(read)).toBeGreaterThanOrEqual(3)
  expect(disc, JSON.stringify(read)).toBeGreaterThanOrEqual(1.5)
})

test('faces · on paper Sophia’s disc reads on the page too (Codex on #257)', async ({ page }) => {
  await page.goto(`${PAGE}&theme=light`)
  await drawn(page, DRAWN.conversations)
  const read = await page.evaluate(readFace, '.conv-head .conv-face.sophia')
  if (!read) throw new Error('no Sophia face in the head')
  const disc = contrastOf({
    words: 'disc',
    size: 20,
    ink: read.disc,
    opacity: 1,
    grounds: [read.plane, 'rgb(251, 248, 243)'],
  })
  expect(disc, JSON.stringify(read)).toBeGreaterThanOrEqual(1.5)
})

test('list @phone · at a phone’s width the words share one edge and the boxes another, 12 px apart; the «+» press a finger’s height (Codex on #257)', async ({
  page,
}) => {
  await page.goto(PAGE)
  // On a phone one pane at a time: the list is the first.
  await expect(page.locator('.conv-row .conv-title').first()).toBeVisible()
  const words = lefts(
    await Promise.all(
      ['.conv-list-head h2', '.conv-show button', '.conv-row .conv-title'].map((s) => edges(page, s, 'words')),
    ),
  )
  const boxes = lefts(await Promise.all(['.conv-filter', '.conv-row'].map((s) => edges(page, s))))
  expect(new Set(words).size, words.join(' ')).toBe(1)
  expect(new Set(boxes).size, boxes.join(' ')).toBe(1)
  expect((words[0] ?? NaN) - (boxes[0] ?? NaN)).toBe(12)
  const plus = await page.locator('.conv-list-head button').boundingBox()
  expect(Math.round(plus?.height ?? 0)).toBeGreaterThanOrEqual(40)
})

test('faces · on paper every disc is opaque, so two that overlap keep their colours (Codex on #257)', async ({
  page,
}) => {
  await page.goto(`${PAGE}&theme=light`)
  await drawn(page, DRAWN.conversations)
  const discs = await page.evaluate(() =>
    [...document.querySelectorAll('.conv-head .conv-face')].map((el) => getComputedStyle(el).backgroundColor),
  )
  expect(discs.length).toBeGreaterThan(1)
  for (const disc of discs) expect(disc, discs.join(' ')).toMatch(/^rgb\(/)
})

test('faces · on paper Sophia’s half of her mark reads on her disc (Codex P2 on #257)', async ({ page }) => {
  await page.goto(`${PAGE}&theme=light`)
  await drawn(page, DRAWN.conversations)
  const read = await page.evaluate(() => {
    const face = document.querySelector('.conv-head .conv-face.sophia')
    const half = face?.querySelector('.umbral-sophia')
    return face && half ? { fill: getComputedStyle(half).fill, disc: getComputedStyle(face).backgroundColor } : null
  })
  if (!read) throw new Error('no Sophia face with her mark in the head')
  const glyph = contrastOf({ words: 'glyph', size: 11, ink: read.fill, opacity: 1, grounds: [read.disc] })
  expect(glyph, JSON.stringify(read)).toBeGreaterThanOrEqual(3)
})
