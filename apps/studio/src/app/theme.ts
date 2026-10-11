// The Studio's appearance (docs/plans/light-mode.md): the dark room, the report's paper, or whichever the system
// asks for. The choice is kept on this browser (`sophia.theme`); the page carries the one resolved as
// `data-theme="light"` on its root, and nothing for the dark room, which every sheet draws by default. A fixture page
// may ask for one in its address (`theme=light`) without keeping it.
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light' | 'system'

const KEY = 'sophia.theme'
const THEMES: readonly Theme[] = ['dark', 'light', 'system']
const listeners = new Set<() => void>()
let asked: Theme | null = null

const isTheme = (value: string | null): value is Theme => THEMES.some((theme) => theme === value)

/** The appearance kept on this browser; the dark room when none is. */
export function readTheme(): Theme {
  if (asked) return asked
  try {
    const kept = localStorage.getItem(KEY)
    return isTheme(kept) ? kept : 'dark'
  } catch {
    return 'dark'
  }
}

/** What a choice comes to on this system now. */
export function resolveTheme(theme: Theme, systemLight = matchMedia('(prefers-color-scheme: light)').matches) {
  return theme === 'system' ? (systemLight ? 'light' : 'dark') : theme
}

/** Puts the resolved appearance on the page's root. */
export function applyTheme(theme: Theme = readTheme()): void {
  const page = document.documentElement
  if (resolveTheme(theme) === 'light') page.dataset['theme'] = 'light'
  else delete page.dataset['theme']
}

/** Keeps a choice on this browser and shows it. */
export function setTheme(theme: Theme): void {
  asked = null
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // A browser that keeps nothing still shows the choice for this visit.
    asked = theme
  }
  applyTheme(theme)
  for (const listen of listeners) listen()
}

/**
 * At the page's start: the kept appearance, or the one the address asks for (a fixture's `theme=`), shown before the
 * first paint; the system's changes followed while the choice is «system».
 */
export function bootTheme(fromAddress: string | null = null): void {
  if (isTheme(fromAddress)) asked = fromAddress
  applyTheme()
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme())
}

const subscribe = (listen: () => void) => {
  listeners.add(listen)
  return () => listeners.delete(listen)
}

/** The appearance chosen, and the way to choose another (the account menu). */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'dark' as const)
  return [theme, setTheme]
}
