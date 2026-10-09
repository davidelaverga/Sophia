/**
 * The pinned host's rules for a plugin's runtime SQL, as `server/src/services/plugin-database.ts` enforces them
 * (`validatePluginRuntimeQuery`, `validatePluginRuntimeExecute`, paperclipai/paperclip@5edf55d): one statement;
 * `ctx.db.query` is SELECT (or WITH) only, with no mutation keyword, and reads `public` only from the manifest's
 * core-read tables; `ctx.db.execute` is INSERT, UPDATE or DELETE into the plugin's own namespace and references no
 * other schema. The synthetic host applies them so a test fails where the real host would refuse;
 * `scripts/paperclip-verify.mjs` runs the pin's own validators.
 * @module @sophia/paperclip-plugin/host-sql
 */

/** Comments and string literals removed, lower case, one space: what the rules read. */
function normalise(sql: string): string {
  return sql
    .replaceAll(/--[^\n]*/g, ' ')
    .replaceAll(/'(?:[^']|'')*'/g, "''")
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function oneStatement(normalised: string): void {
  if (normalised.replace(/;\s*$/, '').includes(';'))
    throw new Error('Plugin runtime SQL must contain exactly one statement')
}

const schemaRefs = (normalised: string) =>
  [...normalised.matchAll(/\b(from|join|into|update|references)\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/g)].map(
    ([, keyword = '', schema = '', table = '']) => ({ keyword, schema, table }),
  )

export function checkQuery(sql: string, namespace: string, coreReadTables: readonly string[]): void {
  const n = normalise(sql)
  oneStatement(n)
  if (!n.startsWith('select ') && !n.startsWith('with ')) throw new Error('ctx.db.query only allows SELECT statements')
  if (/\b(insert|update|delete|alter|create|drop|truncate)\b/.test(n))
    throw new Error('ctx.db.query cannot contain mutation or DDL keywords')
  for (const ref of schemaRefs(n)) {
    if (ref.schema === namespace) continue
    if (ref.schema !== 'public') throw new Error(`ctx.db.query cannot read schema "${ref.schema}"`)
    if (!coreReadTables.includes(ref.table) || !['from', 'join'].includes(ref.keyword))
      throw new Error(`Plugin SQL references public.${ref.table}, which is not whitelisted`)
  }
}

export function checkExecute(sql: string, namespace: string): void {
  const n = normalise(sql)
  oneStatement(n)
  if (!/^(insert into|update|delete from)\b/.test(n))
    throw new Error('ctx.db.execute only allows INSERT, UPDATE, or DELETE')
  if (/\b(alter|create|drop|truncate)\b/.test(n)) throw new Error('ctx.db.execute cannot contain DDL keywords')
  const refs = schemaRefs(n)
  const target = refs.find((ref) => ['into', 'update', 'from'].includes(ref.keyword))
  if (target?.schema !== namespace)
    throw new Error(`ctx.db.execute target must be inside plugin namespace "${namespace}"`)
  if (refs.some((ref) => ref.schema !== namespace) || /\bpublic\./.test(n))
    throw new Error('ctx.db.execute cannot reference public or other non-plugin schemas')
}
