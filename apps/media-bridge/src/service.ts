// The bridge's client for the private media routes (contract amendment A06). It authenticates with the media-bridge
// capability (a bearer the API compares by hash), never a member's session. Every response is validated against
// the canonical contract before the bridge acts on it: an assignment that does not parse is not an assignment.
import type {
  MediaAnnounced,
  MediaAssignmentBatch,
  MediaHolderEvent,
  MediaPresenceReport,
  MediaQuiesceAck,
  MediaToolCall,
  MediaToolResult,
} from '@sophia/contracts'
import { parseMediaAssignmentBatch, parseMediaToolResult } from '@sophia/contracts/validate'

/** What the bridge asks of the API; tests supply a labelled fake. */
export interface MediaService {
  /** Long-polls: returns at once when `after` is stale, else when assignments change or `waitMs` passes. */
  assignments: (after: string | null, waitMs: number, signal: AbortSignal) => Promise<MediaAssignmentBatch>
  presence: (report: MediaPresenceReport) => Promise<void>
  ackQuiesce: (ack: MediaQuiesceAck) => Promise<void>
  holder: (event: MediaHolderEvent) => Promise<void>
  announced: (event: MediaAnnounced) => Promise<void>
  toolCall: (call: MediaToolCall) => Promise<MediaToolResult>
}

export class ServiceError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Fetch = typeof fetch

export function httpMediaService(baseUrl: string, token: string, fetchImpl: Fetch = fetch): MediaService {
  const base = baseUrl.replace(/\/+$/, '')
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

  async function send(path: string, init: RequestInit): Promise<unknown> {
    const res = await fetchImpl(`${base}${path}`, { ...init, headers })
    if (res.status === 204) return undefined
    const text = await res.text()
    if (!res.ok)
      throw new ServiceError(res.status, `${init.method ?? 'GET'} ${path}: ${res.status} ${text.slice(0, 200)}`)
    return JSON.parse(text) as unknown
  }

  const post = async (path: string, body: unknown): Promise<unknown> =>
    send(path, { method: 'POST', body: JSON.stringify(body) })

  return {
    assignments: async (after, waitMs, signal) => {
      const query = new URLSearchParams({ waitMs: String(waitMs), ...(after ? { after } : {}) })
      return parseMediaAssignmentBatch(
        await send(`/v1/media/assignments?${query.toString()}`, { method: 'GET', signal }),
      )
    },
    presence: async (report) => void (await post('/v1/media/presence', report)),
    ackQuiesce: async (ack) => void (await post('/v1/media/quiesce-acks', ack)),
    holder: async (event) => void (await post('/v1/media/holder', event)),
    announced: async (event) => void (await post('/v1/media/announced', event)),
    toolCall: async (call) => parseMediaToolResult(await post('/v1/media/tool-calls', call)),
  }
}
