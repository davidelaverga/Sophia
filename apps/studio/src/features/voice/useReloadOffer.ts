// The way back into a call a reload left (docs/plans/call-way-back.md, reload-mark.ts). As the page goes while this
// person is in the call, the tab notes it; as the page comes back, the note is read once (and forgotten in storage,
// kept for this page in memory, since the dock may mount more than once as the project loads), and the room offers it:
// the dock says so and Join goes back as the call was, for as long as the call's own window. Nothing joins on its own:
// the microphone is the person's to bring back.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { REJOIN_WINDOW_MS } from './call-rejoin.ts'
import { markText, readMark, RELOAD_KEY, type ReloadMark } from './reload-mark.ts'
import type { ProjectRoom } from './useProjectRoom.ts'

/** What this page found as it loaded: undefined until read, then the raw note (or null). Read once per page. */
let found: string | null | undefined

function foundNote(): string | null {
  if (found !== undefined) return found
  try {
    found = sessionStorage.getItem(RELOAD_KEY)
    sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    found = null
  }
  return found
}

/** The page's note spent: back in, it offers nothing again on this page. */
const spend = () => {
  found = null
}

/** Writes or forgets the tab's note; storage that refuses keeps nothing, and the reload offers nothing. */
function keep(mark: ReloadMark | null) {
  try {
    if (mark) sessionStorage.setItem(RELOAD_KEY, markText(mark))
    else sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    /* no storage: no offer after a reload */
  }
}

interface Now {
  live: boolean
  mic: boolean
  textMode: boolean
}

/**
 * The page going while in the call (a reload, an address typed): noted for this tab, as the call is then. LiveKit leaves
 * the room itself on `beforeunload` and `pagehide`, and the call reads ended once it has: these listeners, added as the
 * dock mounts, hear each first (React commits nothing between listeners). A page kept for Back (`persisted`) didn't
 * go: its note is taken back as it shows again.
 */
function useNoteAsThePageGoes(project: string, account: string, latest: { current: Now }) {
  useEffect(() => {
    const going = (e: Event) => {
      const now = latest.current
      if (!now.live || (e instanceof PageTransitionEvent && e.persisted)) return
      keep({ project, account, at: Date.now(), mic: now.mic, textMode: now.textMode })
    }
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) keep(null)
    }
    window.addEventListener('beforeunload', going)
    window.addEventListener('pagehide', going)
    window.addEventListener('pageshow', back)
    return () => {
      window.removeEventListener('beforeunload', going)
      window.removeEventListener('pagehide', going)
      window.removeEventListener('pageshow', back)
    }
  }, [project, account, latest])
}

/** The way back a reload left: the offer, and the join that goes back as the call was (null with no offer). */
export type WayBack = ReturnType<typeof useReloadOffer>

export function useReloadOffer(projectId: string, identity: Identity, room: ProjectRoom) {
  const account = accountOf(identity)
  const [offer, setOffer] = useState(() => readMark(foundNote(), projectId, account, Date.now()))
  const latest = useRef<Now>({ live: false, mic: false, textMode: false })
  const me = room.participants.find((p) => p.local)
  useLayoutEffect(() => {
    const live = room.status === 'live' || room.status === 'reconnecting'
    latest.current = { live, mic: me?.micOn ?? false, textMode: room.textMode }
  })
  useNoteAsThePageGoes(projectId, account, latest)
  // The call's own window closes: the offer goes with it.
  useEffect(() => {
    if (!offer) return undefined
    const gone = setTimeout(
      () => {
        spend()
        setOffer(null)
      },
      Math.max(0, offer.at + REJOIN_WINDOW_MS - Date.now()),
    )
    return () => clearTimeout(gone)
  }, [offer])
  // Back in, by this offer or any other way: it is spent.
  if (offer && room.status === 'live') {
    spend()
    setOffer(null)
  }
  return {
    offer,
    /**
     * Join as the call was: the microphone it had (never on unless this device's choice is), typing to Sophia if it
     * was; the camera comes back off, as after Try again.
     */
    join: offer ? () => void room.join({ mic: offer.mic, ...(offer.textMode ? { textOnly: true } : {}) }) : null,
  }
}
