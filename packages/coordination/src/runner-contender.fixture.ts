/**
 * A separate PROCESS contending for one owner gateway journal, for runner-journal-process.test.ts (r2, R1-F02). It is
 * a test fixture, not a test and not a transport: it uses only the FAKE T3 and prints exact counts as one JSON line.
 *   node runner-contender.fixture.ts <journal> <envelope-json-file> <mode>
 * mode `send`: open, send the envelope through its own FakeT3, close, report.
 * mode `send-and-crash`: open, send with the receipt lost after the native effect, then exit WITHOUT releasing the lock.
 * mode `hold`: open, report `ready`, then hold the lock until its stdin closes.
 * mode `silent`: open nothing and never report, until its stdin closes (proves the test's report bound).
 */
import { readFileSync } from 'node:fs'
import { FakeT3 } from './runner-fake-t3.ts'
import { RunnerGateway } from './runner-gateway.ts'
import { RunnerJournal } from './runner-journal.ts'
import { digestOf, type RunnerEnvelope } from './runner-port.ts'

const [journalFile = '', envelopeFile = '', mode = 'send'] = process.argv.slice(2)
if (mode === 'silent') {
  process.stdin.resume()
  await new Promise<void>((resolve) => process.stdin.on('end', resolve))
  process.exit(0)
}
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test writes this file from a typed RunnerEnvelope
const envelope = JSON.parse(readFileSync(envelopeFile, 'utf8')) as RunnerEnvelope
const report = (r: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ pid: process.pid, ...r })}\n`)

let journal: RunnerJournal
try {
  journal = new RunnerJournal(journalFile)
} catch (err) {
  report({ opened: false, error: err instanceof Error ? err.message : String(err), launches: 0, calls: 0 })
  process.exit(0)
}
const t3 = new FakeT3(`client:fake-session-${process.pid}`)
const gateway = new RunnerGateway({
  journal,
  transport: t3,
  profile: {
    ownerId: envelope.ownerId,
    environmentRef: envelope.environmentRef,
    adapterPin: envelope.adapterPin,
    nativeProjectRefs: new Set([envelope.nativeProjectRef]),
    accountKey: envelope.accountKey,
    profileId: envelope.profileId,
    profileRevision: envelope.profileRevision,
    operations: new Set(['create', 'input', 'stop'] as const),
  },
})

if (mode === 'hold') {
  report({ opened: true, ready: true, journalId: gateway.journalId })
  process.stdin.resume()
  process.stdin.on('end', () => {
    gateway.close()
    process.exit(0)
  })
} else {
  if (mode === 'send-and-crash') t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
  const answer = await gateway.send(envelope, digestOf(envelope), gateway.journalId)
  report({
    opened: true,
    journalId: gateway.journalId,
    answer: answer.kind,
    launches: t3.effects.launches,
    calls: t3.calls.length,
  })
  // A crash: the process ends holding its lock and with a possible send journaled but unanswered.
  if (mode === 'send-and-crash') process.exit(0)
  gateway.close()
}
