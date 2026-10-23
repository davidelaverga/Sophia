// The project human tasks journeys' synthetic setup on the real served path (human-tasks-served.spec.ts). Data comes from
// dev-db.ts's own output (SOPHIA_SERVED_ENV). The owner connection, which seeds a report and changes a membership,
// is read ONLY from SOPHIA_DISPOSABLE_DATABASE_URL, must be a loopback database, is never the API's restricted role
// and is never logged. Owned local test databases only: no production, .env or real account.
import { readFileSync } from 'node:fs'
import pg from 'pg'

interface Served {
  api: { SOPHIA_API_DATABASE_URL: string }
  project: { projectId: string }
  identities: { name: string; token: string }[]
}
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dev-db.ts's own output
export const served = JSON.parse(readFileSync(process.env.SOPHIA_SERVED_ENV ?? '', 'utf8')) as Served
export const PROJECT = served.project.projectId
export const API = 'http://127.0.0.1:5199'
export const RUN = Date.now().toString(36)
export const tokenOf = (name: string) => served.identities.find((i) => i.name === name)?.token ?? ''
export const subOf = (token: string): string => {
  const payload: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
  return payload && typeof payload === 'object' && 'sub' in payload ? String(payload.sub) : ''
}

/** The disposable database's owner, on the API's own database, refused unless it is on this machine. */
function ownerUrl(): string {
  const raw = process.env.SOPHIA_DISPOSABLE_DATABASE_URL
  if (!raw) throw new Error('SOPHIA_DISPOSABLE_DATABASE_URL (an owned loopback PostgreSQL) is required')
  const url = new URL(raw)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('owner setup only on a loopback database')
  url.pathname = new URL(served.api.SOPHIA_API_DATABASE_URL).pathname
  return url.toString()
}

export async function owner(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const client = new pg.Client({ connectionString: ownerUrl() })
  await client.connect()
  try {
    const result = await client.query<Record<string, unknown>>(sql, params)
    return result.rows
  } finally {
    await client.end()
  }
}

/** A Markdown report as its producer writes it (updates.db.test's made()), one per case: its id and stable version. */
export async function seedReport(word: string): Promise<{ artifactId: string; versionId: string }> {
  if (!/^[a-z0-9]+$/.test(word)) throw new Error('a synthetic word of letters and digits')
  const asker = subOf(tokenOf('Luis'))
  await owner(`DO $$
DECLARE p uuid := '${PROJECT}'; asker uuid := '${asker}'; g uuid; j uuid; a uuid; sid uuid; ssha text; v uuid;
BEGIN
 SELECT id INTO STRICT g FROM sophia.goals WHERE project_id=p ORDER BY created_at LIMIT 1;
 PERFORM set_config('sophia.actor_id', asker::text, true);
 INSERT INTO sophia.jobs(project_id,id,kind,state) VALUES(p,gen_random_uuid(),'research','succeeded') RETURNING id INTO j;
 PERFORM sophia.emit_project_event(p,'native_task.admitted','job',j,1,'native_task.research');
 INSERT INTO sophia.artifacts(project_id,title,format) VALUES(p,'Pond survey ${word}','markdown') RETURNING id INTO a;
 SELECT (s).id, (s).sha256 INTO sid, ssha FROM (SELECT sophia.put_text_source(p, asker, 'text/markdown',
   E'What the survey found.\\n\\n# Methods\\nWe walked the north bank at dawn.\\n\\n# Costs\\nThe first costs: boots and a net.\\n') AS s) x;
 INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,
   authority_epoch,state,version_number,job_id,change_facts,trigger)
  VALUES(p,a,NULL,sid,ssha,g,1,1,'stable',1,j,'{"cited":0,"added":[],"dropped":[]}'::jsonb,jsonb_build_object('kind','research','taskId',j)) RETURNING id INTO v;
 UPDATE sophia.artifacts SET stable_version_id=v WHERE id=a;
 PERFORM set_config('sophia.actor_id', '', true);
 PERFORM sophia.emit_project_event(p,'native_task.result_ready','job',j,3,'native_task.result_ready');
END $$;`)
  const rows = await owner(`SELECT id, stable_version_id FROM sophia.artifacts WHERE project_id = $1 AND title = $2`, [
    PROJECT,
    `Pond survey ${word}`,
  ])
  return { artifactId: String(rows[0]?.id), versionId: String(rows[0]?.stable_version_id) }
}

interface Member {
  active: boolean
  role: string
}

/** A member's standing in the project now. */
export async function memberOf(actor: string): Promise<Member> {
  const rows = await owner(`SELECT active, role FROM sophia.project_members WHERE project_id = $1 AND actor_id = $2`, [
    PROJECT,
    actor,
  ])
  return { active: rows[0]?.active === true, role: String(rows[0]?.role) }
}

/** Changes a member's standing; returns how many rows changed. */
export async function setMember(actor: string, to: Partial<Member>): Promise<number> {
  const rows = await owner(
    `UPDATE sophia.project_members SET active = COALESCE($3, active), role = COALESCE($4, role)
      WHERE project_id = $1 AND actor_id = $2 RETURNING 1`,
    [PROJECT, actor, to.active ?? null, to.role ?? null],
  )
  return rows.length
}
