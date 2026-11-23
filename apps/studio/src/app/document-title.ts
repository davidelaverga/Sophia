// The browser tab's title follows what matters on the page (a project's name, someone at its door, a guest
// let in), so a tab in the background still says it. Leaving the page puts the plain title back.
import { useEffect } from 'react'

const PLAIN = 'Sophia Studio'

export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return undefined
    document.title = title
    return () => {
      document.title = PLAIN
    }
  }, [title])
}

/** The most of a project's title a tab says: past it, the start and «…» (docs/plans/words-whole.md). */
export const TAB_TITLE_MOST = 60

/** A title cut for a tab, never inside a character (an emoji stays whole). */
export function tabTitle(title: string): string {
  const characters = Array.from(title)
  return characters.length > TAB_TITLE_MOST
    ? `${characters
        .slice(0, TAB_TITLE_MOST - 1)
        .join('')
        .trimEnd()}…`
    : title
}

/** "(2) Project · Sophia" while two people wait to come in; the count leads so a narrow tab still shows it. */
export function projectTitle(title: string, waiting: number): string {
  const shown = tabTitle(title)
  return waiting > 0 ? `(${waiting}) ${shown} · Sophia` : `${shown} · Sophia`
}
