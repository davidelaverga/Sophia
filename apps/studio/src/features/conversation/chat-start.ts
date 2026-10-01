// Chat with Sophia, from the chat's foot (Composer): text mode on, into the call in text, and Sophia asked into the
// conversation when she isn't. Ports keep it testable: the room's text mode and join, and the ask.

export interface ChatStartPorts {
  /** The text mode before this start: what the next join would use. */
  textMode: boolean
  setTextMode: (on: boolean) => Promise<void>
  /** Resolves to whether this person is in the call once it settles. */
  join: (options: { textOnly: boolean }) => Promise<boolean>
  /** Asks Sophia into the conversation if none is open. */
  askSophia: () => Promise<void>
}

/**
 * Resolves to whether the chat started. A join that doesn't get in puts text mode back as it was: out of the call its
 * reset (Voice mode) isn't offered, and the dock's Try again would join in it, microphone off and Sophia muted.
 */
export async function startChat({ textMode, setTextMode, join, askSophia }: ChatStartPorts): Promise<boolean> {
  await setTextMode(true)
  if (!(await join({ textOnly: true }))) {
    await setTextMode(textMode)
    return false
  }
  await askSophia()
  return true
}
