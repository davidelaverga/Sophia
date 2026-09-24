// Local dev stack data (synthetic, never live evidence): a fresh database on the server at
// SOPHIA_DISPOSABLE_DATABASE_URL with migrations, a sophia_api login, one project with two
// members and an outsider, plus short-lived HS256 dev tokens.
//   SOPHIA_DISPOSABLE_DATABASE_URL=postgres://... node apps/api/scripts/dev-db.ts [--json]
import { randomBytes, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { createTestDatabase, seedProject } from '@sophia/test-support'

const issuer = 'http://localhost/dev-auth'
const secret = randomBytes(32).toString('hex')
const founders = { luis: randomUUID(), davide: randomUUID(), outsider: randomUUID() }

const db = await createTestDatabase(
  new URL('../../../db/migrations', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
)
const seed = await seedProject(db.ownerUrl, {
  title: 'Sophia founder project (dev)',
  admin: founders.luis,
  editors: [founders.davide],
})

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(new TextEncoder().encode(secret))

const out = {
  api: { SOPHIA_API_DATABASE_URL: db.apiUrl, SUPABASE_JWT_ISSUER: issuer, SUPABASE_JWT_SECRET: secret },
  project: seed,
  identities: [
    { name: 'Luis', role: 'admin', token: await token(founders.luis) },
    { name: 'Davide', role: 'editor', token: await token(founders.davide) },
    { name: 'Outsider', role: 'none', token: await token(founders.outsider) },
  ],
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out))
} else {
  console.log(`# API environment (dev only)
${Object.entries(out.api)
  .map(([k, v]) => `${k}=${v}`)
  .join('\n')}

# Project ${seed.projectId}, goal ${seed.goalId}, source ${seed.sourceId}
${out.identities.map((i) => `TOKEN_${i.name.toUpperCase()}=${i.token}`).join('\n')}`)
}
