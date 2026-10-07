// What Personal's fixture adds for the parts the API doesn't give yet (src/features/personal/extras.ts), over labelled
// simulated data: what she remembers, her look back at the week, and a live talk that captions itself on a timer.
// `window.personalFixture.pressed` lists what each part was asked ("forget <id>", "correct <id> <text>", "keep week",
// "dismiss week", "mute on", "talk ended").
import type { ProjectSummary } from '@sophia/contracts'
import { useMemo, useRef, useState } from 'react'
import type {
  Memory,
  PersonalExtras,
  PersonalMemory,
  TalkLine,
  Voice,
  Week,
  WeekLook,
} from '../src/features/personal/extras.ts'
import { HOME_PROJECT } from './demo.ts'

const SAID: readonly TalkLine[] = [
  { who: 'sophia', text: 'I’m here. How did the meeting land, now that it’s over?' },
  { who: 'you', text: 'Better than I feared. I said the date I can keep.' },
  { who: 'sophia', text: 'That took courage. What did Davide say?' },
  { who: 'you', text: 'He thanked me for saying it early.' },
]

/** A live talk as the API's voice would run it: who speaks, and the lines, one every `step` ms; End writes them. */
function fakeVoice(pressed: string[], onEnd: (lines: readonly TalkLine[]) => void, step: number): Voice {
  return {
    start: (heard) => {
      let said = 0
      let lines: TalkLine[] = []
      heard({ lines, speaking: 'sophia' })
      const timer = window.setInterval(() => {
        const next = SAID[said]
        if (!next) {
          heard({ lines, speaking: null })
          window.clearInterval(timer)
          return
        }
        said += 1
        lines = [...lines, next]
        heard({ lines, speaking: SAID[said]?.who ?? null })
      }, step)
      return {
        mute: (on) => pressed.push(`mute ${on ? 'on' : 'off'}`),
        end: () => {
          window.clearInterval(timer)
          if (lines.length === 0) return // a talk that never began (StrictMode's first mount) writes nothing
          pressed.push('talk ended')
          onEnd(lines)
        },
      }
    },
  }
}

/** `memory=old`: the first was learned over a year ago, so its day is said in full ("Aug 31, 2025"), the widest. */
const REMEMBERED = (ago: (minutes: number) => string, old: boolean): PersonalMemory[] => [
  {
    id: 'm1',
    text: 'You have a pitch on Friday; the numbers worry you most.',
    learnedAt: ago(old ? 400 * 24 * 60 : 24 * 60 + 40),
  },
  { id: 'm2', text: 'You’d rather say a hard date early than miss it quietly.', learnedAt: ago(6) },
  { id: 'm3', text: 'Davide is the one you want to hear it from first.', learnedAt: ago(5) },
]

const LOOK: WeekLook = {
  id: 'week-41',
  weekOf: '2026-09-28',
  text: 'You came here three times this week, each time about work that felt rushed. Twice you found what you could still control before you left. Thursday was the heaviest day.',
  themes: ['the launch', 'promises you can keep', 'Davide'],
}

/** The parts the query string asks for (`memory=1` or `=old`, `week=1`, `voice=1`, or `all=1`), each acting on its own state. */
export function useExtras(
  query: URLSearchParams,
  pressed: string[],
  ago: (minutes: number) => string,
  wrote: { talk: (lines: readonly TalkLine[]) => void; keep: (text: string) => void },
): PersonalExtras {
  const on = (part: string) => query.has('all') || query.has(part)
  const [items, setItems] = useState(() => REMEMBERED(ago, query.get('memory') === 'old'))
  const [look, setLook] = useState<WeekLook | null>(LOOK)
  const write = useRef(wrote)
  write.current = wrote
  const voice = useMemo(
    () => fakeVoice(pressed, (lines) => write.current.talk(lines), Number(query.get('step') ?? 1100)),
    [pressed, query],
  )
  const memory: Memory = {
    items,
    forget: (id) => {
      pressed.push(`forget ${id}`)
      setItems((was) => was.filter((m) => m.id !== id))
    },
    correct: (id, text) => {
      pressed.push(`correct ${id} ${text}`)
      setItems((was) => was.map((m) => (m.id === id ? { ...m, text } : m)))
    },
  }
  const week: Week | null = look && {
    look,
    keep: () => {
      pressed.push('keep week')
      write.current.keep(look.text)
      setLook(null)
    },
    dismiss: () => {
      pressed.push('dismiss week')
      setLook(null)
    },
  }
  return {
    ...(on('memory') ? { memory } : {}),
    ...(on('week') && week ? { week } : {}),
    ...(on('voice') ? { voice } : {}),
  }
}

/** Projects with a session today: `ready=1` (or `all=1`) gives one that starts in 10 min. */
export function projectsFor(query: URLSearchParams, ahead: (minutes: number) => string): ProjectSummary[] {
  if (!query.has('ready') && !query.has('all')) return []
  const standup = { id: 's1', title: 'Standup', startsAt: ahead(10), endsAt: ahead(40), timeZone: 'UTC' }
  return [
    {
      projectId: '00000000-0000-4000-8000-000000000004',
      title: HOME_PROJECT,
      role: 'editor',
      members: 3,
      room: null,
      nextSession: standup,
      releases: [],
    },
  ]
}
