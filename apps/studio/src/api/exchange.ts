// The room's exchange with Sophia (contract amendment A06): asking her in, and the member controls that
// change only the conversation. None of these touches background work: Stop Speaking stops her voice, End
// ends the exchange, and a running brief carries on either way.
import type { ExchangeReceipt, ExchangeRequest, ExchangeState } from '@sophia/contracts'
import { parseExchangeReceipt, parseExchangeState } from '@sophia/contracts/validate'
import { callApi } from './client.ts'

/** Ask Sophia into the room's conversation. Idempotent per person and key. */
export const startExchange = (
  token: string,
  roomId: string,
  key: string,
  body: ExchangeRequest,
): Promise<ExchangeReceipt> => callApi(`/api/v1/rooms/${roomId}/exchanges`, { token, body, key }, parseExchangeReceipt)

export type ExchangeControl = 'end' | 'stop-speaking' | 'stop-looking' | 'resume'

export const controlExchange = (token: string, exchangeId: string, action: ExchangeControl): Promise<ExchangeState> =>
  callApi(`/api/v1/exchanges/${exchangeId}/${action}`, { token, body: {} }, parseExchangeState)

/** Show Sophia this: your own screen or camera, explicitly chosen; frames reach her at most once a second. */
export const showSophia = (token: string, exchangeId: string, source: 'screen' | 'camera'): Promise<ExchangeState> =>
  callApi(`/api/v1/exchanges/${exchangeId}/look`, { token, body: { source } }, parseExchangeState)
