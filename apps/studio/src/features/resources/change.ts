// A change of a session's effort, from its owner's request to what its tool runs. Nothing changes in place: the next
// run starts with it, or, asked now, the session's attempt stops and a new one starts with it (OMNIGENT §6: its work is
// kept and handed over, the old attempt's pending requests retired). Each step is said only as the runtime reports it
// (Session.change); a stop it can't confirm is said so, and nothing restarts.
import { effortLook } from './effort.ts'
import type { Session } from './resource.ts'

export type When = 'next' | 'now'
export interface EffortAsk {
  level: string
  when: When
  /** Its runtime refused it: said once, then let go. Nothing changed. */
  refused?: boolean
}

/** A level as people say it: "Extra high", "Max", "Ultracode". */
export const levelName = (level: string) => effortLook(level).label

/** What the session runs now, as one of its levels: its mode when it has one (ultracode), else its effort. */
export const currentLevel = (s: Session) => s.mode ?? s.effort?.toLowerCase() ?? null

/**
 * The line beside the bar. `asked`: its owner's request, still theirs to undo. `moving`: the runtime is on it, past
 * undoing. `done`: what it runs is what was asked. `warn`: the stop wasn't confirmed. `refused`: its runtime didn't
 * take the request, and nothing changed.
 */
export interface ChangeLine {
  text: string
  tone: 'asked' | 'moving' | 'done' | 'warn' | 'refused'
}

export function changeLine(session: Session, ask: EffortAsk | undefined): ChangeLine | null {
  const change = session.change
  if (change?.phase === 'stopping') return { text: 'Stopping · keeping its work', tone: 'moving' }
  if (change?.phase === 'starting') return { text: `Starting again with ${levelName(change.level)}`, tone: 'moving' }
  if (change?.phase === 'unconfirmed') return { text: 'Stop not confirmed · nothing restarted', tone: 'warn' }
  if (!ask) return null
  if (ask.refused) return { text: 'Not accepted · nothing changed', tone: 'refused' }
  if (currentLevel(session) === ask.level) return { text: `Now on ${levelName(ask.level)}`, tone: 'done' }
  return { text: `${ask.when === 'now' ? 'Restart asked ·' : 'Next run ·'} ${levelName(ask.level)}`, tone: 'asked' }
}
