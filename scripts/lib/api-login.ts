// The API's database login: a LOGIN role granted sophia_api (never superuser, BYPASSRLS or the
// migration owner). Idempotent: creates the role once, (re)sets its password, (re)grants the group.
import { withClient } from './postgres.ts'

export const API_LOGIN = 'sophia_api_app'

export async function provisionApiLogin(ownerUrl: string, password: string): Promise<void> {
  await withClient(ownerUrl, async (c) => {
    await c.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${API_LOGIN}') THEN
        CREATE ROLE ${API_LOGIN} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      END IF; END $$`)
    // Role passwords cannot be bind parameters; escapeLiteral quotes the value safely.
    await c.query(`ALTER ROLE ${API_LOGIN} PASSWORD ${c.escapeLiteral(password)}`)
    await c.query(`GRANT sophia_api TO ${API_LOGIN}`)
  })
}

/** The same server as `ownerUrl`, logged in as the API role. `userSuffix` covers pooler user names. */
export function apiLoginUrl(ownerUrl: string, password: string, userSuffix = ''): string {
  const u = new URL(ownerUrl)
  u.username = `${API_LOGIN}${userSuffix}`
  u.password = password
  return u.toString()
}
