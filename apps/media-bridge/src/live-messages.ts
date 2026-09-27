// One Gemini Live server message, handled field by field (architecture 06 §8). A message can carry several
// meaningful fields at once (a tool call with a transcription, audio with a resumption update); an `else if`
// chain would drop all but one. Each present field reaches its handler, in an order that keeps generations
// honest: an interruption is applied before any audio in the same message, and audio before turn completion.
import type { FunctionCall, LiveServerContent, LiveServerMessage, UsageMetadata } from '@google/genai'

export interface LiveHandlers {
  setupComplete: () => void
  toolCalls: (calls: FunctionCall[]) => void
  toolCancellations: (ids: string[]) => void
  interrupted: () => void
  audio: (data: string, mimeType: string | undefined) => void
  inputTranscript: (text: string, finished: boolean) => void
  outputTranscript: (text: string, finished: boolean) => void
  generationComplete: () => void
  turnComplete: () => void
  goAway: (timeLeft: string | undefined) => void
  resumption: (handle: string | null, resumable: boolean) => void
  usage: (usage: UsageMetadata) => void
}

function transcripts(content: LiveServerContent, h: LiveHandlers): void {
  const input = content.inputTranscription
  const output = content.outputTranscription
  if (input?.text) h.inputTranscript(input.text, input.finished === true)
  if (output?.text) h.outputTranscript(output.text, output.finished === true)
}

function serverContent(content: LiveServerContent | undefined, h: LiveHandlers): void {
  if (!content) return
  if (content.interrupted) h.interrupted()
  for (const part of content.modelTurn?.parts ?? []) {
    if (part.inlineData?.data) h.audio(part.inlineData.data, part.inlineData.mimeType)
  }
  transcripts(content, h)
  if (content.generationComplete) h.generationComplete()
  if (content.turnComplete) h.turnComplete()
}

function session(msg: LiveServerMessage, h: LiveHandlers): void {
  if (msg.goAway) h.goAway(msg.goAway.timeLeft)
  const update = msg.sessionResumptionUpdate
  if (update) h.resumption(update.resumable && update.newHandle ? update.newHandle : null, update.resumable === true)
  if (msg.usageMetadata) h.usage(msg.usageMetadata)
}

export function dispatchServerMessage(msg: LiveServerMessage, h: LiveHandlers): void {
  if (msg.setupComplete) h.setupComplete()
  if (msg.toolCall?.functionCalls?.length) h.toolCalls(msg.toolCall.functionCalls)
  if (msg.toolCallCancellation?.ids?.length) h.toolCancellations(msg.toolCallCancellation.ids)
  serverContent(msg.serverContent, h)
  session(msg, h)
}
