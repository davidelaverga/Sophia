// A reload in a call offers the way back in one press (docs/plans/call-way-back.md). As the page goes while this person
// is in a project's call, the tab notes it (sessionStorage: this tab only, so another tab of theirs never reads it);
// as the page comes back, the project's room reads it once and offers to rejoin as the call was, its microphone never
// on unless this device's choice is (the join's own cut). Leave first and the page goes out of any call: no note. A
// note older than a dropped call's own window is no offer: the call has moved on.
import { REJOIN_WINDOW_MS } from './call-rejoin.ts'

export const RELOAD_KEY = 'sophia.call.reload.v1'

/** What the tab keeps of the call it was in as the page went. */
export interface ReloadMark {
  project: string
  /** The account it was, so another signing in here is never offered someone else's call. */
  account: string
  at: number
  mic: boolean
  /** Typing to Sophia (text mode): back as it was, so a call being read isn't brought back by voice. */
  textMode: boolean
}

/** The note for this call, as the tab keeps it. */
export const markText = (mark: ReloadMark): string => JSON.stringify(mark)

/** The note the tab kept, for this project and account, if it is one and still recent; null otherwise. */
export function readMark(raw: string | null, project: string, account: string, now: number): ReloadMark | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const at: unknown = Reflect.get(value, 'at')
  const ours: unknown = Reflect.get(value, 'project')
  const whose: unknown = Reflect.get(value, 'account')
  if (ours !== project || whose !== account || typeof at !== 'number') return null
  if (now - at < 0 || now - at > REJOIN_WINDOW_MS) return null
  return {
    project,
    account,
    at,
    mic: Reflect.get(value, 'mic') === true,
    textMode: Reflect.get(value, 'textMode') === true,
  }
}
