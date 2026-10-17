import { defineConfig } from '@playwright/test'

// The attention flag on the app's fixture page (e2e-attention/): the Studio app built with VITE_SOPHIA_ATTENTION=1 and
// no vision flag on 5198, and with neither flag on 5199 (vite.attention.config.ts), its API answered in the page by
// fixtures/attention-data.ts. A page fixture, not the real API: playwright.served.config.ts is the normal App against
// the listening API, and each keeps its own specs. Run on its own (`playwright test -c playwright.attention.config.ts`).
const served = 'http://127.0.0.1:5198'

export default defineConfig({
  testDir: 'e2e-attention',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: served, browserName: 'chromium', trace: 'retain-on-failure', viewport: { width: 1280, height: 800 } },
  webServer: [
    {
      command: 'pnpm exec vite --config vite.attention.config.ts',
      url: `${served}/app.html`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'SOPHIA_ATTENTION_PAGE=off pnpm exec vite --config vite.attention.config.ts',
      url: 'http://127.0.0.1:5199/app.html',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
