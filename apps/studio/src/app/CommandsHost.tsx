// The commands' host (docs/plans/commands.md): the palette on ⌘K, the index of keys on ⌘/ (and on ? where no field
// takes stray typing), each a modal dialog over the page; and the light by a key. Mounted by the project shell and by
// the places' bar; the one in scope answers a control's ask.
import { useContext, useEffect, useState } from 'react'
import { Palette } from './Palette.tsx'
import { ShortcutScope, useShortcuts } from './shortcuts.ts'
import { ShortcutIndex } from './ShortcutIndex.tsx'
import { resolveTheme, useTheme } from './theme.ts'
import { useCommands } from './useCommands.ts'

type Open = 'palette' | 'index'

/** The host in scope, if one is: what a visible control elsewhere (the account menu) asks to open. */
let host: ((what: Open) => void) | null = null

/** Opens the palette or the index from a control of the page; nothing where no host is in scope. */
export function askCommands(what: Open): void {
  host?.(what)
}

interface Props {
  /** Where the project has Search (`/`): the palette's Enter on nothing matching opens it. */
  onSearch?: (() => void) | undefined
}

/** The light by a key (docs/plans/places-commands.md): the page's other appearance, set as the menu's radios set it. */
function useLightCommand() {
  const [theme, setTheme] = useTheme()
  const light = resolveTheme(theme) === 'light'
  return {
    id: 'theme',
    words: light ? 'Switch to the dark room' : 'Switch to the light page',
    group: 'do' as const,
    key: 'mod+shift+l',
    run: () => setTheme(light ? 'dark' : 'light'),
  }
}

export function CommandsHost({ onSearch }: Props) {
  const [open, setOpen] = useState<Open | null>(null)
  const scoped = useContext(ShortcutScope)
  useEffect(() => {
    if (!scoped) return undefined
    host = setOpen
    return () => {
      if (host === setOpen) host = null
    }
  }, [scoped])
  const palette = () => setOpen('palette')
  const index = () => setOpen('index')
  useCommands([
    { id: 'commands', words: 'Commands', group: 'do', key: 'mod+k', run: palette },
    { id: 'keys', words: 'Keyboard shortcuts', group: 'do', key: 'mod+/', run: index },
    useLightCommand(),
  ])
  // The same index on ?, where it can be typed as a key: not listed twice.
  useShortcuts({ '?': index })
  const close = () => setOpen(null)
  return (
    <>
      {open === 'palette' && <Palette onClose={close} onSearch={onSearch} />}
      {open === 'index' && <ShortcutIndex onClose={close} />}
    </>
  )
}
