import { readFileSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// The narrow served path (FND-B-C1-SERVED-PATH-01), never the fixture pages: the normal Studio dev server (vite.config.ts,
// no VITE_SOPHIA_VISION) with saved conversations on (VITE_SOPHIA_CONVERSATIONS=1), Home's needs and Updates on
// (VITE_SOPHIA_ATTENTION=1, A15/A34) and the room's message acts and mentions on (VITE_SOPHIA_MESSAGE_ACTS=1,
// VITE_SOPHIA_MENTIONS=1, A36/A37), calling the real API on its restricted role (apps/api/src/server.ts,
// SOPHIA_CONVERSATIONS=on, no companion) over a local PostgreSQL. playwright.attention.config.ts is the page fixture.
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
// SOPHIA_SERVED_PERSONAL=1: the Personal journey (e2e-served/personal-served.spec.ts). The API starts through
// apps/api/scripts/personal-served.ts: the loopback model double, one ephemeral payer for Luis through the disposable
// database's owner connection (SOPHIA_DISPOSABLE_DATABASE_URL), then the real API on its restricted role, live.
const personal = process.env.SOPHIA_SERVED_PERSONAL === '1'
const subjectOf = (token: string): string => {
  const payload: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
  return payload && typeof payload === 'object' && 'sub' in payload ? String(payload.sub) : ''
}
const luis = served.identities.find((i) => i.name === 'Luis')

export default defineConfig({
  testDir: './e2e-served',
  // The Personal journey runs alone (it needs its own launcher); every other served spec runs as before, without it.
  ...(personal ? { testMatch: 'personal-served.spec.ts' } : { testIgnore: 'personal-served.spec.ts' }),
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5198',
    viewport: { width: 1440, height: 900 },
    // SOPHIA_SERVED_GL=swiftshader: Chromium's software GL (ANGLE on SwiftShader) for the page's WebGL, for comparing
    // with the default headless backend; the product's light and its canvas stay as they are.
    ...(process.env.SOPHIA_SERVED_GL === 'swiftshader' ? { launchOptions: { args: ['--use-angle=swiftshader'] } } : {}),
    // SOPHIA_SERVED_BROWSER=chromium: Playwright's full Chromium build (its new headless mode) instead of
    // chrome-headless-shell, the pinned revision's other build (playwright-core browsers.json, chromium 1243).
    ...(process.env.SOPHIA_SERVED_BROWSER === 'chromium' ? { channel: 'chromium' } : {}),
  },
  webServer: [
    {
      command: personal ? 'node ../api/scripts/personal-served.ts' : 'node ../api/src/server.ts',
      url: 'http://127.0.0.1:5199/health',
      reuseExistingServer: false,
      env: {
        ...served.api,
        HOST: '127.0.0.1',
        PORT: '5199',
        SOPHIA_CONVERSATIONS: 'on',
        ...(personal
          ? {
              SOPHIA_SERVED_PERSONAL_OWNER: subjectOf(luis?.token ?? ''),
              // The journey's answers: the first question answered, the second refused once (a provider 503), then "ok".
              SOPHIA_SERVED_PERSONAL_SCRIPT: JSON.stringify([{ text: 'ok' }, { status: 503 }]),
              SOPHIA_DISPOSABLE_DATABASE_URL: process.env.SOPHIA_DISPOSABLE_DATABASE_URL ?? '',
            }
          : {}),
      },
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
        VITE_DEV_PROJECT_ID: served.project.projectId,
        VITE_DEV_IDENTITIES: JSON.stringify(served.identities),
      },
    },
  ],
})
