// One Idempotency-Key per user intent (api/README): kept for an explicit retry after an unknown
// outcome, discarded as soon as the server answers definitively. Never retries on its own.
import { useRef, useState } from 'react'
import { ApiError } from './client.ts'

export type AdmissionState<A, R> =
  | { status: 'idle' }
  | { status: 'sending'; args: A }
  | { status: 'done'; args: A; result: R }
  /** No reply: the request may have been recorded. Retry reuses the same key. */
  | { status: 'unknown'; args: A }
  | { status: 'rejected'; args: A; error: ApiError }

export interface Admission<A, R> {
  state: AdmissionState<A, R>
  /** New intent, new key. Resolves to the result, or undefined when not admitted. */
  submit: (args: A) => Promise<R | undefined>
  /** Same intent, same key, after an unknown outcome. */
  retry: () => Promise<R | undefined>
  reset: () => void
}

const noReply = () => new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key')

export function useAdmission<A, R>(send: (key: string, args: A) => Promise<R>): Admission<A, R> {
  const [state, setState] = useState<AdmissionState<A, R>>({ status: 'idle' })
  const key = useRef<string | null>(null)

  const run = async (args: A, intentKey: string): Promise<R | undefined> => {
    key.current = intentKey
    setState({ status: 'sending', args })
    try {
      const result = await send(intentKey, args)
      key.current = null
      setState({ status: 'done', args, result })
      return result
    } catch (err: unknown) {
      const error = err instanceof ApiError ? err : noReply()
      if (error.retry === 'same_admission_key') {
        setState({ status: 'unknown', args })
      } else {
        key.current = null
        setState({ status: 'rejected', args, error })
      }
      return undefined
    }
  }

  return {
    state,
    submit: (args) => run(args, crypto.randomUUID()),
    retry: () =>
      state.status === 'unknown' && key.current ? run(state.args, key.current) : Promise.resolve(undefined),
    reset: () => setState({ status: 'idle' }),
  }
}
