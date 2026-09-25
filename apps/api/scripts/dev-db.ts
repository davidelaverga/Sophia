// Local dev stack data (synthetic, never live evidence): a fresh database on the server at
// SOPHIA_DISPOSABLE_DATABASE_URL with migrations, a sophia_api login, one project with two
// members and an outsider, an anonymous guest (as a Supabase anonymous sign-in would be), plus
// short-lived HS256 dev tokens and a fresh invitation-link secret.
//   SOPHIA_DISPOSABLE_DATABASE_URL=postgres://... node apps/api/scripts/dev-db.ts [--json]
import { randomBytes, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { createTestDatabase, seedProject } from '@sophia/test-support'

const issuer = 'http://localhost/dev-auth'
const secret = randomBytes(32).toString('hex')
const founders = { luis: randomUUID(), davide: randomUUID(), outsider: randomUUID(), guest: randomUUID() }

const db = await createTestDatabase(
  new URL('../../../db/migrations', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
)
const seed = await seedProject(db.ownerUrl, {
  title: 'Sophia founder project (dev)',
  admin: founders.luis,
  editors: [founders.davide],
})

// Synthetic accounts carry an email like Supabase tokens do; the API shows it as the display name.
// The guest carries no email and `is_anonymous`, like a Supabase anonymous sign-in.
const token = (sub: string, email: string | null) =>
  new SignJWT(email ? { role: 'authenticated', email } : { role: 'authenticated', is_anonymous: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(new TextEncoder().encode(secret))

const out = {
  api: {
    SOPHIA_API_DATABASE_URL: db.apiUrl,
    SUPABASE_JWT_ISSUER: issuer,
    SUPABASE_JWT_SECRET: secret,
    INVITE_TOKEN_SECRET: randomBytes(32).toString('hex'),
    STUDIO_URL: 'http://localhost:5173',
  },
  project: seed,
  identities: [
    { name: 'Luis', role: 'admin', token: await token(founders.luis, 'luis@sophia.test') },
    { name: 'Davide', role: 'editor', token: await token(founders.davide, 'davide@sophia.test') },
    { name: 'Outsider', role: 'none', token: await token(founders.outsider, 'outsider@sophia.test') },
    { name: 'Guest', role: 'guest', token: await token(founders.guest, null) },
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
