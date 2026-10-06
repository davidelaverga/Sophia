// WBC-02 (WBC-02-CX-0037): one HTTP exchange and one bounded wait, for the Paperclip probes and the image
// qualification's container helper. Both settle within their deadline whatever the server does: an absolute timer
// (not an idle one, which a server dripping a byte at a time keeps alive) ends the exchange, and a response that ends,
// errors, is aborted or whose connection closes before it is complete settles it too. A response is read up to a byte
// cap and ended there: the probe runs on the runner, outside the container's cgroup, and a response that never ends
// must not take the runner's memory before the receipt and the scrub (review of 9bc711a).
import { request as httpRequest } from 'node:http'

/** The most of a response body that is read; every answer the probes expect is a few KiB. */
export const MAX_BODY_BYTES = 1024 * 1024

/**
 * One exchange: resolves { status, json, text, cookies } on a complete response, rejects on an error, a response cut
 * short, one past maxBodyBytes, or when timeoutMs has passed since it began, whichever comes first. Never pending past
 * timeoutMs, never holding more than maxBodyBytes of a response.
 */
export function exchange({ host = '127.0.0.1', port, method = 'GET', path = '/', headers = {}, body, timeoutMs, maxBodyBytes = MAX_BODY_BYTES }) {
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
        // Raw bytes, counted as received (a multi-byte character is its bytes, not one), decoded once at the end.
        const chunks = []
        let bytes = 0
        res.on('data', (chunk) => {
          bytes += chunk.length
          if (bytes > maxBodyBytes) {
            // Ended here, whatever remains: destroying the request ends the response being read. Without the error:
            // the promise already carries it, and a socket a complete response has released to the agent's pool has no
            // listener for one.
            settle(fail, new Error(`${method} ${path}: the response passed ${maxBodyBytes} bytes`))
            req.destroy()
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          settle(done, { status: res.statusCode ?? 0, json: parse(text), text, cookies: res.headers['set-cookie'] ?? [] })
        })
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
