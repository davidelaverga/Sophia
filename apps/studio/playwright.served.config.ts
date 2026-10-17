import { defineConfig } from '@playwright/test'

// The served attention reads (e2e-served/): the Studio app built with VITE_SOPHIA_ATTENTION=1 and no vision flag on
// 5198, and with neither flag on 5199 (vite.served.config.ts). Run on its own (`playwright test -c
// playwright.served.config.ts`).
const served = 'http://127.0.0.1:5198'

export default defineConfig({
  testDir: 'e2e-served',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: served, browserName: 'chromium', trace: 'retain-on-failure', viewport: { width: 1280, height: 800 } },
  webServer: [
    {
      command: 'pnpm exec vite --config vite.served.config.ts',
      url: `${served}/app.html`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'SOPHIA_SERVED=off pnpm exec vite --config vite.served.config.ts',
      url: 'http://127.0.0.1:5199/app.html',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
