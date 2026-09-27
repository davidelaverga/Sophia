#!/usr/bin/env node
// Create or rotate the API database login on any environment (local stack or hosted).
//   SOPHIA_MIGRATION_DATABASE_URL=<owner> SOPHIA_API_DB_PASSWORD=<new password> \
//     node scripts/provision-api-login.ts
// The operator supplies the password (from the secret store); nothing secret is printed.
import { API_LOGIN, provisionApiLogin } from './lib/api-login.ts'

const ownerUrl = process.env.SOPHIA_MIGRATION_DATABASE_URL?.trim()
const password = process.env.SOPHIA_API_DB_PASSWORD?.trim()
if (!ownerUrl || !password) {
  console.error('SOPHIA_MIGRATION_DATABASE_URL and SOPHIA_API_DB_PASSWORD are required.')
  process.exit(2)
}
if (password.length < 24) {
  console.error('SOPHIA_API_DB_PASSWORD must be at least 24 characters.')
  process.exit(2)
}
await provisionApiLogin(ownerUrl, password)
console.log(`✓ ${API_LOGIN} provisioned (member of sophia_api; no superuser, BYPASSRLS or owner rights)`)
