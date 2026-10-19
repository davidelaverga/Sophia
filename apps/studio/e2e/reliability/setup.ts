import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { RESULTS } from './measure.ts'

// Before the @reliability suite runs: last run's samples go, and the run says which commit it measured (read by
// scripts/reliability-report.mjs --fixture).
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

export default function setup() {
  rmSync(RESULTS, { recursive: true, force: true })
  mkdirSync(RESULTS, { recursive: true })
  const run = {
    startedAt: new Date().toISOString(),
    commit: git('rev-parse', '--short=9', 'HEAD'),
    branch: git('branch', '--show-current'),
  }
  writeFileSync(`${RESULTS}run.json`, `${JSON.stringify(run, null, 2)}\n`)
}
