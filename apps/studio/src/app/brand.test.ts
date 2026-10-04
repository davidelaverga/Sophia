import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const at = (path: string) => new URL(`../../${path}`, import.meta.url)
const read = (path: string) => readFileSync(at(path))
const text = (path: string) => readFileSync(at(path), 'utf8')

/** The mark's two shapes in a source: the paths that start at its cuts, x = 30 (you) and x = 33 (Sophia). */
const shapes = (source: string) => [...source.matchAll(/d="(M3[03][^"]*)"/g)].map((m) => m[1])

/** A PNG's width and height, from its IHDR chunk. */
const pngSize = (data: Buffer) => [data.readUInt32BE(16), data.readUInt32BE(20)]

describe('the brand’s assets (Umbral)', () => {
  it('every icon the page and the manifest name exists, at its declared size', () => {
    const html = text('index.html')
    for (const href of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/manifest.webmanifest']) {
      assert.ok(html.includes(`href="${href}"`), href)
      assert.ok(read(`public${href}`).length > 0, href)
    }
    assert.deepEqual(pngSize(read('public/apple-touch-icon.png')), [180, 180])
    const manifest: unknown = JSON.parse(text('public/manifest.webmanifest'))
    assert.ok(manifest && typeof manifest === 'object' && 'icons' in manifest && Array.isArray(manifest.icons))
    for (const icon of manifest.icons as { src: string; sizes: string; type: string }[]) {
      const data = read(`public${icon.src}`)
      if (icon.type === 'image/png') assert.deepEqual(pngSize(data), icon.sizes.split('x').map(Number), icon.src)
    }
    assert.deepEqual(pngSize(read('public/brand/og.png')), [1200, 630])
  })

  it('the favicon holds 16, 32 and 48', () => {
    const ico = read('public/favicon.ico')
    const count = ico.readUInt16LE(4)
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i))
    assert.deepEqual(sizes, [16, 32, 48])
  })

  it('the masters, the favicon and the app’s mark draw the same two shapes', () => {
    const mark = shapes(text('src/app/Mark.tsx'))
    assert.equal(mark.length, 2)
    for (const file of ['public/brand/umbral.svg', 'public/brand/umbral-paper.svg', 'public/favicon.svg']) {
      assert.deepEqual(shapes(text(file)), mark, file)
    }
  })
})
