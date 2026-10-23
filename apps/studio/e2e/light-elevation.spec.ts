import { expect, test, type Page } from '@playwright/test'
import { READING } from '../fixtures/reading-data.ts'
import { colourOf, contrastOf } from './contrast.ts'
import { DRAWN, drawn } from './drawn.ts'

// On paper a raised panel rises (docs/plans/light-elevation.md; informe-25 X7): a sheet and the report pane are white
// over the page, under a veil of ink, as the room's plane stands over its void. The room is the control.

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

/** A ground's relative luminance, as WCAG counts it (via a black text's contrast against it). */
const ratio = (a: string, b: string) => contrastOf({ words: '', ink: a, opacity: 1, grounds: [b], size: 16 })

async function openSettings(page: Page, query: string) {
  await page.goto(`/room.html?people=2${query}`)
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Settings…' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
}

/** The sheet's ground, its top's, the veil's and the page's, as computed. */
const sheetGrounds = (page: Page) =>
  page.evaluate(() => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
    const bg = (sel: string) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).backgroundColor : ''
    }
    return {
      sheet: bg('.sheet'),
      top: bg('.sheet-top'),
      veil: bg('.sheet-backdrop'),
      body: getComputedStyle(document.body).backgroundColor,
    }
  })

test('elevation · on paper a sheet rises: white, under an ink veil, lighter than the page it covers', async ({
  page,
}) => {
  await openSettings(page, '&theme=light')
  const g = await sheetGrounds(page)
  expect([g.sheet, g.top, g.veil]).toEqual(['rgb(255, 255, 255)', 'rgb(255, 255, 255)', 'rgba(29, 27, 34, 0.18)'])
  const veil = colourOf(g.veil)
  const body = colourOf(g.body)
  const mix = (t: number, u: number) => Math.round(t * veil.a + u * (1 - veil.a))
  const veiled = `rgb(${String(mix(veil.r, body.r))}, ${String(mix(veil.g, body.g))}, ${String(mix(veil.b, body.b))})`
  expect(ratio(g.sheet, veiled)).toBeGreaterThanOrEqual(1.4)
  // A borderless box a raised panel holds (an update's text) stays a well on the white panel (a guard: 1.0 without it),
  // a step down as paper's well is a step under white (1.033:1; light-surfaces.md asks 1.02:1 of each of paper's steps).
  const well = await page
    .locator('.sheet-body')
    .first()
    .evaluate((holder) => {
      const pre = document.createElement('pre')
      pre.className = 'update-text'
      pre.textContent = 'x'
      holder.append(pre)
      return getComputedStyle(pre).backgroundColor
    })
  expect(ratio(well, g.sheet)).toBeGreaterThanOrEqual(1.02)
})

test('elevation · in the room a sheet keeps its plane, and the veil its half of the void', async ({ page }) => {
  await openSettings(page, '')
  const g = await sheetGrounds(page)
  expect([g.sheet, g.top, g.veil]).toEqual(['rgb(11, 10, 15)', 'rgb(11, 10, 15)', 'rgba(5, 4, 8, 0.5)'])
})

test('elevation · on paper the report pane stands above the page, and its table’s edges are the pane’s', async ({
  page,
}) => {
  await page.goto(`/room.html?report=${READING}&theme=light`)
  await expect(page.locator('.md')).toContainText('Recovery windows differ more than prices do')
  const read = await page.evaluate(() => {
    const pane = document.querySelector('.report-pane')
    const table = [...document.querySelectorAll('.md-table')].find((t) => t.textContent.includes('Restore granularity'))
    const cell = table?.querySelector('tbody td')
    const compare = document.createElement('section')
    compare.className = 'report-compare'
    document.querySelector('.report-pane-body')?.append(compare)
    const main = document.createElement('div')
    main.className = 'report-main'
    const fallback = document.createElement('div')
    fallback.className = 'md-table'
    main.append(fallback)
    document.body.append(main)
    return {
      pane: pane ? getComputedStyle(pane).backgroundColor : '',
      body: getComputedStyle(document.body).backgroundColor,
      covers: table ? getComputedStyle(table).backgroundImage : '',
      cell: cell ? getComputedStyle(cell).backgroundColor : '',
      compare: getComputedStyle(compare).backgroundColor,
      fallback: getComputedStyle(fallback).backgroundImage,
    }
  })
  expect(read.pane).toBe('rgb(255, 255, 255)')
  expect(ratio(read.pane, read.body)).toBeGreaterThan(1)
  expect(read.covers).toContain('rgb(255, 255, 255)')
  expect(read.covers).not.toContain('rgb(253, 251, 248)')
  expect(read.cell).toBe('rgb(255, 255, 255)')
  // Guards: the pane's comparison stays a well on it; a table on another ground keeps that ground's covers, the well.
  expect(ratio(read.compare, read.pane)).toBeGreaterThanOrEqual(1.02)
  expect(read.fallback).toContain('rgb(253, 251, 248)')
})

test('elevation · on paper a resource sheet’s head light ends in the sheet', async ({ page }) => {
  await page.goto('/resources.html?theme=light')
  await drawn(page, DRAWN.resources)
  await page.getByRole('button', { name: 'Davide · Claude Code', exact: true }).first().click()
  await expect(page.getByRole('dialog', { name: 'Davide · Claude Code' })).toBeVisible()
  const head = await page.locator('.resource-sheet .sheet-top').evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(head.endsWith('rgb(255, 255, 255))'), head).toBe(true)
})
