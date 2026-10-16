import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PAGE_CSS } from '@sophia/report'

// The Document tab reads as the HTML page does (html-report-v2; report-page-windows.md): the same serif faces in the
// same order, or a report sets other lines in the Studio than in its download (Codex P2 on #400).
const faces = (stack: string) => stack.split(',').map((face) => face.trim().replace(/^['"]|['"]$/g, ''))
const declared = (css: string, name: string) => new RegExp(`${name}:([^;]+);`).exec(css)?.[1] ?? ''

test('the Studio reads a report in the faces its HTML page sets, in the same order', () => {
  const studio = readFileSync(new URL('./artifacts.css', import.meta.url), 'utf8')
  const page = faces(declared(PAGE_CSS, '--font-text'))
  assert.ok(page.length > 2, 'the page names its faces')
  assert.deepEqual(faces(declared(studio, '--serif')), page)
})
