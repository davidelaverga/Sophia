import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Motion that does nothing (docs/plans/small-fixes.md; informe-25 M14): an animation naming keyframes that no sheet
// declares runs nothing, and a transition over a gradient only jumps, unless what moves is a registered property.

const sheetsIn = (dir: URL) =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(new URL(f.replaceAll('\\', '/'), dir), 'utf8'))
const css = [...sheetsIn(new URL('../', import.meta.url)), ...sheetsIn(new URL('../../public/', import.meta.url))]
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const KEYWORDS = new Set([
  'none',
  'linear',
  'infinite',
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
  'forwards',
  'backwards',
  'both',
  'running',
  'paused',
  'initial',
  'inherit',
  'unset',
])
const isKeyword = (word: string) => KEYWORDS.has(word) || /^(ease|step|cubic-bezier|var)/.test(word)

describe('motion that moves', () => {
  it('every animation names keyframes a sheet declares', () => {
    const declared = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] ?? ''))
    const named = [...css.matchAll(/\banimation(?:-name)?\s*:\s*([^;}]+)/g)].flatMap((m) =>
      (m[1] ?? '').split(/[\s,]+/).filter((w) => /^-?[a-z_][\w-]*$/i.test(w) && !isKeyword(w)),
    )
    assert.deepEqual([...new Set(named.filter((n) => !declared.has(n)))], [])
  })

  it('a transition reaches a gradient only through a registered property', () => {
    const chunks = css.split('}')
    const overGradient = chunks.filter(
      (c) =>
        c.includes('gradient(') && /\btransition(?:-property)?\s*:[^;]*\b(background(?:-image)?|all)(?![\w-])/.test(c),
    )
    assert.deepEqual(overGradient, [])
    const registered = new Set([...css.matchAll(/@property\s+(--[\w-]+)/g)].map((m) => m[1] ?? ''))
    const moved = [...css.matchAll(/\btransition(?:-property)?\s*:\s*([^;}]+)/g)].flatMap((m) =>
      [...(m[1] ?? '').replace(/var\([^)]*\)/g, '').matchAll(/--[\w-]+/g)].map((v) => v[0]),
    )
    assert.deepEqual(
      moved.filter((p) => !registered.has(p)),
      [],
    )
  })

  it('the live ring’s share is a registered number, eased on its ring within a tick', () => {
    assert.match(css, /@property --fresh\s*\{[^}]*syntax:\s*'<number>'/)
    assert.match(css, /\.live-ring\[data-live\]::before\s*\{[^}]*transition:\s*--fresh var\(--base\)/)
  })
})
