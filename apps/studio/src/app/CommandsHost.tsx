// The commands' host (docs/plans/commands.md): the palette on ⌘K, the index of keys on ⌘/ (and on ? where no field
// takes stray typing), each a modal dialog over the page. Mounted once by the project shell.
import { useEffect, useState } from 'react'
import { Palette } from './Palette.tsx'
import { useShortcuts } from './shortcuts.ts'
import { ShortcutIndex } from './ShortcutIndex.tsx'
import { useCommands } from './useCommands.ts'

type Open = 'palette' | 'index'

/** The host on screen, if one is: what a visible control elsewhere (the account menu) asks to open. */
let host: ((what: Open) => void) | null = null

/** Opens the palette or the index from a control of the page; nothing outside a project's shell. */
export function askCommands(what: Open): void {
  host?.(what)
}

interface Props {
  /** Where the project has Search (`/`): the palette's Enter on nothing matching opens it. */
  onSearch?: (() => void) | undefined
}

export function CommandsHost({ onSearch }: Props) {
  const [open, setOpen] = useState<Open | null>(null)
  useEffect(() => {
    host = setOpen
    return () => {
      host = null
    }
  }, [])
  const palette = () => setOpen('palette')
  const index = () => setOpen('index')
  useCommands([
    { id: 'commands', words: 'Commands', group: 'do', key: 'mod+k', run: palette },
    { id: 'keys', words: 'Keyboard shortcuts', group: 'do', key: 'mod+/', run: index },
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
