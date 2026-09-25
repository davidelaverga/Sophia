// A LiveKit server for local development: a named Docker container on 127.0.0.1, kept between runs.
// The key below is a development-only constant, like Supabase's local defaults; it is never used
// outside this container, which accepts connections from this machine only.
import { spawnSync } from 'node:child_process'
import { sleepSync } from './postgres.ts'

export const LIVEKIT_IMAGE = 'livekit/livekit-server:v1.13.7'
export const DEV_LIVEKIT = {
  url: 'ws://127.0.0.1:7880',
  apiKey: 'devkey',
  apiSecret: 'dev-only-livekit-secret-for-this-machine',
} as const

const docker = (args: string[]) => spawnSync('docker', args, { encoding: 'utf8' })

function waitUntilReady(attempts = 30): boolean {
  for (let i = 0; i < attempts; i++) {
    const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:7880/'], {
      encoding: 'utf8',
    })
    if (r.stdout.trim() === '200') return true
    sleepSync(500)
  }
  return false
}

/** Starts (or reuses) `sophia-dev-livekit`: signalling on 7880, WebRTC on 7881/tcp and 7882/udp. */
export function namedLiveKit(name = 'sophia-dev-livekit'): typeof DEV_LIVEKIT {
  if (!docker(['ps', '-q', '--filter', `name=^${name}$`]).stdout.trim()) {
    docker(['rm', '-f', name])
    const started = docker([
      'run',
      '-d',
      '--name',
      name,
      '-p',
      '127.0.0.1:7880:7880',
      '-p',
      '127.0.0.1:7881:7881',
      '-p',
      '127.0.0.1:7882:7882/udp',
      '-e',
      `LIVEKIT_KEYS=${DEV_LIVEKIT.apiKey}: ${DEV_LIVEKIT.apiSecret}`,
      LIVEKIT_IMAGE,
      '--dev',
      '--bind',
      '0.0.0.0',
      '--node-ip',
      '127.0.0.1',
    ])
    if (started.status !== 0) throw new Error(`docker run ${LIVEKIT_IMAGE} failed: ${started.stderr}`)
  }
  if (!waitUntilReady()) throw new Error(`${name} did not become ready on :7880`)
  return DEV_LIVEKIT
}
