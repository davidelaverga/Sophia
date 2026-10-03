/**
 * SMC-M03 M03-RF-0003: a bound research attempt never sends more output tokens than its route's ceiling (16000),
 * whoever raises the cap. A test-only native listener (`tests/support/output-cap`) rewrites every call's `maxTokens`,
 * placed before the bridge's route guard or after it; the real `openai-research` route runs against the local
 * Responses stub with a dummy key. A cap within the ceiling reaches the wire as set, which shows the listener works;
 * 128000 never reaches it in either placement, and the refusal is journaled on the attempt.
 */

import assert from 'node:assert/strict'
import { cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'
import { suite, unit } from '../support/harness.mjs'
import { researchRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

const PLUGIN = new URL('../support/output-cap', import.meta.url)
const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')
const ceiling = unit.model_routes['research-sol-medium-v1'].maxTokens

function world(maxTokens, prepend) {
  const row = `
- insert:
    - id: sophia-test-output-cap
      name: '@sophia-test/output-cap'
      config:
        maxTokens: ${maxTokens}
        prepend: ${prepend}
`
  const model = { start: startMockResponses, overlay: (baseURL) => researchRouteOverlay(bundlePatch, baseURL) + row, env: { OPENAI_RESEARCH_API_KEY: 'sk-sophia-route-ceiling-dummy' } }
  return suite(`sophia-route-ceiling-${maxTokens}-${prepend ? 'before' : 'after'}`, { model })
}

async function run(t, worldOf, maxTokens) {
  const w = await worldOf(t)
  cpSync(PLUGIN, join(w.layout.dshHome, 'profiles', unit.dsh.profile, 'node_modules', '@sophia-test', 'output-cap'), { recursive: true })
  await w.start()
  assert.match(w.stderr(), new RegExp(`\\[sophia-test-output-cap\\] armed: maxTokens ${maxTokens}`))
  w.llm.script({ text: 'Here is what I found.' })
  w.send(w.cmd('create', { text: 'Research it.', role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the turn end')
  return w
}

for (const prepend of [true, false]) {
  const placement = prepend ? 'before' : 'after'
  const within = world(8000, prepend)
  const over = world(128000, prepend)
  after(within.cleanup)
  after(over.cleanup)

  test(`a cap within the ceiling set ${placement} the guard reaches the wire as set`, async (t) => {
    const w = await run(t, within.world, 8000)
    assert.deepEqual(w.llm.requests.map((r) => r.body.max_output_tokens), [8000])
    assert.equal(w.turnEnds()[0].data.reason.kind, 'completed')
    assert.deepEqual(w.journal().filter((e) => e.type === 'sophia/route-refused'), [])
  })

  test(`128000 output tokens set ${placement} the guard never reach the wire; the call is refused and journaled`, async (t) => {
    const w = await run(t, over.world, 128000)
    assert.equal(w.llm.requests.length, 0, 'no request left the runtime')
    assert.notEqual(w.turnEnds()[0].data.reason.kind, 'completed')
    const refused = w.journal().filter((e) => e.type === 'sophia/route-refused')
    assert.ok(refused.length >= 1)
    assert.match(refused[0].data.reason, new RegExp(`allows at most ${ceiling} output tokens; a model call asking for 128000 is refused`))
  })
}
