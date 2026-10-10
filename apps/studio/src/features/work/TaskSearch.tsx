// Searching Tasks: one field at the head of the view (`/` reaches it, Escape clears it, then leaves it). It narrows the
// goals' rail to the goals whose title or tasks match, and its words reach each plan's board (SearchQuery), where tasks
// that don't match step back, as a lens does: nothing moves.
import { createContext, useRef } from 'react'
import { Search } from '@sophia/ui'
import { useShortcuts } from '../../app/shortcuts.ts'

/** What Tasks is searched for, as typed; empty when nothing is. */
export const SearchQuery = createContext('')

/** Whether some text answers a search: every word typed is in it, in any order, whatever its case. */
export function answers(query: string, ...texts: readonly (string | null | undefined)[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const said = texts.join(' ').toLowerCase()
  return words.every((w) => said.includes(w))
}

export function TaskSearch({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  useShortcuts({ '/': () => input.current?.focus() })
  return (
    <Search
      ref={input}
      className="resource-search task-search"
      aria-label="Search goals and tasks"
      aria-keyshortcuts="/"
      placeholder="Search goals, tasks, people…"
      value={query}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        if (query) onChange('')
        else input.current?.blur()
      }}
      tip={{ label: 'Search', keys: '/', side: 'bottom' }}
    />
  )
}
