import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

// A rule that names a class nothing renders does nothing (informe-25 H3: `.resource-sheet-actions` outlived its markup,
// and the sheet's presses fell to a second line on a phone). Every sheet class resources.css names is one the resource
// sheet, its frame or the kit's sheet classes render.

const here = new URL('./', import.meta.url)
const css = readFileSync(new URL('resources.css', here), 'utf8')
const markup = [
  ...readdirSync(here)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => readFileSync(new URL(f, here), 'utf8')),
  readFileSync(new URL('../../../../../packages/ui/src/SheetFrame.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../../../../../packages/ui/src/sheet-class.ts', import.meta.url), 'utf8'),
].join('\n')

test('every sheet class resources.css names is one the resource sheet or its frame renders', () => {
  const named = new Set([...css.matchAll(/\.(resource-sheet[\w-]*|sheet-[\w-]+)/g)].map((m) => m[1] ?? ''))
  const rendered = (cls: string) => new RegExp(`(^|[\\s"'\`])${cls}($|[\\s"'\`])`, 'm').test(markup)
  assert.deepEqual(
    [...named].filter((cls) => !rendered(cls)),
    [],
  )
})
