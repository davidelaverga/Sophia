// What the address's fragment names under a prefix (link.ts), followed while the view is open: a link followed within
// the page names something new. Each time it is followed counts (`seq`), so a choice made since (a goal, a closed
// sheet) gives way to the address only when the address is followed again, never when it is merely read again.
import { useEffect, useState } from 'react'
import { ADDRESS_MOVED } from '../../app/route.ts'
import { ADDRESS_SHOWN, linkedId } from './link.ts'

export interface Addressed {
  id: string | null
  /** How many times the address was followed: 0 for what the page opened with. */
  seq: number
}

/** The router named a record in the fragment (openAt): a mounted view follows it as a link followed. */
export const ADDRESS_NAMED = 'sophia:address-named'

/** What a move of the address does to a hook: followed (`seq` goes up), read (`seq` stays), or kept as it is. */
export type Step = 'follow' | 'read' | 'keep'

/** The moves a hook follows, by the record it last followed (docs/plans/addressed-follows-back.md). */
export interface Moves {
  /** A link followed (ADDRESS_NAMED): always followed. */
  named: (id: string | null) => Step
  /** Back or Forward (`popstate`), landing at `url`. */
  pop: (id: string | null, url: string) => Step
  /** The fragment moved alone (`hashchange`, after its own `popstate`), to `url`. */
  hash: (id: string | null, url: string) => Step
  /** The view wrote it itself (`showInAddress`, a press): never followed. */
  shown: (id: string | null) => Step
}

/**
 * What each move does, by the record last followed (`acted`, from `start`, the page's). Back or Forward follows only
 * another record: one naming none is read, and the record last followed is kept as it is, so a sheet closed since
 * (its fragment cleared, or left in place) never opens again. A close tells nothing here, on purpose. A move of the
 * fragment alone keeps today's `hashchange`, once: not again when its `popstate` already followed it.
 */
export function moves(start: string | null): Moves {
  let acted = start
  let popped: string | null = null
  const follow = (id: string | null): Step => {
    // Only a record is acted on: a move naming none of this kind (another kind's link, a report's anchor) is followed,
    // as before (`seq` still moves), but Back to the record closed since still reopens nothing (review on this branch).
    if (id !== null) acted = id
    popped = null
    return 'follow'
  }
  return {
    named: follow,
    pop: (id, url) => {
      popped = null
      if (id === null) return 'read'
      if (id === acted) return 'keep'
      follow(id)
      popped = url
      return 'follow'
    },
    // A record opened by a press is the one Back is held to, as if followed but never raising `seq`; a close (none)
    // leaves the record it closed (review on this branch).
    shown: (id) => {
      if (id !== null) acted = id
      return 'keep'
    },
    hash: (id, url) => {
      if (popped !== url) return follow(id)
      popped = null
      return 'keep'
    },
  }
}

let noted: string | null = null

/**
 * The fragment on screen through the report's own step Back (DocumentViewer's Close and shrink): its entries carry the
 * fragment from when the report opened, and closing a report changes the report only. Noted before the step, read in
 * its stead until the viewer has written it where the step landed, whichever `popstate` listener runs first.
 */
export const keptFragment = {
  note: (hash: string, landed: () => boolean): void => {
    void landed
    noted = hash
  },
  /** The address's fragment, or the one noted for it while a step is writing it. */
  of: (hash: string): string => noted ?? hash,
  /** What was noted, once (null for nothing): the viewer writes it where the step landed. */
  take: (): string | null => {
    const hash = noted
    noted = null
    return hash
  },
}

export function useAddressed(prefix: string): Addressed {
  const [named, setNamed] = useState<Addressed>(() => ({ id: linkedId(window.location.hash, prefix), seq: 0 }))
  const [start] = useState(named.id)
  useEffect(() => {
    const m = moves(start)
    const read = () => linkedId(window.location.hash, prefix)
    const apply = (step: Step, id: string | null) => {
      if (step === 'follow') setNamed((n) => ({ id, seq: n.seq + 1 }))
      // A gone address is gone: read, not followed (`seq` stays, so a choice made since stands).
      else if (step === 'read') setNamed((n) => (n.id === id ? n : { id, seq: n.seq }))
    }
    const onNamed = () => {
      const id = read()
      apply(m.named(id), id)
    }
    const onPop = () => {
      const id = linkedId(keptFragment.of(window.location.hash), prefix)
      apply(m.pop(id, window.location.href), id)
    }
    const onHash = (e: HashChangeEvent) => {
      const id = read()
      apply(m.hash(id, e.newURL), id)
    }
    const onShown = () => m.shown(read())
    window.addEventListener(ADDRESS_SHOWN, onShown)
    window.addEventListener('hashchange', onHash)
    window.addEventListener(ADDRESS_NAMED, onNamed)
    // Back and Forward where the query or the path moved too fire no hashchange (addressed-follows-back.md).
    window.addEventListener('popstate', onPop)
    // The route's own moves (a view's path pushed) may drop the fragment: read again, not followed (`seq` stays, so a
    // choice made since stands), and a gone address is gone, never replayed (Codex P2 on #300).
    const moved = () => setNamed((n) => ({ id: read(), seq: n.seq }))
    window.addEventListener(ADDRESS_MOVED, moved)
    return () => {
      window.removeEventListener(ADDRESS_SHOWN, onShown)
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener(ADDRESS_NAMED, onNamed)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener(ADDRESS_MOVED, moved)
    }
  }, [prefix, start])
  return named
}
