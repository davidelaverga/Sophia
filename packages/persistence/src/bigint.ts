/** Contract revisions are safe integers; database BIGINT arrives as a string. Never round silently. */
export function safeInt(value: string | number, field: string): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(n)) throw new RangeError(`${field} is not a safe integer: ${value}`)
  return n
}
