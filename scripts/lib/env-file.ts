import { readFileSync } from 'node:fs'

/**
 * KEY=value lines of an env file. Accepts CRLF (files written on Windows): a stray CR in a value
 * such as a JWT issuer breaks exact comparisons downstream, so values are trimmed.
 */
export function readEnvFile(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
  )
}

export function requireKeys(env: Record<string, string>, keys: readonly string[], source: string): void {
  const missing = keys.filter((k) => !env[k])
  if (missing.length > 0) throw new Error(`${missing.join(', ')} missing in ${source}`)
}

/** The named string fields of parsed JSON (such as CLI output); throws naming whatever is missing. */
export function pickStrings<K extends string>(value: unknown, keys: readonly K[], source: string): Record<K, string> {
  const record: Record<string, unknown> = typeof value === 'object' && value !== null ? { ...value } : {}
  const missing = keys.filter((k) => typeof record[k] !== 'string')
  if (missing.length > 0) throw new Error(`${missing.join(', ')} missing in ${source}`)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every key was checked to be a string above
  return Object.fromEntries(keys.map((k) => [k, record[k]])) as Record<K, string>
}
