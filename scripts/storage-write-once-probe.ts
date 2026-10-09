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
// and prints JSON lines, never a setting, a credential or a signed URL. Exit 0: every guarantee held; 1: one did not;
// 2: a precondition is missing, nothing written; 3: an outcome is uncertain, stopped at once and never retried.
// What it checks and why: apps/api/src/storage-probe.ts.
import { runStorageProbe } from '../apps/api/src/storage-probe.ts'

const at = process.argv.indexOf('--run')
const runId = at === -1 ? undefined : (process.argv[at + 1] ?? '')
process.exitCode = await runStorageProbe(process.env, runId === undefined ? {} : { runId })
