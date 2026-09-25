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
