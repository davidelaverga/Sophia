#!/usr/bin/env node
// OPERATOR PROBE (SDD-01 P1, WBC-02-CC-0010 §8): is the deployed API's byte store written once per key? Run it on the
// API service, at the deployed commit, with the service's own environment and nothing added:
//   node scripts/storage-write-once-probe.ts [--run <uuid>]
// With --run it is one-shot: its keys derive from the run id, so running it again under the same id writes nothing.
// On a service with no shell (a free web service), the operator runs it once from the start command, then the API:
//   sh -c 'node scripts/storage-write-once-probe.ts --run <uuid>; exec node apps/api/src/server.ts'
// and puts the start command back to `node apps/api/src/server.ts` once its lines are read (WBC-02-CC-0010 §8).
// It reads SOPHIA_API_DATABASE_URL and the five SOPHIA_STORAGE_* settings, composes the store as the API does, writes
// two labelled synthetic objects under 00000000-0000-4000-8000-000000000044/ (11 claims, at most 7 provider requests)
// and prints JSON lines: the first names the namespace it writes in (endpoint, region, bucket) and its keys; none names
// a credential or a signed URL. Exit 0: every guarantee held; 1: one did not;
// 2: a precondition is missing, nothing written; 3: an outcome is uncertain, stopped at once and never retried. It
// ends within 125 s whatever the database or the provider does, so the API's start follows it.
// What it checks and why: apps/api/src/storage-probe.ts.
import { runStorageProbe } from '../apps/api/src/storage-probe.ts'

// Nothing or exactly `--run <uuid>`: anything else (`--run=<uuid>` included) is refused, never read as no run id, which
// would write fresh keys at every start.
const args = process.argv.slice(2)
const runId = args.length === 2 && args[0] === '--run' ? args[1] : undefined
if (args.length > 0 && runId === undefined) {
  const reason = 'usage: storage-write-once-probe.ts [--run <uuid>]'
  console.log(JSON.stringify({ event: 'STORAGE_PROBE_DONE', ok: false, exit: 2, reason }))
  process.exit(2)
}
// Exit now, with the probe's code: a connection the database never answered must not keep the process, and the API's
// start after it, waiting.
process.exit(await runStorageProbe(process.env, runId === undefined ? {} : { runId }))
