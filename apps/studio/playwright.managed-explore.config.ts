import { defineConfig } from '@playwright/test'
import { PROJECT } from './fixtures/data.ts'
import { tipSeenAt } from './e2e/tip-seen.ts'

const studio = 'http://127.0.0.1:5276'
const off = 'http://127.0.0.1:5278'
const env = {
  VITE_DEV_PROJECT_ID: PROJECT,
  VITE_DEV_IDENTITIES: JSON.stringify([
    { name: 'Founder', role: 'admin', token: 'synthetic-founder' },
    { name: 'Source reviewer', role: 'member', token: 'synthetic-source-reviewer' },
    { name: 'Deployment verifier', role: 'member', token: 'synthetic-deployment-verifier' },
  ]),
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_PUBLISHABLE_KEY: '',
  VITE_SOPHIA_PREVIEW_ORIGIN: 'http://localhost:5277',
}

export default defineConfig({
  testDir: './e2e-managed-explore',
  workers: 1,
  use: { baseURL: studio, browserName: 'chromium', storageState: tipSeenAt(studio, off) },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    { command: 'pnpm exec vite --port 5276', url: studio, env: { ...env, VITE_SOPHIA_MANAGED_EXPLORE: '1' } },
    { command: 'pnpm exec vite --port 5278', url: off, env: { ...env, VITE_SOPHIA_MANAGED_EXPLORE: '' } },
    { command: 'node e2e-managed-explore/preview.ts', url: 'http://localhost:5277/health' },
  ],
})
