import { defineConfig } from '@playwright/test'

// The project's search and human tasks on the room's fixture page (e2e-search/): built with VITE_SOPHIA_SEARCH=1 and
// VITE_SOPHIA_TASKS=1 and no vision flag
// (vite.search.config.ts), so the Studio reads A38 through its served adapter and the generated parser, answered by the
// fixture's strict synthetic A38 pages. A page fixture, not the real API: playwright.served.config.ts is the normal App
// against the listening API, and each keeps its own specs. One server, on 5198; run on its own
// (`playwright test -c playwright.search.config.ts`).
const served = 'http://127.0.0.1:5198'

export default defineConfig({
  testDir: 'e2e-search',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: served, browserName: 'chromium', trace: 'retain-on-failure', viewport: { width: 1280, height: 800 } },
  webServer: {
    command: 'pnpm exec vite --config vite.search.config.ts',
    url: `${served}/room.html`,
    reuseExistingServer: !process.env.CI,
  },
})
