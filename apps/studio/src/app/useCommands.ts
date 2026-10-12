// A part of the page offers its commands (docs/plans/commands.md): their keys are bound as useShortcuts always bound
// them, and the registry lists them for the palette and the index while the part is enabled and in scope.
import { useContext, useEffect, useRef, useSyncExternalStore } from 'react'
import { commandsNow, onCommands, registerCommands, type Command, type Offered } from './commands.ts'
import { ShortcutScope, useShortcuts } from './shortcuts.ts'

/** What tells the commands apart between renders: their ids, keys, words and whether each can run. */
const shapeOf = (commands: readonly Command[]) =>
  commands.map((c) => `${c.id}·${c.key ?? ''}·${c.run ? 1 : 0}·${c.words}`).join('|')

export function useCommands(commands: readonly Command[], enabled = true): void {
  const scoped = useContext(ShortcutScope)
  const on = enabled && scoped
  const current = useRef(commands)
  useEffect(() => {
    current.current = commands
  })
  useShortcuts(Object.fromEntries(commands.filter((c) => c.key !== undefined).map((c) => [c.key ?? '', c.run])), on)
  const shape = shapeOf(commands)
  useEffect(() => {
    if (!on) return undefined
    // Registered once per shape; each run reads the latest actions, so a re-render changes nothing in the registry.
    const stable = current.current.map((c, at) => ({
      ...c,
      run: c.run ? () => current.current[at]?.run?.() : undefined,
    }))
    return registerCommands(stable)
  }, [shape, on])
}

/** The commands the page offers now, for the palette and the index. */
export const useOffered = (): readonly Offered[] => useSyncExternalStore(onCommands, commandsNow, commandsNow)
