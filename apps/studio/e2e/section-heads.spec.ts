// A view's section heads one step above the body (docs/plans/section-heads.md): on each view the heads of its sections
// and tiles compute 15 px on 20 at 600, larger than the body and smaller than the view's title; a task tile's title, a
// message and a statement keep the title step.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const HEADS = [
  '.goals .goal-title',
  '.view-subhead',
  '.report-card-title',
  '.connections > h3',
  '.resource-tile-name',
  '.conv-list-head h2',
  // The open conversation's title and the new conversation's heading (Codex on #248): read in their own states below.
  '.conv-head h3',
  '.conv-new > h3',
].join(', ')

const VIEWS: readonly [string, string, (typeof DRAWN)[keyof typeof DRAWN]][] = [
  ['Goals', '/room.html?demo=1&place=goals', DRAWN.goals],
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Resources', '/resources.html', DRAWN.resources],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations', DRAWN.conversations],
]

/** The heads as drawn (size, leading, weight, how many), and the sizes around them: the body's and the view title's. */
const headsRead = (page: Page, heads: string) =>
  page.evaluate((sel) => {
    const shown = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getClientRects().length > 0)
    const types = [
      ...new Set(
        shown.map(
          (el) =>
            `${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight} ${getComputedStyle(el).fontWeight}`,
        ),
      ),
    ]
    const title = document.querySelector<HTMLElement>('.view-head h2, .updates > h2')
    // The tokens as drawn, in px: the scale is rem (type-rem.md), so their raw text isn't a size to compare.
    const probe = document.createElement('span')
    document.body.append(probe)
    probe.style.fontSize = 'var(--type-body)'
    const body = parseFloat(getComputedStyle(probe).fontSize)
    probe.style.fontSize = 'var(--type-head)'
    const head = parseFloat(getComputedStyle(probe).fontSize)
    probe.remove()
    return {
      count: shown.length,
      types,
      title: title ? parseFloat(getComputedStyle(title).fontSize) : null,
      body,
      head,
    }
  }, heads)

for (const [name, url, parts] of VIEWS) {
  test(`section heads · ${name}: every head is 15 px on 20 at 600, between the body and the view's title`, async ({
    page,
  }) => {
    await page.goto(url)
    await drawn(page, parts)
    const read = await headsRead(page, HEADS)
    expect(read.count).toBeGreaterThan(0)
    expect(read.types).toEqual(['15px/20px 600'])
    expect(read.head).toBeGreaterThan(read.body)
    if (read.title !== null) expect(read.title).toBeGreaterThan(read.head)
  })
}

test('section heads · Tasks: a task tile’s title is the body’s size at 500, under the heads; five sizes on the screen', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  const tile = page.locator('.task-tile-title').first()
  await expect(tile).toBeVisible()
  await expect(tile).toHaveCSS('font-size', '13px')
  await expect(tile).toHaveCSS('font-weight', '500')
})

test('section heads · the open conversation’s title and the new conversation’s heading are heads (Codex on #248)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/room.html?place=conversations&conversations=1')
  await expect(page.getByRole('region', { name: 'Open conversation' }).locator('.conv-head h3')).toBeVisible()
  const opened = await headsRead(page, '.conv-head h3')
  expect(opened.count).toBe(1)
  expect(opened.types).toEqual(['15px/20px 600'])
  await page.goto('/room.html?place=conversations&demo=1')
  await page.getByRole('button', { name: 'New conversation' }).click()
  await expect(page.locator('.conv-new > h3')).toBeVisible()
  const started = await headsRead(page, '.conv-new > h3')
  expect(started.count).toBe(1)
  expect(started.types).toEqual(['15px/20px 600'])
})
