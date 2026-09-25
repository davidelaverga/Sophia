/**
 * Launch the official dsh for a Sophia runtime and supervise it as a child
 * process. The execution-host supervisor (apps/execution-host) builds on the
 * same launch contract; tests use it directly.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DSH_ENTRY, sanitizedEnv } from './common.mjs'

/**
 * @param {{ unit: any, runtimeDir: string, layout: { dshHome: string, home: string, cwd: string, root: string },
 *   bridge?: { url: string, token: string }, workspace?: string, credentials?: string[],
 *   extraEnv?: Record<string, string>, overlays?: string[] }} options
 * @returns {{ child: import('node:child_process').ChildProcess, stderr: () => string, stop: (signal?: string) => Promise<{ code: number|null, signal: string|null }>, exited: Promise<{ code: number|null, signal: string|null }> }}
 */
export function launchRuntime({ unit, runtimeDir, layout, bridge, workspace, credentials = [], extraEnv = {}, overlays = [] }) {
  const env = {
    ...sanitizedEnv({ dshHome: layout.dshHome, home: layout.home, credentials }),
    SOPHIA_RUNTIME_UNIT: unit.id,
    SOPHIA_WORKSPACE: workspace ?? join(layout.root, 'workspace'),
    ...(bridge ? { SOPHIA_BRIDGE_URL: bridge.url, SOPHIA_BRIDGE_TOKEN: bridge.token } : {}),
    ...extraEnv,
  }
  mkdirSync(env.SOPHIA_WORKSPACE, { recursive: true })
  mkdirSync(layout.cwd, { recursive: true })
  const args = [join(runtimeDir, DSH_ENTRY), '--profile', unit.dsh.profile]
  overlays.forEach((text, index) => {
    const file = join(layout.root, `overlay-${index}.yml`)
    writeFileSync(file, text)
    args.push('--patch', file)
  })
  const child = spawn(process.execPath, args, { cwd: layout.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let err = ''
  child.stderr.on('data', (chunk) => { err += chunk })
  child.stdout.on('data', (chunk) => { err += chunk })
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))
  return {
    child,
    stderr: () => err,
    exited,
    stop: async (signal = 'SIGTERM') => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal)
      return exited
    },
  }
}
