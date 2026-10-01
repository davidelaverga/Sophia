// Chat with Sophia, from the chat's foot (Composer): text mode on, into the call in text, and Sophia asked into the
// conversation when she isn't. Ports keep it testable: the room's text mode and join, and the ask.

export interface ChatStartPorts {
  /** The text mode before this start: what the next join would use. */
  textMode: boolean
  setTextMode: (on: boolean) => Promise<void>
  /** Text mode as it is this moment, once the join has settled. */
  textModeNow: () => boolean
  /** Resolves to whether this person is in the call once it settles. */
  join: (options: { textOnly: boolean }) => Promise<boolean>
  /** Asks Sophia into the conversation if none is open. */
  askSophia: () => Promise<void>
}

/**
 * Resolves to whether the chat started. A join that doesn't get in puts text mode back as it was: out of the call its
 * reset (Voice mode) isn't offered, and the dock's Try again would join in it, microphone off and Sophia muted. Unless
 * the pill already went back to voice meanwhile: that is the person's choice. Text mode can also end while the join
 * settles: the microphone a voice join was turning on came on and couldn't go off again (the room's note says so), or
 * the pill went back to voice. Then Sophia isn't asked in: Chat with Sophia starts a typed chat or nothing.
 */
export async function startChat(ports: ChatStartPorts): Promise<boolean> {
  const { textMode, setTextMode, textModeNow, join, askSophia } = ports
  await setTextMode(true)
  if (!(await join({ textOnly: true }))) {
    if (textModeNow()) await setTextMode(textMode)
    return false
  }
  if (!textModeNow()) return false
  await askSophia()
  return true
}
