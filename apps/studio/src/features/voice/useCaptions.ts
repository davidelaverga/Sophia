import { useState } from 'react'
import type { ChatCaption } from '@sophia/contracts/room-chat'
import { closeCaptions, receiveCaption, type CaptionTurn } from '../conversation/captions.ts'
import type { Arrivals } from '../conversation/chat-view.ts'

/**
 * Live captions of what is said aloud (CX-0023), kept in memory for the page: closing the chat, switching mode, leaving
 * and joining again keep them; nothing writes them anywhere, and nothing sends them back as a typed request.
 */
export function useCaptions(arrival: Arrivals) {
  const [captions, setCaptions] = useState<CaptionTurn[]>([])
  const onCaption = (packet: ChatCaption) => {
    const at = arrival.next()
    setCaptions((turns) => receiveCaption(turns, packet, at))
  }
  /**
   * Out of the call, or what was being said may never end here (Sophia left or joined again, this connection is
   * reconnecting): it is shown cut off, until more of it comes (closeCaptions).
   */
  const interrupted = () => setCaptions(closeCaptions)
  return { captions, onCaption, interrupted }
}
