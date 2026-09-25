#!/usr/bin/env node
/**
 * LIVE acceptance check for S1-03: a real worker on the recorded model route
 * (config/runtime-unit.json#model_route) receives a mid-work steer, and the
 * evidence distinguishes delivery from incorporation.
 *
 *   OPENAI_API_KEY=... pnpm live:steer [--evidence <file>]
 *   pnpm live:steer --rehearse
 *
 * Needs the route's credential in the environment. It is passed to dsh by
 * reference only and never printed. The Sophia side is still the LABELLED
 * fixture service until S1-02. It makes real, billable model calls (two
 * short requests).
 *
 * `--rehearse` runs the same steps against the keyless mock model instead, so
 * the check itself is tested without a key. Its output says `live: false`, and
 * it refuses `--evidence`: a rehearsal is never live evidence.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { RUNTIME_DIR, loadRuntimeUnit, writeJson } from './lib/common.mjs'
import { assertRecordedArtifacts, homeLayout, installProfile } from './lib/profile.mjs'
import { launchRuntime } from './lib/runtime.mjs'
import { assertToolchain } from './lib/toolchain.mjs'
import { command, startFixtureService } from '../tests/support/fixture-service.mjs'
import { mockRouteOverlay, startMockLlm } from '../tests/support/mock-llm.mjs'

const { values } = parseArgs({ options: { evidence: { type: 'string' }, rehearse: { type: 'boolean', default: false } } })
if (values.rehearse && values.evidence) {
  console.error('live:steer --rehearse runs against the mock model and never writes evidence')
  process.exit(2)
}
assertToolchain()
const unit = loadRuntimeUnit()
const route = unit.model_route
if (!values.rehearse && !process.env[route.credential_ref]) {
  console.error(`live:steer needs ${route.credential_ref} in the environment (reference only; the value is never printed)`)
  process.exit(2)
}
assertRecordedArtifacts(unit, RUNTIME_DIR)
const root = mkdtempSync(join(tmpdir(), 'sophia-live-'))
const layout = homeLayout(join(root, 'install'))
installProfile({ unit, runtimeDir: RUNTIME_DIR, layout })
const service = await startFixtureService({ runtimeUnitId: unit.id })
const mock = values.rehearse ? await startMockLlm() : null
mock?.script({ text: 'fact', chunks: 40, delayMs: 100 }, { text: 'REDIRECTED' })
const runtime = mock
  ? launchRuntime({ unit, runtimeDir: RUNTIME_DIR, layout, bridge: service, overlays: [mockRouteOverlay(mock.baseURL)], extraEnv: { MOCK_LLM_KEY: 'mock' } })
  : launchRuntime({ unit, runtimeDir: RUNTIME_DIR, layout, bridge: service, credentials: [route.credential_ref] })
const cmd = (kind, opts = {}) => command(kind, { attemptId: 'live-1', runtimeUnitId: unit.id, ...opts })
const result = {
  live: !mock,
  route: mock ? { provider: 'mock', model: 'mock-model', note: 'rehearsal against the keyless mock; not live evidence' } : { provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort },
  startedAt: new Date().toISOString(),
}
let ok = false
try {
  await service.waitForReady(60000)
  const create = cmd('create', { role: 'sophia-research-v1', text: 'Write a numbered list of 40 distinct, one-line facts about the Moon. Do not use any tools.' })
  service.enqueue(create)
  await service.waitForReceipt(create.commandId, 'incorporation_observed', 60000)
  // Steer once the first step has started (its model request is in flight).
  await service.waitFor(() => service.observations.some((o) => o.type === 'step/start'), 60000, 'the first step')
  const steer = cmd('steer', { text: 'STEER-LIVE: stop the list now and reply with exactly the word REDIRECTED.' })
  service.enqueue(steer)
  const delivered = await service.waitForReceipt(steer.commandId, 'delivered', 60000)
  const incorporated = await service.waitForReceipt(steer.commandId, 'incorporation_observed', 300000)
  const turnEnd = await service.waitFor(() => service.observations.find((o) => o.type === 'turn/end' && o.nativeSeq > incorporated.nativeSequence), 300000, 'the turn that incorporated the steer')
  const replies = service.observations.filter((o) => o.type === 'assistant/message').map((o) => o.data?.text ?? '')
  // Mid-work: the steer was delivered before the first turn ended, not queued after it.
  const firstTurnEnd = service.observations.find((o) => o.type === 'turn/end')
  const midWork = firstTurnEnd.nativeSeq > delivered.nativeSequence
  Object.assign(result, {
    delivered: { nativeSequence: delivered.nativeSequence, observedAt: delivered.observedAt },
    incorporated: { nativeSequence: incorporated.nativeSequence, observedAt: incorporated.observedAt },
    midWork,
    turnEnd: turnEnd?.data ?? null,
    lastReply: replies.at(-1)?.slice(0, 200) ?? null,
  })
  ok = midWork && incorporated.nativeSequence > delivered.nativeSequence && turnEnd?.data?.reason?.kind === 'completed'
} catch (error) {
  result.error = error.message
} finally {
  await runtime.stop()
  await service.close()
  await mock?.close()
  rmSync(root, { recursive: true, force: true })
}
result.ok = ok
console.log(JSON.stringify(result, null, 2))
if (values.evidence) writeJson(resolve(values.evidence), result)
process.exit(ok ? 0 : 1)
