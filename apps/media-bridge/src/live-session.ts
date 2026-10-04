// The Gemini Live connection (architecture 06 §5, source ids GG-01, G-01–G-06): Gemini API (never Vertex),
// `@google/genai` 2.24.0, one session per room exchange. Configuration is explicit, never a model default:
// audio responses; input and output transcription for attribution; context-window compression triggered at
// 25,000 tokens with an 8,000-token sliding window (the SDK takes these as strings); session resumption on
// every connection, with the latest handle kept by the caller; tools NON_BLOCKING (tools.ts). No Extended
// Thinking configuration and no `proactivity: false` (3.8 proactivity is not our privacy mechanism).
// The system instruction and the tool declarations are the caller's: the guide's exact bytes (guide.ts) and its
// version's declarations (tools.ts), the same on every connection.
// The API key stays in this process; it is never logged or sent to a browser.
import {
  GoogleGenAI,
  Modality,
  type FunctionDeclaration,
  type FunctionResponse,
  type LiveServerMessage,
  type Session,
} from '@google/genai'
import { INPUT_MIME, pcmToBase64 } from './audio.ts'
import { dispatchServerMessage, type LiveHandlers } from './live-messages.ts'

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
  /** The exact provider-facing system instruction: the checked M01 guide, never assembled per connection. */
  systemInstruction: string
  /** The guide version's function declarations (tools.ts), checked against its manifest and the API's surface. */
  tools: readonly FunctionDeclaration[]
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

/**
 * A Gemini Live connector. `baseUrl` points the SDK at another endpoint (a local server in the setup-frame test);
 * production uses the SDK's own.
 */
export function geminiLive(opts: { baseUrl?: string } = {}): ConnectLive {
  return async (options, events) => {
    const ai = new GoogleGenAI({
      apiKey: options.apiKey,
      ...(opts.baseUrl ? { httpOptions: { baseUrl: opts.baseUrl } } : {}),
    })
    const session: Session = await ai.live.connect({
      model: options.model,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: { triggerTokens: '25000', slidingWindow: { targetTokens: '8000' } },
        sessionResumption: options.resumptionHandle ? { handle: options.resumptionHandle } : {},
        systemInstruction: options.systemInstruction,
        tools: [{ functionDeclarations: [...options.tools] }],
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
}

export const connectGeminiLive: ConnectLive = geminiLive()
