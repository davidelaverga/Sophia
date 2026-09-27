// The Gemini Live connection (architecture 06 §5, source ids GG-01, G-01–G-06): Gemini API (never Vertex),
// `@google/genai` 2.24.0, one session per room exchange. Configuration is explicit, never a model default:
// audio responses; input and output transcription for attribution; context-window compression triggered at
// 25,000 tokens with an 8,000-token sliding window (the SDK takes these as strings); session resumption on
// every connection, with the latest handle kept by the caller; tools NON_BLOCKING (tools.ts). No Extended
// Thinking configuration and no `proactivity: false` (3.8 proactivity is not our privacy mechanism).
// The API key stays in this process; it is never logged or sent to a browser.
import { GoogleGenAI, Modality, type FunctionResponse, type LiveServerMessage, type Session } from '@google/genai'
import { INPUT_MIME, pcmToBase64 } from './audio.ts'
import { dispatchServerMessage, type LiveHandlers } from './live-messages.ts'
import { TOOL_DECLARATIONS } from './tools.ts'

/** What the room session needs from a provider connection; tests supply a labelled fake. */
export interface LiveLink {
  sendAudio: (chunk: Int16Array) => void
  /** The holder stopped (handoff or pause): Google flushes what it buffered for this turn. */
  sendAudioStreamEnd: () => void
  sendFrame: (jpeg: Buffer) => void
  sendToolResponses: (responses: FunctionResponse[]) => void
  /**
   * A notice Sophia answers now (a finished background result). Sent as realtime text: mid-conversation client
   * content is reserved for seeding initial history on the 3.x Live route.
   */
  sendNotice: (text: string) => void
  close: () => void
}

export interface LiveOptions {
  apiKey: string
  model: string
  systemInstruction: string
  /** A handle from an earlier connection of the SAME exchange; null opens a fresh session. */
  resumptionHandle: string | null
}

export interface LiveEvents extends LiveHandlers {
  /** The connection closed (after GoAway, an error or our close). */
  closed: (reason: string) => void
}

export type ConnectLive = (options: LiveOptions, events: LiveEvents) => Promise<LiveLink>

const errorText = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string'
    ? e.message
    : 'connection error'

export const connectGeminiLive: ConnectLive = async (options, events) => {
  const ai = new GoogleGenAI({ apiKey: options.apiKey })
  const session: Session = await ai.live.connect({
    model: options.model,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { triggerTokens: '25000', slidingWindow: { targetTokens: '8000' } },
      sessionResumption: options.resumptionHandle ? { handle: options.resumptionHandle } : {},
      systemInstruction: options.systemInstruction,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    },
    callbacks: {
      onmessage: (msg: LiveServerMessage) => dispatchServerMessage(msg, events),
      onerror: (e: unknown) => events.closed(`error: ${errorText(e)}`),
      onclose: (e) => events.closed(`closed: ${e.reason || String(e.code)}`),
    },
  })
  return {
    sendAudio: (chunk) => session.sendRealtimeInput({ audio: { data: pcmToBase64(chunk), mimeType: INPUT_MIME } }),
    sendAudioStreamEnd: () => session.sendRealtimeInput({ audioStreamEnd: true }),
    sendFrame: (jpeg) =>
      session.sendRealtimeInput({ video: { data: jpeg.toString('base64'), mimeType: 'image/jpeg' } }),
    sendToolResponses: (functionResponses) => session.sendToolResponse({ functionResponses }),
    sendNotice: (text) => session.sendRealtimeInput({ text }),
    close: () => session.close(),
  }
}

/**
 * Who Sophia is in the room, and what she may and may not do there. A connection that could not resume starts
 * cold: it says so, and Sophia reads current project records instead of assuming earlier dialogue.
 */
export function systemInstruction(restored: boolean): string {
  return [
    'You are Sophia, a calm, concise collaborator in a small team’s shared voice room for one project.',
    'Several people share the room; you hear only the person who holds the floor. Never guess who is speaking from a name you hear.',
    'Use project_status before talking about the project’s work. Use read_selected_source for exact text; what you see on a shared screen is an observation, not the source.',
    'Start a brief (start_brief) or hold, resume or stop work (control_work) ONLY when the speaker explicitly asks. Discussion alone never starts work.',
    'When a tool says work was admitted, say it was started and that the result comes later; never claim it is done.',
    'If a tool asks you to clarify, ask the speaker plainly. If work is refused, say why in one sentence.',
    'Being asked to stop talking never stops background work.',
    ...(restored
      ? [
          'Your connection was restored without the earlier conversation. Call project_status before discussing the work.',
        ]
      : []),
  ].join('\n')
}
