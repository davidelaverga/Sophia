// The media bridge's LiveKit adapter against the pinned LiveKit server image (S1-05A Checkpoint C): a local
// container with development-only keys, real rtc-node participants, no Google. `pnpm test:livekit`.
import { spawnSync } from 'node:child_process'
import { namedLiveKit } from './lib/livekit.ts'

const livekit = namedLiveKit()
const run = spawnSync(
  process.execPath,
  ['--test', '--test-timeout=120000', 'apps/media-bridge/src/rtc.livekit.test.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      // rtc-node logs at debug level unless NODE_ENV is production.
      NODE_ENV: 'production',
      SOPHIA_TEST_LIVEKIT_URL: livekit.url,
      SOPHIA_TEST_LIVEKIT_KEY: livekit.apiKey,
      SOPHIA_TEST_LIVEKIT_SECRET: livekit.apiSecret,
    },
  },
)
process.exit(run.status ?? 1)
