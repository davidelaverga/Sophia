import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Fastify from 'fastify'
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { searchRoutes } from './routes/search.ts'
import { SEARCH_IN_FLIGHT, SEARCH_PER_ACTOR, SearchAdmission } from './search-admission.ts'

// SEC 4306450775: at most 2 searches at once in a process and 1 per verified actor, no queue, refused before any
// database client is asked for, and a permit held until the search's own work settles.
const A = '00000000-0000-4000-8000-0000000000a1'
const B = '00000000-0000-4000-8000-0000000000b1'
const C = '00000000-0000-4000-8000-0000000000c1'
const P = '00000000-0000-4000-8000-0000000000aa'

describe('search admission', () => {
  it('2 at once, 1 per actor, no queue; a release is idempotent and leaves no bookkeeping', () => {
    assert.deepEqual([SEARCH_IN_FLIGHT, SEARCH_PER_ACTOR], [2, 1])
    const admission = new SearchAdmission()
    const a = admission.admit(A)
    assert.throws(
      () => admission.admit(A),
      (e: unknown) => e instanceof DomainError && e.code === 'unavailable',
    )
    const b = admission.admit(B)
    assert.throws(
      () => admission.admit(C),
      (e: unknown) => e instanceof DomainError && e.code === 'unavailable',
    )
    a()
    a()
    assert.deepEqual(admission.state, { inFlight: 1, actors: 1 })
    admission.admit(C)()
    b()
    assert.deepEqual(admission.state, { inFlight: 0, actors: 0 })
  })

  it('the route: excess refused before the pool is asked; the permit holds until the work settles, then reopens', async () => {
    // A pool whose clients are handed out only when the test says (an unsettled search), or fail (an error).
    const waiting: { resolve: (c: pg.PoolClient) => void; reject: (e: Error) => void }[] = []
    let connects = 0
    const pool = {
      connect: () => {
        connects += 1
        return new Promise<pg.PoolClient>((resolve, reject) => waiting.push({ resolve, reject }))
      },
    } as unknown as pg.Pool
    const admission = new SearchAdmission()
    const app = Fastify()
    // The route's reply schema (never reached here: every search below is refused or fails before it answers).
    app.addSchema({ $id: 'SearchPage', type: 'object' })
    app.decorateRequest('actorId', '')
    // The verified subject, whatever the token: here the x-actor header stands for it.
    app.addHook('onRequest', (req, _reply, done) => {
      req.actorId = String(req.headers['x-actor'])
      done()
    })
    app.setErrorHandler((err, _req, reply) =>
      reply.status(err instanceof DomainError && err.code === 'unavailable' ? 503 : 500).send({ code: 'x' }),
    )
    searchRoutes(app, { pool, admission })
    const ask = (actor: string, token: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/projects/${P}/search?q=pond`,
        headers: { 'x-actor': actor, authorization: token },
      })

    const first = ask(A, 'Bearer one')
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(connects, 1, 'admitted: its client is asked for')
    // The same verified actor with another token shares its bound: refused before any client is asked for.
    assert.equal((await ask(A, 'Bearer two')).statusCode, 503)
    assert.equal(connects, 1)
    const second = ask(B, 'Bearer three')
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(connects, 2)
    // Aggregate bound: a third actor is refused before the pool, and nothing waits in a queue.
    assert.equal((await ask(C, 'Bearer four')).statusCode, 503)
    assert.equal(connects, 2)
    assert.deepEqual(admission.state, { inFlight: 2, actors: 2 })
    // Settled with an error (the client could not be had): the permit goes, and that actor may search again.
    waiting[0]!.reject(new Error('connection refused'))
    // (A client that can't be had is the API's «unavailable» too; it was asked for, unlike the refused ones above.)
    assert.equal((await first).statusCode, 503)
    assert.deepEqual(admission.state, { inFlight: 1, actors: 1 })
    waiting[1]!.reject(new Error('connection refused'))
    await second
    assert.deepEqual(admission.state, { inFlight: 0, actors: 0 })
    await app.close()
  })
})
