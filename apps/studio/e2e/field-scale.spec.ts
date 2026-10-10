import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// A field stands on two heights (docs/plans/field-scale.md): on each fixture page that has one, once drawn, every
// visible input or select a person can see is 36 px tall, or 44 as a hero field, its group (`.field`) counted as the
// field when it has one. And a toolbar's controls share a line: a search beside a segmented is as tall as it. Measured
// on a desktop. The personal space writes in a textarea line and the room's fields are in its sheets (the Invite's
// below, Search's in sheet-frame.spec.ts): neither page has a field to measure, so neither is listed.

const PAGES = [
  ['sign-in', '/signin.html', DRAWN.signin],
  ['the door', '/join.html?demo=1', DRAWN.join],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations', DRAWN.conversations],
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Resources', '/resources.html', DRAWN.resources],
  ['the work space', '/work.html', DRAWN.work],
] as const

/** The heights a field may stand on (field-class.ts's FIELD_SCALE, as the page sees it). */
const SCALE = [36, 44]

/**
 * In the page: every visible input (not a checkbox or a radio) and select, read as its field: its `.field` group when
 * it is in one, itself otherwise. Home's line (`.hw-say`) is a line, not a box, and is not measured here.
 */
function readFields() {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight
  }
  return [...document.querySelectorAll('input, select')]
    .filter((el) => !el.closest('.fixture-label, .hw-say') && seen(el))
    .filter((el) => !(el instanceof HTMLInputElement) || !['checkbox', 'radio', 'hidden'].includes(el.type))
    .map((el) => {
      const box = el.closest('.field') ?? el
      return {
        height: Math.round(box.getBoundingClientRect().height),
        className: box.className,
        name: (el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? '').slice(0, 32),
      }
    })
}

async function offScale(page: Page) {
  const fields = await page.evaluate(readFields)
  expect(fields.length).toBeGreaterThan(0)
  return fields.filter((f) => !SCALE.includes(f.height)).map((f) => `${String(f.height)}px .${f.className} «${f.name}»`)
}

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
    ...(window.workFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

for (const [name, url, parts] of PAGES) {
  test(`fields · on ${name}, every field stands on 36 or 44 px`, async ({ page }) => {
    await page.goto(url)
    // The page has drawn: each of its reads (drawn.ts), never «the network is idle».
    await drawn(page, parts)
    expect(await offScale(page)).toEqual([])
  })
}

test('fields · the code asked after the address is a hero field too (44 px)', async ({ page }) => {
  await page.goto('/signin.html')
  await drawn(page, DRAWN.signin)
  await page.getByLabel('Email').fill('luis@sophia.test')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByLabel('Code from the email')).toBeVisible()
  expect(await offScale(page)).toEqual([])
})

test('fields · the Invite sheet’s fields, guests and members, stand on 36 px', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).click()
  await expect(page.getByRole('tab', { name: 'Guests' })).toBeVisible()
  expect(await offScale(page)).toEqual([])
  await page.getByRole('tab', { name: 'Members' }).click()
  await expect(page.getByLabel('Role')).toBeVisible()
  expect(await offScale(page)).toEqual([])
})

for (const [name, url, parts] of [
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Resources', '/resources.html', DRAWN.resources],
] as const) {
  test(`fields · on ${name}, the search and the segmented beside it share one height`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    const heights = await page.evaluate(() => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
      const h = (sel: string) => Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? 0)
      return { search: h('.search > input'), segmented: h('.segmented') }
    })
    expect(heights.search).toBe(36)
    expect(heights.segmented).toBe(heights.search)
  })
}
