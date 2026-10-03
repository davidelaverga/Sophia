// How each viewer last looked at the Resources view (its filter and its order), kept in this browser only, so the
// view opens as they left it. A convenience: when the browser keeps nothing (a private window, storage refused), the
// view opens as All, by attention.
import { ORDERS, type Order } from './order.ts'
import { FILTERS, type Filter } from './resource.ts'

export interface Prefs {
  filter: Filter
  order: Order
  /** The order the viewer arranged by hand: resource ids, first to last. */
  custom: string[]
}

export const DEFAULT_PREFS: Prefs = { filter: 'all', order: 'attention', custom: [] }

/** One key per viewer: who signs in on a shared browser gets their own. */
export const prefsKey = (viewerId: string) => `sophia.resources.v1.${viewerId}`

type Store = Pick<Storage, 'getItem' | 'setItem'>

const isFilter = (v: unknown): v is Filter => FILTERS.some((f) => f === v)
const isOrder = (v: unknown): v is Order => ORDERS.some((o) => o === v)

function browserStore(): Store | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** What the viewer left, each part checked; anything unreadable or unknown falls back to the default. */
export function readPrefs(viewerId: string, store: Store | null = browserStore()): Prefs {
  try {
    const kept: unknown = JSON.parse(store?.getItem(prefsKey(viewerId)) ?? 'null')
    if (typeof kept !== 'object' || kept === null) return DEFAULT_PREFS
    const filter: unknown = Reflect.get(kept, 'filter')
    const order: unknown = Reflect.get(kept, 'order')
    const custom: unknown = Reflect.get(kept, 'custom')
    return {
      filter: isFilter(filter) ? filter : DEFAULT_PREFS.filter,
      order: isOrder(order) ? order : DEFAULT_PREFS.order,
      custom: Array.isArray(custom) ? custom.filter((id): id is string => typeof id === 'string') : [],
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(viewerId: string, prefs: Prefs, store: Store | null = browserStore()): void {
  try {
    store?.setItem(prefsKey(viewerId), JSON.stringify(prefs))
  } catch {
    // Storage full or refused: the view still works, it just won't remember.
  }
}
