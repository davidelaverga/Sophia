import { useState } from 'react'
import { ApiError } from '../../api/client.ts'
import { useAdmission, type Resumed } from '../../api/useAdmission.ts'
import { keepHeld, readHeld, type HeldAt } from '../../app/held-in-tab.ts'

function restore<A>(at: HeldAt, read: (input: unknown) => A): Resumed<A> | null {
  const held = readHeld(at)
  if (typeof held !== 'object' || held === null) return null
  const key: unknown = Reflect.get(held, 'key')
  if (typeof key !== 'string') return null
  try {
    return { key, args: read(Reflect.get(held, 'args')) }
  } catch {
    return null
  }
}

/** Paid admissions and approvals keep the original intent and key through a reload with no reply. */
export function useExploreAdmission<A, R>(
  at: HeldAt,
  read: (input: unknown) => A,
  send: (key: string, args: A) => Promise<R>,
) {
  const [resumed] = useState(() => restore(at, read))
  return useAdmission(async (key, args: A) => {
    keepHeld(at, { key, args })
    try {
      const result = await send(key, args)
      keepHeld(at, null)
      return result
    } catch (error: unknown) {
      if (error instanceof ApiError && error.retry !== 'same_admission_key') keepHeld(at, null)
      throw error
    }
  }, resumed)
}
