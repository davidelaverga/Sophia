// The media bridge's LiveKit adapter and the worker's room removal against the pinned LiveKit server image
// (S1-05A checkpoints C and D): a local container with development-only keys, real rtc-node participants, no
// Google. `pnpm test:livekit`.
import { spawnSync } from 'node:child_process'
import { namedLiveKit } from './lib/livekit.ts'

const TESTS = ['apps/media-bridge/src/rtc.livekit.test.ts', 'apps/worker/src/room-removals.livekit.test.ts']

const livekit = namedLiveKit()
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=120000', ...TESTS], {
  stdio: 'inherit',
  env: {
    ...process.env,
    // rtc-node logs at debug level unless NODE_ENV is production.
    NODE_ENV: 'production',
    SOPHIA_TEST_LIVEKIT_URL: livekit.url,
    SOPHIA_TEST_LIVEKIT_KEY: livekit.apiKey,
    SOPHIA_TEST_LIVEKIT_SECRET: livekit.apiSecret,
  },
})
process.exit(run.status ?? 1)
