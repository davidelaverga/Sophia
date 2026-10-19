import { defineConfig } from '@playwright/test'
import base from './playwright.config.ts'

// The @reliability suite (e2e/reliability/, docs/plans/reliability-measure.md): scenarios that measure how the Studio
// meets failed and slow answers, for scripts/reliability-report.mjs --fixture. Kept out of the room's checks
// (playwright.config.ts ignores the folder), so CI's room job never runs it. The same two fixture servers; one desktop
// project. Run on its own: `playwright test -c playwright.reliability.config.ts --workers=2`.
export default defineConfig({
  ...base,
  testDir: 'e2e/reliability',
  testIgnore: [],
  grep: /@reliability/,
  globalSetup: './e2e/reliability/setup.ts',
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }],
})
