import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The browser checks wait on what they need (a web-first assertion, expect.poll, a settled state, page.clock), not on a
// fixed number of milliseconds: a fixed wait is slow on a fast runner and flaky on a slow one. A fixed wait stays only
// where the check is that something does NOT happen within a time, and then the line just above it says why:
// `// Fixed wait kept: <why>`. Every other `waitForTimeout(` in apps/studio/e2e fails this fence.

const e2e = new URL('../../e2e/', import.meta.url)
const KEPT = /^\s*\/\/ Fixed wait kept: \S/
const ALLOWED = 0

/** Each `waitForTimeout(` in the e2e sources whose line above is not a `// Fixed wait kept:` comment, as file:line. */
function unexplained(): string[] {
  const files = readdirSync(e2e, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'))
  return files.flatMap((file) => {
    const lines = readFileSync(new URL(file.replaceAll('\\', '/'), e2e), 'utf8').split(/\r?\n/)
    return lines.flatMap((line, i) =>
      line.includes('waitForTimeout(') && !KEPT.test(lines[i - 1] ?? '') ? [`${file}:${i + 1}`] : [],
    )
  })
}

describe('e2e fixed waits', () => {
  it('reads the e2e sources', () => {
    assert.ok(readdirSync(e2e, { recursive: true, encoding: 'utf8' }).some((f) => f.endsWith('.spec.ts')))
  })

  it('has no fixed wait without a `// Fixed wait kept:` reason on the line above', () => {
    const found = unexplained()
    assert.ok(found.length <= ALLOWED, `${found.length} unexplained fixed waits:\n${found.join('\n')}`)
  })
})
