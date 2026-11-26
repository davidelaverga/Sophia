/**
 * The dev stack's runtime in a Linux container on Windows (docs/plans/dev-runtime-container.md): which platforms
 * use it, the copy manifest built from git's answers, the container's arguments and the credential names passed.
 *
 * What is shown: the pure parts of scripts/lib/runtime-container.ts. Docker, the copy itself and the runtime's start
 * are not run here; the real stack on a Windows host is the record for them.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  RUNTIME_CONTAINER,
  RUNTIME_IMAGE,
  RUNTIME_VOLUME,
  containerArgs,
  copyManifest,
  credentialNames,
  runsInContainer,
} from '../../scripts/lib/runtime-container.ts'

test('only Windows runs the runtime in a container', () => {
  assert.equal(runsInContainer('win32'), true)
  assert.equal(runsInContainer('linux'), false)
  assert.equal(runsInContainer('darwin'), false)
})

test('the manifest keeps the mode git records', () => {
  const staged = [
    '100644 1111111111111111111111111111111111111111 0\tpackage.json',
    '100755 2222222222222222222222222222222222222222 0\tscripts/run.sh',
    '120000 3333333333333333333333333333333333333333 0\tlink',
    '160000 4444444444444444444444444444444444444444 0\tvendor/sub',
    '',
  ].join('\0')
  const untracked = ['docs/new.md', 'package.json', ''].join('\0')
  assert.deepEqual(copyManifest(staged, untracked), [
    { path: 'package.json', mode: 0o644 },
    { path: 'scripts/run.sh', mode: 0o755 },
    { path: 'docs/new.md', mode: 0o644 },
  ])
})

test('the manifest keeps tabs and spaces in a path', () => {
  const staged = '100644 1111111111111111111111111111111111111111 0\tdocs/a b\tc.md\0'
  assert.deepEqual(copyManifest(staged, ''), [{ path: 'docs/a b\tc.md', mode: 0o644 }])
})

test('the arguments mount the checkout read-only and pass names, never values', () => {
  const secret = 'value-that-must-not-appear'
  const args = containerArgs({
    checkout: 'D:/repo',
    envNames: ['SOPHIA_RUNTIME_TOKEN', 'SOPHIA_PROJECT_ID'],
    command: ['node', '/src/scripts/runtime-container.mjs', '--rehearse'],
  })
  assert.equal(args[0], 'run')
  assert.ok(args.includes('--rm'))
  assert.ok(args.includes('--init'))
  assert.ok(args.includes('-i'))
  assert.deepEqual(args.slice(args.indexOf('--name'), args.indexOf('--name') + 2), ['--name', RUNTIME_CONTAINER])
  const volumes = args.flatMap((a, i) => (args[i - 1] === '-v' ? [a] : []))
  assert.deepEqual(volumes, ['D:/repo:/src:ro', `${RUNTIME_VOLUME}:/work`])
  const env = args.flatMap((a, i) => (args[i - 1] === '-e' ? [a] : []))
  assert.deepEqual(env, ['SOPHIA_RUNTIME_TOKEN', 'SOPHIA_PROJECT_ID', 'SOPHIA_SERVICE_URL'])
  assert.ok(env.every((name) => !name.includes('=')))
  assert.ok(!args.join(' ').includes(secret))
  const image = args.indexOf(RUNTIME_IMAGE)
  assert.ok(image > 0)
  assert.deepEqual(args.slice(image + 1), ['node', '/src/scripts/runtime-container.mjs', '--rehearse'])
})

test('the image is Node 24.21 pinned by digest', () => {
  assert.match(RUNTIME_IMAGE, /^node:24\.21\.0-bookworm-slim@sha256:[0-9a-f]{64}$/)
})

test("the credential names are the unit's routes and sources, once each", () => {
  const unit = {
    model_route: { credential_ref: 'DEEPSEEK_API_KEY' },
    model_routes: { a: { credential_ref: 'DEEPSEEK_API_KEY' }, b: { credential_ref: 'OTHER_KEY' } },
    research_sources: { web: { credential_ref: 'SEARCH_KEY' }, open: {}, none: null },
  }
  assert.deepEqual(credentialNames(unit), ['DEEPSEEK_API_KEY', 'OTHER_KEY', 'SEARCH_KEY'])
})
