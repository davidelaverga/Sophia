/**
 * The single row a statement always returns (a function call, an aggregate). A missing row is a
 * programming error, not a user-facing condition, so it throws instead of being asserted away.
 */
export function onlyRow<T>(rows: readonly T[], statement: string): T {
  const row = rows[0]
  if (row === undefined) throw new Error(`${statement} returned no row`)
  return row
}
