#!/usr/bin/env node
/**
 * Check out the pinned dsh source OUTSIDE the product tree, verify its
 * identity, and (with --verify-release) check that the npm release inside
 * the runtime artifact ships the same static files as that source.
 *
 *   pnpm dsh:source [--dir <path>] [--offline] [--verify-release] [--evidence <file>]
 *
 * Default dir: $SOPHIA_DSH_SRC, else <repo>/../.dsh-upstream/deepseek-harness.
 * The checkout stays read-only except for local build output; its source is
 * never copied into this repository (02_DSH_BOOTSTRAP §2).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { REPO_ROOT, RUNTIME_DIR, loadRuntimeUnit, run, runChecked, writeJson } from './lib/common.mjs'

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    offline: { type: 'boolean', default: false },
    'verify-release': { type: 'boolean', default: false },
    evidence: { type: 'string' },
  },
})

const unit = loadRuntimeUnit()
const { repository, commit, tag, package_version: version } = unit.dsh
const dir = resolve(
  values.dir ?? process.env.SOPHIA_DSH_SRC ?? join(REPO_ROOT, '..', '.dsh-upstream', 'deepseek-harness'),
)
if (!relative(REPO_ROOT, dir).startsWith('..')) {
  console.error(`refusing ${dir}: the dsh checkout must live outside the product tree ${REPO_ROOT}`)
  process.exit(1)
}

const git = (...args) => runChecked('git', ['-C', dir, ...args]).trim()
const report = { repository, commit, tag, package_version: version, checkout: '<outside product tree>', checks: [] }
const check = (id, ok, detail) => {
  report.checks.push({ id, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}: ${detail}`)
}

if (!existsSync(join(dir, '.git'))) {
  if (values.offline) {
    console.error(`no checkout at ${dir} and --offline given`)
    process.exit(1)
  }
  mkdirSync(dir, { recursive: true })
  git('init', '-q')
  git('remote', 'add', 'origin', `https://github.com/${repository}`)
  git('fetch', '-q', '--depth', '1', 'origin', commit)
  git('checkout', '-q', '--detach', 'FETCH_HEAD')
  console.log(`checked out ${repository}@${commit} at ${dir}`)
}

const head = git('rev-parse', 'HEAD')
check('head_is_pin', head === commit, head)
const dirty = run('git', ['-C', dir, 'status', '--porcelain', '--untracked-files=no']).stdout.trim()
check('tracked_files_unmodified', dirty === '', dirty === '' ? 'clean' : dirty.split('\n').slice(0, 5).join('; '))

const rootPkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
check('root_version', rootPkg.version === version, `${rootPkg.name}@${rootPkg.version}`)
check('package_manager', rootPkg.packageManager === `pnpm@${unit.toolchain.pnpm}`, rootPkg.packageManager)
check('node_engine_admits_24', /(>=\s*24|\^24)/.test(rootPkg.engines?.node ?? ''), rootPkg.engines?.node)

if (!values.offline) {
  const remote = run('git', ['ls-remote', `https://github.com/${repository}`, `refs/tags/${tag}`])
  const tagged = remote.stdout.split(/\s+/)[0] ?? ''
  check('tag_points_at_pin', tagged === commit, `${tag} -> ${tagged || remote.stderr.trim() || 'unresolved'}`)
}

if (values['verify-release']) {
  const store = join(RUNTIME_DIR, 'node_modules', '.pnpm')
  if (!existsSync(store)) {
    console.error(`no runtime artifact at ${RUNTIME_DIR}; run \`pnpm artifacts\``)
    process.exit(1)
  }
  const tracked = new Set(git('ls-files').split('\n'))
  let packages = 0,
    identical = 0
  const differing = []
  for (const entry of readdirSync(store)) {
    if (!entry.startsWith('@deepseek-ai+')) continue
    const scope = join(store, entry, 'node_modules', '@deepseek-ai')
    const name = entry.slice('@deepseek-ai+'.length).split('@')[0]
    const installed = join(scope, name)
    if (!existsSync(join(installed, 'package.json'))) continue
    const pkg = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
    const sourceDir = pkg.repository?.directory
    if (pkg.version !== version || !sourceDir || !existsSync(join(dir, sourceDir, 'package.json'))) continue
    const sourcePkg = JSON.parse(readFileSync(join(dir, sourceDir, 'package.json'), 'utf8'))
    if (sourcePkg.name !== pkg.name || sourcePkg.version !== pkg.version) {
      differing.push(`${pkg.name}: source manifest is ${sourcePkg.name}@${sourcePkg.version}`)
      continue
    }
    packages += 1
    const walk = (rel) => {
      for (const child of readdirSync(join(installed, rel), { withFileTypes: true })) {
        const path = rel ? `${rel}/${child.name}` : child.name
        if (child.isDirectory()) {
          if (child.name !== 'node_modules') walk(path)
          continue
        }
        if (path === 'package.json' || !tracked.has(`${sourceDir}/${path}`)) continue
        const same = readFileSync(join(installed, path)).equals(readFileSync(join(dir, sourceDir, path)))
        if (same) identical += 1
        else differing.push(`${pkg.name}/${path}`)
      }
    }
    walk('')
  }
  check(
    'release_matches_source',
    packages > 0 && differing.length === 0,
    `${packages} @deepseek-ai package entries at ${version}; ${identical} shipped files byte-identical to the pin; ${differing.length} differing${differing.length ? `: ${differing.slice(0, 10).join(', ')}` : ''}`,
  )
  report.release = { packages, identical_files: identical, differing }
}

if (values.evidence) {
  mkdirSync(dirname(resolve(values.evidence)), { recursive: true })
  writeJson(resolve(values.evidence), report)
}
process.exit(report.checks.every((c) => c.ok) ? 0 : 1)
