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

/** "(2) Project · Sophia" while two people wait to come in; the count leads so a narrow tab still shows it. */
export function projectTitle(title: string, waiting: number): string {
  return waiting > 0 ? `(${waiting}) ${title} · Sophia` : `${title} · Sophia`
}
