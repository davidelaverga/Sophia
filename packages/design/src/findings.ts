// What a check reports about a source package (SDD-01). An `error` blocks what it guards (saving unsafe source,
// submitting a candidate); a `warning` is advice the designer sees with the revision.

export type Severity = 'error' | 'warning'

export interface Finding {
  /** Stable code, for the model and for tests: `unsafe_element`, `block_missing`, ... */
  readonly code: string
  readonly severity: Severity
  /** The source file (`index.html`, `styles.css`), or `package`. */
  readonly path: string
  readonly message: string
  /** 1-based line in that file, when one place is to blame. */
  readonly line?: number
  /** The content block concerned (`b12`), for content findings. */
  readonly block?: string
}

export const error = (
  code: string,
  path: string,
  message: string,
  at: { line?: number; block?: string } = {},
): Finding => ({
  code,
  severity: 'error',
  path,
  message,
  ...at,
})

export const warning = (
  code: string,
  path: string,
  message: string,
  at: { line?: number; block?: string } = {},
): Finding => ({
  code,
  severity: 'warning',
  path,
  message,
  ...at,
})

export const hasErrors = (findings: readonly Finding[]): boolean => findings.some((f) => f.severity === 'error')

/** At most this many findings are reported; the count says how many there were. */
export const FINDING_LIMIT = 200

export function bounded(findings: readonly Finding[]): { findings: Finding[]; total: number } {
  return { findings: findings.slice(0, FINDING_LIMIT), total: findings.length }
}
