// Commands (docs/plans/commands.md): what a part of the page lets a person do, with words and, where it has one, its
// key. One registry feeds the palette (⌘K), the index of keys (⌘/ and ?) and the key bindings themselves, so the index
// never lists a key the page does not take, and the palette never offers what the page cannot do now.
import { keyLabel } from './shortcuts.ts'

export type CommandGroup = 'you' | 'go' | 'view' | 'room' | 'do'

/** A group's word, in the palette's rows and over the index's lists. */
export const GROUP_WORDS: Readonly<Record<CommandGroup, string>> = {
  you: 'For you',
  go: 'Go',
  view: 'This view',
  room: 'The room',
  do: 'Do',
}
/** «For you» first: what waits on the viewer, offered by the part that shows it (docs/plans/palette-knows.md). */
const GROUP_ORDER: readonly CommandGroup[] = ['you', 'go', 'view', 'room', 'do']

/** How many commands run last lead the palette with nothing typed. */
const RECENT_SHOWN = 3

export interface Command {
  id: string
  /** What it does, as the palette and the index say it: "Go to Tasks", "Microphone on". */
  words: string
  group: CommandGroup
  /** Its key, as useShortcuts names it ("h", "mod+k"), when it has one. */
  key?: string | undefined
  /** Runs it; undefined while the page cannot (the room not joined): then it is not offered. */
  run?: (() => void) | undefined
}

/** A command the page offers now. */
export interface Offered extends Command {
  run: () => void
}

const offered = (c: Command): c is Offered => typeof c.run === 'function'

/** The parts on screen and their commands, in the order they came; what the palette and the index read. */
let parts: { token: symbol; commands: Offered[] }[] = []
let now: readonly Offered[] = []
const listeners = new Set<() => void>()

const refresh = () => {
  now = parts.flatMap((p) => p.commands)
  for (const tell of listeners) tell()
}

/** A part offers these commands until the returned function is called. */
export function registerCommands(commands: readonly Command[]): () => void {
  const token = Symbol('part')
  parts = [...parts, { token, commands: commands.filter(offered) }]
  refresh()
  return () => {
    parts = parts.filter((p) => p.token !== token)
    refresh()
  }
}

/** The commands offered now (a stable array until a part registers or leaves). */
export const commandsNow = (): readonly Offered[] => now

/** Hears every change of what is offered. */
export function onCommands(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Letters and digits of any script, lower, accents folded: "Résumé the brief" → ["resume", "the", "brief"]. */
const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '')

/** How well a command answers the words asked: 0 when a word starts none of its own, else the sum of its hits. */
function scoreOf(asked: readonly string[], command: Offered): number {
  const own = wordsOf(command.words)
  const group = wordsOf(GROUP_WORDS[command.group])
  let score = 0
  for (const q of asked) {
    const at = own.findIndex((w) => w.startsWith(q))
    if (at === 0) score += 3
    else if (at > 0) score += 2
    else if (group.some((w) => w.startsWith(q))) score += 1
    else return 0
  }
  return score
}

/**
 * The commands a query names, best first: every word of the query starts a word of the command (its own, or its
 * group's); matches from the command's first word come first, then from a later word, then from the group; ties keep
 * the order they came in. Nothing asked: all of them, as they came.
 */
export function matchCommands(query: string, commands: readonly Offered[]): Offered[] {
  // Nothing asked: every command, in the groups' order (go, view, room, do), each group as registered.
  if (query.trim() === '') {
    return [...commands].toSorted((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
  }
  // Something typed that names no word (punctuation alone): nothing matches; it is not a blank query (Codex on #238).
  const asked = wordsOf(query)
  if (asked.length === 0) return []
  return commands
    .map((command, at) => ({ command, at, score: scoreOf(asked, command) }))
    .filter((s) => s.score > 0)
    .toSorted((a, b) => b.score - a.score || a.at - b.at)
    .map((s) => s.command)
}

/** A palette row: the command and the word before it (its group's, or «Recent»). */
export interface PaletteRow {
  command: Offered
  label: string
}

/**
 * The palette's rows (docs/plans/palette-knows.md). Typed: the commands the words name, best first, each with its
 * group. Nothing typed: «For you» first, then the last commands run that are offered now (`recent`, newest first, three
 * at most, labelled «Recent»), then the rest in the groups' order without them.
 */
export function paletteRows(query: string, commands: readonly Offered[], recent: readonly string[]): PaletteRow[] {
  const withGroup = (command: Offered) => ({ command, label: GROUP_WORDS[command.group] })
  // Anything typed is a query, punctuation alone too (it matches nothing, so Enter searches): only a blank field shows
  // «For you» and Recent (Codex on #264).
  if (query.trim() !== '') return matchCommands(query, commands).map(withGroup)
  const yours = commands.filter((c) => c.group === 'you')
  const last = recent
    .map((id) => commands.find((c) => c.id === id && c.group !== 'you'))
    .filter((c): c is Offered => c !== undefined)
    .slice(0, RECENT_SHOWN)
  const rest = matchCommands('', commands).filter((c) => c.group !== 'you' && !last.includes(c))
  return [...yours.map(withGroup), ...last.map((command) => ({ command, label: 'Recent' })), ...rest.map(withGroup)]
}

export interface KeyRow {
  id: string
  words: string
  /** The key as this platform writes it: "Ctrl+K", "⌘K", "H". */
  keys: string
}

export interface KeyGroup {
  group: CommandGroup
  label: string
  rows: KeyRow[]
}

/** The keys the page takes now, by group in their order, for the index; a group with none is not listed. */
export function indexGroups(commands: readonly Offered[], mac: boolean): KeyGroup[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_WORDS[group],
    rows: commands
      .filter((c) => c.group === group && c.key !== undefined)
      .map((c) => ({ id: c.id, words: c.words, keys: keyLabel(c.key ?? '', mac) })),
  })).filter((g) => g.rows.length > 0)
}
