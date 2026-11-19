#!/usr/bin/env node
// `pnpm test:integration`: the integration suite, in one `node --test` run with the flags it has always had
// (one file at a time, 180 s per test) over `tests/integration/**/*.test.mjs`, plus whatever arguments the caller adds.
//
// PR519-CI-F2-OBSERVABILITY-001: when SOPHIA_INTEGRATION_TAP names an absolute `.tap` file in a directory that already
// exists (CI sets it under $RUNNER_TEMP), the same run also writes TAP to that file, test by test as Node reports it,
// next to the usual spec output on stdout (Node pairs reporters with destinations in order: docs/SOURCE_MAP.md §2t).
// Unset, nothing changes. Either way the run happens once, its exit code or terminating signal is this command's, and
// nothing is skipped, filtered, retried or forced to exit.
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FLAGS = ['--test', '--test-concurrency=1', '--test-timeout=180000']
export const GLOB = 'tests/integration/**/*.test.mjs'
export const REPORT_ENV = 'SOPHIA_INTEGRATION_TAP'

/** No flags without a report path; with one, spec to stdout as before and TAP to that file. */
export function reportFlags(path) {
  if (path === undefined || path === '') return []
  if (!isAbsolute(path) || !path.endsWith('.tap')) {
    throw new Error(`${REPORT_ENV} must be an absolute path ending in .tap, not ${JSON.stringify(path)}`)
  }
  if (!statSync(dirname(path), { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${REPORT_ENV}'s directory does not exist: ${dirname(path)}`)
  }
  return ['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=tap', `--test-reporter-destination=${path}`]
}

/** The `node` arguments: the suite's own flags, the optional report, the glob, then the caller's arguments as given. */
export function integrationArgs(extra = [], report = undefined) {
  return [...FLAGS, ...reportFlags(report), GLOB, ...extra]
}

const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP']

/**
 * Run `execPath` once with `args`, forwarding SIGINT, SIGTERM and SIGHUP to it while it runs. Resolves with its own exit
 * code or terminating signal; rejects when it could not be started at all.
 */
export function runNode(args, { execPath = process.execPath, env = process.env, stdio = 'inherit' } = {}) {
  return new Promise((done, fail) => {
    const child = spawn(execPath, args, { env, stdio })
    const forward = (signal) => child.kill(signal)
    for (const signal of FORWARDED) process.on(signal, forward)
    let settled = false
    const settle = (finish) => {
      if (settled) return
      settled = true
      for (const signal of FORWARDED) process.off(signal, forward)
      finish()
    }
    child.once('error', (error) => settle(() => fail(error)))
    child.once('exit', (code, signal) => settle(() => done({ code, signal })))
  })
}

async function main() {
  let args
  try {
    args = integrationArgs(process.argv.slice(2), process.env[REPORT_ENV])
  } catch (error) {
    console.error(`test:integration: ${error.message}`)
    process.exit(2)
  }
  let outcome
  try {
    outcome = await runNode(args)
  } catch (error) {
    console.error(`test:integration: could not start ${process.execPath}: ${error.message}`)
    process.exit(1)
  }
  // A child ended by a signal ends this process by the same signal (the forwarding handlers are gone by now).
  if (outcome.signal) process.kill(process.pid, outcome.signal)
  else process.exitCode = outcome.code ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
