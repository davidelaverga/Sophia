import { defineConfig } from '@playwright/test'

// The served search (e2e-served/): the room's fixture page built with VITE_SOPHIA_SEARCH=1 and no vision flag
// (vite.served.config.ts), so the Studio reads A38 through its served adapter and the generated parser. One server, on
// the app check's port; run on its own (`playwright test -c playwright.served.config.ts`).
const served = 'http://127.0.0.1:5198'

export default defineConfig({
  testDir: 'e2e-served',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: served, browserName: 'chromium', trace: 'retain-on-failure', viewport: { width: 1280, height: 800 } },
  webServer: {
    command: 'pnpm exec vite --config vite.served.config.ts',
    url: `${served}/room.html`,
    reuseExistingServer: !process.env.CI,
  },
})
