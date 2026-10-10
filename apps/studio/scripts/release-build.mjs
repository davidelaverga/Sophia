#!/usr/bin/env node
/**
 * The Studio's release build (deploy/S1-05A-release.md; Codex r4233230048): at the checkout's own commit, verified,
 * from a clean dist, then checked. The page it built must name exactly that commit in `<meta name="sophia-build">`
 * (src/app/build-meta.ts); otherwise it exits 1 and nothing is ready to upload.
 *
 *   pnpm --filter @sophia/studio build:release [-- --commit <sha>]        build, then check
 *   pnpm --filter @sophia/studio build:release -- --check [--commit <sha>]  check the dist already built
 *
 * The Production VITE_ values come from the environment, as for `vite build`. VITE_SOPHIA_COMMIT is set here; one already
 * set, or a --commit, must be the checkout's HEAD. A tree that differs from HEAD (tracked or untracked files) is refused.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { builtProblem, releaseCommit } from '../src/app/release-identity.ts'

const STUDIO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(STUDIO, 'dist')
const args = process.argv.slice(2).filter((arg) => arg !== '--')

/** @param {...string} rest git's arguments @returns {string} its output, trimmed */
const git = (...rest) => execFileSync('git', rest, { cwd: STUDIO, encoding: 'utf8' }).trim()

/** @param {string} name a flag @returns {string | undefined} the value after it */
function valueOf(name) {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}

try {
  const commit = releaseCommit({ head: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain').length > 0 }, [
    valueOf('--commit'),
    process.env.VITE_SOPHIA_COMMIT,
  ])
  if (!args.includes('--check')) {
    rmSync(DIST, { recursive: true, force: true })
    process.env.VITE_SOPHIA_COMMIT = commit
    const { build } = await import('vite')
    await build({ root: STUDIO, configFile: join(STUDIO, 'vite.config.ts'), mode: 'production' })
  }
  const problem = builtProblem(readFileSync(join(DIST, 'index.html'), 'utf8'), commit)
  if (problem) throw new Error(problem)
  console.log(`studio release build: dist/index.html names ${commit}`)
} catch (err) {
  console.error(`studio release build refused: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
}
