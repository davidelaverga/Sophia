// One choice at a time across the whole gallery: while one is being saved, no other candidate offers Choose, even
// after Back or Esc, so two choices never race on the same revision. The outcome is kept here, not in the detail
// that asked, so it outlives that detail.
import { useRef, useState } from 'react'

export type Choose = (candidateId: string, expectedRevision: number) => Promise<void>

export interface SerialChoice {
  /** The candidate whose choice is being saved, or null. */
  choosing: string | null
  /** The last choice that wasn't confirmed, in words. */
  failed: { candidateId: string; text: string } | null
  /** Resolves to whether the choice held; false at once while another is being saved. */
  choose: (candidateId: string) => Promise<boolean>
}

export function useSerialChoice(revision: number, onChoose: Choose): SerialChoice {
  const pending = useRef<string | null>(null)
  const [choosing, setChoosing] = useState<string | null>(null)
  const [failed, setFailed] = useState<SerialChoice['failed']>(null)
  const choose = async (candidateId: string) => {
    if (pending.current !== null) return false
    pending.current = candidateId
    setChoosing(candidateId)
    setFailed(null)
    try {
      await onChoose(candidateId, revision)
      return true
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : 'The choice wasn’t confirmed. Nothing else was asked.'
      setFailed({ candidateId, text })
      return false
    } finally {
      pending.current = null
      setChoosing(null)
    }
  }
  return { choosing, failed, choose }
}
