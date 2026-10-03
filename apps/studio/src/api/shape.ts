// A small structural reader for proposed wire shapes the generated contracts don't carry yet (WBC-01's work board).
// Each check names where a value fails and why, and never repairs it. It checks shape only: references between
// records, authority and order are the caller's (board-view.ts). Once a shape is promoted to `@sophia/contracts`, its
// generated validator replaces the description built here.

/** Adds a problem for each way `value` fails, each named by where it sits (`goals[0].items[2].lifecycle`). */
export type Check = (value: unknown, at: string, problems: string[]) => void

const kind = (value: unknown) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A string of 1 to `max` characters; `test`, when given, says what else it must be. */
export const text =
  (max: number, test?: { ok: (s: string) => boolean; says: string }): Check =>
  (value, at, problems) => {
    if (typeof value !== 'string') problems.push(`${at}: a string, not ${kind(value)}`)
    else if (value.length < 1 || value.length > max) problems.push(`${at}: 1 to ${String(max)} characters`)
    else if (test && !test.ok(value)) problems.push(`${at}: ${test.says}`)
  }

/** An ISO date-time that parses. */
export const instant = text(40, {
  ok: (s) => /^\d{4}-\d\d-\d\dT/.test(s) && !Number.isNaN(Date.parse(s)),
  says: 'a date-time',
})

/** An integer of at least `min`. */
export const whole =
  (min: number): Check =>
  (value, at, problems) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
      problems.push(`${at}: an integer of at least ${String(min)}`)
    }
  }

/** One of the listed values. */
export const oneOf =
  (values: readonly string[]): Check =>
  (value, at, problems) => {
    if (typeof value !== 'string' || !values.includes(value)) problems.push(`${at}: one of ${values.join(', ')}`)
  }

/** The exact value given. */
export const exactly = (expected: string): Check => oneOf([expected])

/** Null, or what `check` accepts. */
export const orNull =
  (check: Check): Check =>
  (value, at, problems) => {
    if (value !== null) check(value, at, problems)
  }

/** A list of `min` to `max` entries, each what `item` accepts; `unique` refuses a repeated string. */
export const list =
  (item: Check, max: number, options: { min?: number; unique?: boolean } = {}): Check =>
  (value, at, problems) => {
    if (!Array.isArray(value)) {
      problems.push(`${at}: a list, not ${kind(value)}`)
      return
    }
    if (value.length < (options.min ?? 0) || value.length > max) {
      problems.push(`${at}: ${String(options.min ?? 0)} to ${String(max)} entries`)
    }
    if (options.unique && new Set(value).size !== value.length) problems.push(`${at}: repeated entries`)
    value.forEach((entry, i) => item(entry, `${at}[${String(i)}]`, problems))
  }

/** An object with exactly these fields, every one required (a nullable one is given as null). */
export const record =
  (fields: Readonly<Record<string, Check>>): Check =>
  (value, at, problems) => {
    if (!isRecord(value)) {
      problems.push(`${at}: an object, not ${kind(value)}`)
      return
    }
    for (const [name, check] of Object.entries(fields)) {
      if (name in value) check(value[name], `${at}.${name}`, problems)
      else problems.push(`${at}.${name}: missing`)
    }
    for (const name of Object.keys(value)) if (!(name in fields)) problems.push(`${at}.${name}: not in the shape`)
  }

/** Everything `check` finds wrong with `value`, read from its root. */
export function problemsOf(check: Check, value: unknown, root = '$'): string[] {
  const problems: string[] = []
  check(value, root, problems)
  return problems
}
