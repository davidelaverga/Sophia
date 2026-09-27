// Arrow keys, Home and End across a row of tabs (WAI-ARIA tabs with automatic activation), wrapping at the
// ends. Pure: each tab list moves focus itself.

export function nextInRow<T>(row: readonly T[], current: T, key: string): T | null {
  if (key === 'Home') return row[0] ?? null
  if (key === 'End') return row.at(-1) ?? null
  const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
  const delta = step[key]
  if (delta === undefined) return null
  const i = row.indexOf(current)
  return row[(i + delta + row.length) % row.length] ?? null
}
