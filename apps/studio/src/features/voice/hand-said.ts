// Others' raised hands, gathered for a screen reader (hand-and-sync-announced.md): the raises that arrive together (a
// late joiner is told each hand at once) are said in one line, a short wait after the first; the words are
// room-view.ts's (handRaisedLine).
import { handRaisedLine } from './room-view.ts'

/** How long after a raise others arriving are said with it. */
export const GATHER_MS = 300

export interface RaisesGathered {
  /** Another's hand went up, by the name the room shows. */
  raised: (name: string) => void
  /** Out of the call: what waited is never said. */
  clear: () => void
}

export function gatherRaises(say: (line: string) => void, wait = GATHER_MS): RaisesGathered {
  let names: string[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    timer = undefined
    const gathered = names
    names = []
    if (gathered.length > 0) say(handRaisedLine(gathered))
  }
  return {
    raised: (name) => {
      if (!names.includes(name)) names.push(name)
      timer ??= setTimeout(flush, wait)
    },
    clear: () => {
      clearTimeout(timer)
      timer = undefined
      names = []
    },
  }
}
