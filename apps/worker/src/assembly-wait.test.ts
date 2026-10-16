// The context wait the database gives a reply create (0071, conversation_context_wait) against what the worker can
// take to record ONE reply's context on an otherwise idle worker (ASSEMBLY_LIMITS): drifting either one breaks this.
// Arithmetic only, not a measured or whole-queue latency: a pass claims up to 10 rows and assembles them serially, so
// a contended reply can exceed it, and then fails context_unavailable when a pass next processes it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkedLimits } from '@sophia/persistence'
import { ASSEMBLY_LIMITS, WAITING_FOR_CONTEXT } from './runtime-dispatch.ts'

const migration = (name: string) => readFileSync(new URL(`../../../db/migrations/${name}`, import.meta.url), 'utf8')
const seconds = (text: string, pattern: RegExp): number => {
  const match = pattern.exec(text)
  assert.ok(match?.[1], `${String(pattern)} is in the migration`)
  return Number(match[1]) * 1000
}

test("one reply's uncontended worst case, three claims within their leases and the passes between them, fits the context wait", () => {
  const context = migration('0071_conversation_context_before_dispatch.sql')
  const waitMs = seconds(context, /conversation_context_wait\(\) RETURNS interval[\s\S]*?interval '(\d+) seconds'/)
  const deferMs = seconds(migration('0012_runtime_service.sql'), /available_at=now\(\)\+interval '(\d+) seconds'/)
  assert.match(migration('0064_conversation_runtime.sql'), /IF n>=3 THEN/, 'at most three claims per reply')
  assert.ok(context.includes(`'${WAITING_FOR_CONTEXT}'`), 'the worker reacts to the reason the database defers with')
  const idleMs = 2_000 // RuntimeDispatcher's default idle pass
  const pass = deferMs + idleMs
  const worst = idleMs + 3 * ASSEMBLY_LIMITS.leaseMs + 2 * pass + pass
  assert.equal(checkedLimits(ASSEMBLY_LIMITS), ASSEMBLY_LIMITS)
  assert.ok(worst <= waitMs, `the worst case ${worst} ms fits the ${waitMs} ms wait`)
  assert.ok(waitMs - worst < 30_000, 'and the wait is not an unbounded grace')
})
