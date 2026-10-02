import { defineConfig } from '@playwright/test'

// The room's preservation checks (e2e/, LFE-00's BASE cases) in Chromium, against the fixture page (fixtures/room.html):
// the real Studio components over labelled fixture data, with no API and no call. `@phone` checks run at 390×844 on a
// touch screen; the others on a desktop.
const fixtures = 'http://127.0.0.1:5199'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: fixtures, browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', grepInvert: /@phone/, use: { viewport: { width: 1280, height: 800 } } },
    {
      name: 'phone',
      grep: /@phone/,
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    },
  ],
  webServer: {
    command: 'pnpm exec vite --config vite.fixtures.config.ts',
    url: `${fixtures}/room.html`,
    reuseExistingServer: !process.env.CI,
  },
})
