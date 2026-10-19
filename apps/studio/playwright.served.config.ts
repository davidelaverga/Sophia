import { readFileSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// The narrow served path (FND-B-C1-SERVED-PATH-01), never the fixture pages: the normal Studio dev server (vite.config.ts,
// no VITE_SOPHIA_VISION) with saved conversations on (VITE_SOPHIA_CONVERSATIONS=1), Home's needs and Updates on
// (VITE_SOPHIA_ATTENTION=1, A15/A34), the room's message acts and mentions on (VITE_SOPHIA_MESSAGE_ACTS=1,
// VITE_SOPHIA_MENTIONS=1, A36/A37) and the project's search on (VITE_SOPHIA_SEARCH=1, A38), calling the real API on its
// restricted role (apps/api/src/server.ts, SOPHIA_CONVERSATIONS=on, no companion) over a local PostgreSQL.
// playwright.attention.config.ts and playwright.search.config.ts are page fixtures, never counted as the real API.
// The data is synthetic: SOPHIA_SERVED_ENV names the JSON that apps/api/scripts/dev-db.ts --json printed (its api env,
// project and HS256 dev identities). That project's conversation setting must be enabled first. Run by hand only:
//   SOPHIA_SERVED_ENV=<dev-db json> pnpm exec playwright test -c playwright.served.config.ts
interface Served {
  api: Record<string, string>
  project: { projectId: string }
  identities: { name: string; role: string; token: string }[]
}
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dev-db.ts's own output
const served = JSON.parse(readFileSync(process.env.SOPHIA_SERVED_ENV ?? '', 'utf8')) as Served
process.env.SOPHIA_SERVED_PROJECT = served.project.projectId
// SOPHIA_SERVED_TASKS=1: only the project's human tasks journeys (e2e-served/human-tasks-served.spec.ts, A39), on the
// same normal Vite with VITE_SOPHIA_TASKS=1 and still no VITE_SOPHIA_VISION; the other served specs leave it out. Their
// owner setup reads SOPHIA_DISPOSABLE_DATABASE_URL (loopback only), never the API's restricted role:
//   SOPHIA_SERVED_TASKS=1 SOPHIA_SERVED_ENV=<dev-db json> SOPHIA_DISPOSABLE_DATABASE_URL=<owned loopback PostgreSQL> \
//   SOPHIA_SERVED_BROWSER=chromium pnpm exec playwright test -c playwright.served.config.ts
// SOPHIA_SERVED_BROWSER=chromium: Playwright's full Chromium build (its new headless mode) instead of the default
// chrome-headless-shell.
const tasks = process.env.SOPHIA_SERVED_TASKS === '1'

export default defineConfig({
  testDir: './e2e-served',
  ...(tasks ? { testMatch: 'human-tasks-served.spec.ts' } : { testIgnore: 'human-tasks-served.spec.ts' }),
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5198',
    viewport: { width: 1440, height: 900 },
    ...(process.env.SOPHIA_SERVED_BROWSER === 'chromium' ? { channel: 'chromium' } : {}),
  },
  webServer: [
    {
      command: 'node ../api/src/server.ts',
      url: 'http://127.0.0.1:5199/health',
      reuseExistingServer: false,
      env: { ...served.api, HOST: '127.0.0.1', PORT: '5199', SOPHIA_CONVERSATIONS: 'on' },
    },
    {
      command: 'pnpm exec vite --port 5198 --strictPort',
      url: 'http://127.0.0.1:5198/',
      reuseExistingServer: false,
      env: {
        SOPHIA_API_ORIGIN: 'http://127.0.0.1:5199',
        VITE_SOPHIA_CONVERSATIONS: '1',
        VITE_SOPHIA_ATTENTION: '1',
        VITE_SOPHIA_MESSAGE_ACTS: '1',
        VITE_SOPHIA_MENTIONS: '1',
        VITE_SOPHIA_SEARCH: '1',
        ...(tasks ? { VITE_SOPHIA_TASKS: '1' } : {}),
        VITE_DEV_PROJECT_ID: served.project.projectId,
        VITE_DEV_IDENTITIES: JSON.stringify(served.identities),
      },
    },
  ],
})
