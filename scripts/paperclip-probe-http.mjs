// WBC-02 (WBC-02-CX-0037): one HTTP exchange and one bounded wait, for the Paperclip probes and the image
// qualification's container helper. Both settle within their deadline whatever the server does: an absolute timer
// (not an idle one, which a server dripping a byte at a time keeps alive) ends the exchange, and a response that ends,
// errors, is aborted or whose connection closes before it is complete settles it too.
import { request as httpRequest } from 'node:http'

/**
 * One exchange: resolves { status, json, text, cookies } on a complete response, rejects on an error, a response cut
 * short, or when timeoutMs has passed since it began, whichever comes first. Never pending past timeoutMs.
 */
export function exchange({ host = '127.0.0.1', port, method = 'GET', path = '/', headers = {}, body, timeoutMs }) {
  return new Promise((done, fail) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    let settled = false
    let timer = null
    const settle = (act, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      act(value)
    }
    const req = httpRequest(
      { host, port, method, path, headers: { ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...headers } },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () =>
          settle(done, { status: res.statusCode ?? 0, json: parse(text), text, cookies: res.headers['set-cookie'] ?? [] }),
        )
        res.on('error', (error) => settle(fail, error))
        res.on('aborted', () => settle(fail, new Error(`${method} ${path}: the response was cut short`)))
        res.on('close', () => {
          if (!res.complete) settle(fail, new Error(`${method} ${path}: the connection closed before the response was complete`))
        })
      },
    )
    // An absolute deadline from the start of the exchange; destroying the request also ends a response being read.
    timer = setTimeout(() => {
      const error = new Error(`${method} ${path}: no complete answer in ${timeoutMs / 1000} s`)
      settle(fail, error)
      req.destroy(error)
    }, timeoutMs)
    req.on('error', (error) => settle(fail, error))
    req.on('close', () => settle(fail, new Error(`${method} ${path}: the connection closed without a response`)))
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

/**
 * Waits for check() to return a truthy value, polling every second, and fails once timeoutMs has passed: each check is
 * raced against the time left, so a check that never settles cannot hold the wait past its deadline.
 */
export async function until(what, check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  const expired = () => new Error(`timed out waiting for ${what} (${Math.round(timeoutMs / 1000)} s)`)
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw expired()
    let timer = null
    const value = await Promise.race([
      Promise.resolve(check()).finally(() => clearTimeout(timer)),
      new Promise((_, fail) => {
        timer = setTimeout(() => fail(expired()), remaining)
      }),
    ])
    if (value) return value
    const left = deadline - Date.now()
    if (left <= 0) throw expired()
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000, left)))
  }
}

function parse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
