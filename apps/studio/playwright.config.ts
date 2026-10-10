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
  webServer: [
    {
      command: 'pnpm exec vite --config vite.fixtures.config.ts',
      url: `${fixtures}/room.html`,
      reuseExistingServer: !process.env.CI,
    },
    // The Studio app itself, signed in by a synthetic Auth service, its modules served one by one (vite.app.config.ts,
    // e2e/signed-in-later.spec.ts).
    {
      command: 'pnpm exec vite --config vite.app.config.ts',
      url: 'http://127.0.0.1:5198/app.html',
      reuseExistingServer: !process.env.CI,
    },
    // The same page built, React's development build (vite.app-build.config.ts, e2e/app-auth.spec.ts): each check's
    // fresh context loads 13 files, not every module.
    {
      command:
        'pnpm exec vite build --config vite.app-build.config.ts && pnpm exec vite preview --config vite.app-build.config.ts',
      url: 'http://127.0.0.1:5197/app.html',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
