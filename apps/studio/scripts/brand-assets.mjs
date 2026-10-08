#!/usr/bin/env node
/**
 * Renders Umbral's raster assets from its SVG masters (public/brand/*.svg), so no icon is exported by hand:
 *
 *   pnpm --filter @sophia/studio brand:assets
 *
 * - favicon.ico: 16, 32 and 48, PNG entries, from the app icon (its dark square reads on light and dark tab bars);
 * - apple-touch-icon.png (180) and icon-192.png / icon-512.png, from the app icon (full-bleed for Apple, which rounds);
 * - brand/og.png (1200 × 630): the lockup on the void, a halo behind it.
 * - brand/umbral-mark.png (96): the mark alone, transparent, for the invitation email (no SVG in mail clients).
 *
 * Chromium (Playwright's, already a dev dependency) draws each SVG at its exact size.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
/** @param {string} name a master in public/brand @returns {string} its SVG */
const master = (name) => readFileSync(join(PUBLIC, 'brand', name), 'utf8')

/**
 * One SVG drawn at `size` px square on a transparent ground, as PNG bytes.
 * @param {import('@playwright/test').Page} page
 * @param {string} svg
 * @param {number} size
 * @returns {Promise<Buffer>}
 */
async function png(page, svg, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}

/**
 * An ICO holding PNG entries, largest last: a header, one directory entry per image, then the images.
 * @param {{ size: number, data: Buffer }[]} images
 * @returns {Buffer}
 */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

/**
 * The social card: the lockup centred on the void, Sophia's halo behind it.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Buffer>}
 */
async function card(page) {
  await page.setViewportSize({ width: 1200, height: 630 })
  await page.setContent(`<style>
    html,body{margin:0;width:1200px;height:630px}
    body{display:grid;place-items:center;background:radial-gradient(ellipse at 50% 46%,rgba(156,130,245,.16),transparent 62%),#07060b}
    svg{display:block;height:120px;width:auto}
  </style>${master('umbral-lockup.svg')}`)
  return page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } })
}

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
const app = master('umbral-app.svg')
const fullBleed = app.replaceAll('rx="10.8"', 'rx="0"')

/** @type {{ size: number, data: Buffer }[]} */
const favicons = []
for (const size of [16, 32, 48]) favicons.push({ size, data: await png(page, app, size) })
writeFileSync(join(PUBLIC, 'favicon.ico'), ico(favicons))
writeFileSync(join(PUBLIC, 'apple-touch-icon.png'), await png(page, fullBleed, 180))
writeFileSync(join(PUBLIC, 'icon-192.png'), await png(page, app, 192))
writeFileSync(join(PUBLIC, 'icon-512.png'), await png(page, app, 512))
writeFileSync(join(PUBLIC, 'brand', 'og.png'), await card(page))
writeFileSync(join(PUBLIC, 'brand', 'umbral-mark.png'), await png(page, master('umbral.svg'), 96))
await browser.close()
console.log('brand assets written to', PUBLIC)
