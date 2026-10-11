import type { KeyboardEvent } from 'react'

/** ↑ and ↓ move in an index of rows (`.hw-row`: the projects', what needs you); the first and last hold. */
export function moveInIndex(e: KeyboardEvent<HTMLOListElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.hw-row')]
  const at = rows.findIndex((r) => r === document.activeElement)
  if (at < 0) return
  e.preventDefault()
  rows[Math.min(Math.max(at + (e.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1)]?.focus()
}
