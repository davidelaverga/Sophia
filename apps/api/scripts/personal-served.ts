#!/usr/bin/env node
// The local served Personal journey's API (playwright.served.config.ts with SOPHIA_SERVED_PERSONAL=1): the loopback model
// double first (tests/support/mock-responses.mjs, its URL known only once it listens), then one ephemeral payer enrolled
// for the served owner through the disposable database's OWNER connection, then the real API (src/server.ts) on its
// RESTRICTED role with the live companion pointed at the double and a fake key held in this process only. Local and
// synthetic: never a real provider, account or production database. Stops the API and the double together.
import { spawn } from 'node:child_process'
import pg from 'pg'
import { startMockResponses } from '../../../tests/support/mock-responses.mjs'
import { PERSONAL_ROLE_DIGEST } from '../src/companion-live.ts'

const KEY_REF = 'SOPHIA_SERVED_PERSONAL_ROUTE_KEY'
const FAKE_KEY = 'served-test-only-not-a-credential'
const PAYER = 'served-personal-payer'

const need = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`personal-served: ${name} is required`)
  return value
}
const owner = need('SOPHIA_SERVED_PERSONAL_OWNER').toLowerCase()
const apiDb = new URL(need('SOPHIA_API_DATABASE_URL'))
const ownerDb = new URL(need('SOPHIA_DISPOSABLE_DATABASE_URL'))
if (/sophia[-_]?(prod|legacy|pilot)/i.test(ownerDb.href)) throw new Error('personal-served: not a disposable database')
ownerDb.pathname = apiDb.pathname // the database dev-db made, as its owner

const double = await startMockResponses()
const client = new pg.Client({ connectionString: ownerDb.href })
await client.connect()
try {
  await client.query(
    `INSERT INTO sophia.personal_companion_payers(payer, owner_id, allowance_micros) VALUES ($1, $2, 1000000)
     ON CONFLICT (payer) DO UPDATE SET owner_id = EXCLUDED.owner_id`,
    [PAYER, owner],
  )
} finally {
  await client.end()
}

const settings = {
  routeId: 'personal-served',
  payer: PAYER,
  owner,
  roleDigest: PERSONAL_ROLE_DIGEST,
  call: { provider: 'openai-personal-served', model: 'gpt-6-luna', reasoningEffort: 'high', maxTokens: 512 },
  prices: { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 },
  profile: {
    displayName: 'Served double (personal)',
    apiKeyEnv: KEY_REF,
    api: 'openai-responses',
    baseURL: double.baseURL,
    defaultMaxTokens: 512,
    models: [
      {
        id: 'gpt-6-luna',
        name: 'GPT-6 Luna',
        contextWindow: 272000,
        maxTokens: 512,
        input: ['text'],
        reasoningEfforts: { low: 'low', medium: 'medium', high: 'high' },
        compat: { supportsStrictMode: false, supportsLongCacheRetention: false },
      },
    ],
  },
}

const api = spawn(process.execPath, [new URL('../src/server.ts', import.meta.url).pathname], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SOPHIA_DISPOSABLE_DATABASE_URL: '', // the API never gets the owner's connection
    SOPHIA_COMPANION: 'live',
    SOPHIA_PERSONAL_COMPANION: JSON.stringify(settings),
    [KEY_REF]: FAKE_KEY,
  },
})
const stop = () => {
  api.kill('SIGTERM')
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
api.on('exit', (code) => {
  console.log(`personal-served: API exited ${String(code)}; provider double requests ${String(double.requests.length)}`)
  void double.close().finally(() => process.exit(code ?? 0))
})
