// What a view keeps while the page lives, beyond any one mount of it: a panel closed and opened again, a goal chosen
// and back, and it is as it was. Followed as it changes (useSyncExternalStore). A reload starts afresh.
import { useSyncExternalStore } from 'react'

export interface PageMemory<T> {
  get: (key: string) => T | null
  set: (key: string, value: T) => void
  subscribe: (listener: () => void) => () => void
}

export function pageMemory<T>(): PageMemory<T> {
  const kept = new Map<string, T>()
  const listeners = new Set<() => void>()
  return {
    get: (key) => kept.get(key) ?? null,
    set: (key, value) => {
      kept.set(key, value)
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** What a page memory keeps under a key, followed as it changes; null when nothing is. */
export const useMemory = <T>(memory: PageMemory<T>, key: string) =>
  useSyncExternalStore(memory.subscribe, () => memory.get(key))
