/**
 * The research tools (SMC-M03 S4 part 2) against a fake Sophia service and fake providers: what each tool reserves,
 * settles and captures, what never leaves the host (a disclosed query, an ineligible address), and what the model is
 * told. No network: the service, Tavily, Jina and DNS are local doubles.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchTools, callKeyOf, clampBytes, linksOf, SEARCH_RESERVE_USD, TAVILY_CREDIT_USD } from '../../packages/dsh-bundle/dist/research-tools.js'
import { costOfUsage, estimateCallUsd, estimateInputTokens } from '../../packages/dsh-bundle/dist/control-bridge.js'
import { SourceError, cutText } from '../../packages/dsh-bundle/dist/source-errors.js'
import { TransportError } from '../../packages/dsh-bundle/dist/transport.js'

const SESSION = { attemptId: '11111111-1111-4111-8111-111111111111', nativeSessionId: 'sophia-11111111-1111-4111-8111-111111111111' }
const INPUT = '22222222-2222-4222-8222-222222222222'
const PRIVATE = 'The acquisition of Northwind closes on 12 November pending the final audit.'

/** A fake service: the task, its one input, reservations, settlements, captures and drafts, all recorded. */
function fakeService(overrides = {}) {
  const calls = []
  const stored = new Map([[INPUT, PRIVATE]])
  let n = 0
  const client = {
    async researchContext(body) {
      calls.push(['context', body])
      if (overrides.context) return overrides.context(body)
      if (body.sourceId === undefined) {
        return {
          taskId: 't', rootTaskId: 't', question: 'Which sandboxes do PDF renderers use?', outputs: ['markdown'], preferences: {}, assumptions: [],
          inputs: [{ ref: `input:${INPUT}`, sourceId: INPUT, sha256: 'a'.repeat(64), mime: 'text/plain', byteLength: PRIVATE.length }],
          urls: [], base: null, allowance: { capUsd: 5, headroomUsd: 0.5, committedUsd: 0, searchesLeft: 5, readsLeft: 8 }, draft: null,
          roster: [{ name: 'Giulia Rossi', email: 'giulia@example.com' }],
        }
      }
      const text = stored.get(body.sourceId) ?? ''
      const offset = body.offset ?? 0
      const page = text.slice(offset, offset + 6000)
      return { sourceId: body.sourceId, offset, nextOffset: offset + 6000 < text.length ? offset + 6000 : null, totalChars: text.length, truncated: offset + 6000 < text.length, text: page }
    },
    async researchReserve(body) {
      calls.push(['reserve', body])
      if (overrides.reserve) return overrides.reserve(body)
      n += 1
      return { reservationId: `r-${n}`, state: 'reserved', kind: body.kind, purpose: body.purpose ?? 'call', amountUsd: body.amountUsd, target: body.kind === 'read' ? { ref: body.targetRef, url: overrides.readUrl ?? 'https://hosts.example.org/a' } : null }
    },
    async researchSettle(body) {
      calls.push(['settle', body])
      return { reservationId: body.reservationId, state: body.outcome, settledUsd: body.costUsd ?? null }
    },
    async researchCapture(body) {
      calls.push(['capture', body])
      const sourceId = '33333333-3333-4333-8333-333333333333'
      if (body.kind === 'web_read') stored.set(sourceId, body.text)
      const count = body.kind === 'search_results' ? body.results.length : (body.links ?? []).length
      const prefix = body.kind === 'search_results' ? 'search' : 'link'
      return { sourceId, sha256: 'b'.repeat(64), byteLength: 10, kind: body.kind, refs: Array.from({ length: count }, (_, i) => `${prefix}:${sourceId}#${i + 1}`) }
    },
    async researchDraft(body) {
      calls.push(['draft', body])
      if (overrides.draft) return overrides.draft(body)
      return { sourceId: '44444444-4444-4444-8444-444444444444', sha256: 'c'.repeat(64), seq: 1 }
    },
    async researchSubmit(body) {
      calls.push(['submit', body])
      if (overrides.submit) return overrides.submit(body)
      return body.result
        ? { taskId: 't', outcome: 'published', artifactId: 'a', versionId: 'v', versionNumber: 1, sourceId: 's', sha256: body.result.draftSha256, resultSourceId: 'r' }
        : { taskId: 't', outcome: 'blocked', resultSourceId: 'r' }
    },
  }
  return { client, calls, kinds: () => calls.map(([k]) => k) }
}

function fakeSources({ search, read, addresses = ['93.184.215.14'] } = {}) {
  const used = { searches: 0, reads: 0, resolved: 0 }
  return {
    used,
    sources: {
      search: {
        async searchWithReceipt(request) {
          used.searches += 1
          if (search) return search(request)
          return { provider: 'tavily', query: request.query, requestId: 'req_1', credits: 1, responseTimeSeconds: 0.4, providerHttpStatus: 200,
            results: [{ rank: 1, url: 'https://hosts.example.org/a', title: 'Hosts', snippet: 'Sandboxed rendering', score: 0.9 }] }
        },
      },
      read: {
        async read(url) {
          used.reads += 1
          if (read) return read(url)
          return { provider: 'jina', requestedUrl: url, providerHttpStatus: 200, originHttpStatus: null, reportedFinalUrl: null, title: 'Hosts', publishedAt: null,
            content: '# Hosts\nSee [the sandbox](https://hosts.example.org/sandbox) and [again](https://hosts.example.org/sandbox).', coverage: 'complete', truncated: false, tokens: 1200, binaryKind: null,
            limitations: ['redirects: unverifiable (hosted extractor reports the requested URL only)'] }
        },
      },
      resolve: async () => { used.resolved += 1; return addresses },
    },
  }
}

const exec = (callId = 'call_1') => ({ callId, name: 'x', arguments: {}, signal: new AbortController().signal })

function tools(service, sources, session = SESSION) {
  const lines = []
  const list = researchTools({ client: service.client, sources: sources.sources, sessionOf: () => session, log: (l) => lines.push(l) })
  return { byName: Object.fromEntries(list.map((t) => [t.name, t])), lines }
}

test('research_read_context: the task without the guard roster, and a page of an input in its untrusted envelope', async () => {
  const service = fakeService()
  const { byName } = tools(service, fakeSources())
  const task = await byName.research_read_context.execute({}, exec())
  assert.equal(task.question, 'Which sandboxes do PDF renderers use?')
  assert.equal('roster' in task, false, 'the roster is the guard\'s, not the model\'s')
  const page = await byName.research_read_context.execute({ sourceId: INPUT, offset: 0 }, exec())
  assert.match(page, /^<sophia-source id="22222222-[^"]*" kind="admitted_input" trust="untrusted" offset="0" next_offset="none">/)
  assert.match(page, /Northwind/)
})

test('research_search: a query carrying input text or a roster member never leaves the host', async () => {
  const service = fakeService()
  const sources = fakeSources()
  const { byName } = tools(service, sources)
  const leaked = await byName.research_search.execute({ query: 'acquisition of northwind closes on 12 november' }, exec())
  assert.deepEqual([leaked.code, leaked.reason], ['disclosure_denied', 'private_span'])
  const person = await byName.research_search.execute({ query: 'giulia rossi sandbox' }, exec())
  assert.deepEqual([person.code, person.reason], ['disclosure_denied', 'roster'])
  assert.equal(sources.used.searches, 0)
  assert.equal(service.kinds().includes('reserve'), false, 'nothing reserved')
})

test('research_search: reserve, search, settle from the credits reported, capture, and the results as refs', async () => {
  const service = fakeService()
  const sources = fakeSources()
  const { byName } = tools(service, sources)
  const out = await byName.research_search.execute({ query: 'pdf rendering sandbox' }, exec('call_9'))
  assert.deepEqual(service.kinds().filter((k) => k !== 'context'), ['reserve', 'settle', 'capture'])
  const reserve = service.calls.find(([k]) => k === 'reserve')[1]
  assert.deepEqual([reserve.kind, reserve.provider, reserve.amountUsd, reserve.query, reserve.callId], ['search', 'tavily', SEARCH_RESERVE_USD, 'pdf rendering sandbox', 'call_9'])
  const settle = service.calls.find(([k]) => k === 'settle')[1]
  assert.deepEqual([settle.outcome, settle.costUsd, settle.providerRequestId], ['settled', TAVILY_CREDIT_USD, 'req_1'])
  assert.match(out, /kind="search_result" trust="untrusted"/)
  assert.match(out, /search:33333333-3333-4333-8333-333333333333#1 https:\/\/hosts\.example\.org\/a/)
})

test('research_search: a refused call is released, an unknown outcome stays uncertain, and nothing is captured', async () => {
  for (const [code, outcome] of [['rate_limited', 'released'], ['invalid_key', 'released'], ['timeout', 'uncertain'], ['upstream_unavailable', 'uncertain']]) {
    const service = fakeService()
    const { byName } = tools(service, fakeSources({ search: () => { throw new SourceError(code, 'x') } }))
    const out = await byName.research_search.execute({ query: 'public question' }, exec())
    assert.equal(out.code, code)
    assert.equal(service.calls.find(([k]) => k === 'settle')[1].outcome, outcome, code)
    assert.equal(service.kinds().includes('capture'), false)
  }
})

test('the service\'s refusals reach the model as one sentence, and no provider is called', async () => {
  const service = fakeService({ reserve: () => { throw new TransportError('POST /v1/runtime/research/reserve answered 409 research_limit_reached', 409, 'research_limit_reached') } })
  const sources = fakeSources()
  const { byName } = tools(service, sources)
  const out = await byName.research_search.execute({ query: 'public question' }, exec())
  assert.equal(out.code, 'research_limit_reached')
  assert.match(out.message, /write up what you have/)
  assert.equal(sources.used.searches, 0)
  const held = fakeService({ reserve: () => { throw new TransportError('held', 409, 'invalid_state') } })
  const readOut = await tools(held, sources).byName.research_read_source.execute({ ref: 'search:33333333-3333-4333-8333-333333333333#1' }, exec())
  assert.equal(readOut.code, 'invalid_state')
  assert.equal(sources.used.reads, 0)
})

test('research_read_source: the target the service resolved passes eligibility before the extractor sees it', async () => {
  const service = fakeService()
  const privateDns = fakeSources({ addresses: ['93.184.215.14', '10.0.0.5'] })
  const out = await tools(service, privateDns).byName.research_read_source.execute({ ref: 'search:33333333-3333-4333-8333-333333333333#1' }, exec())
  assert.deepEqual([out.code, out.reason], ['ineligible', 'private_address'])
  assert.equal(privateDns.used.reads, 0, 'the extractor never saw it')
  assert.equal(service.calls.find(([k]) => k === 'settle')[1].outcome, 'released')

  const signed = fakeService({ readUrl: 'https://x.supabase.co/storage/v1/object/sign/private/r.md?token=abc' })
  const plain = fakeSources()
  const refused = await tools(signed, plain).byName.research_read_source.execute({ ref: 'link:33333333-3333-4333-8333-333333333333#2' }, exec())
  assert.deepEqual([refused.code, refused.reason], ['ineligible', 'signed_url'])
  assert.deepEqual([plain.used.resolved, plain.used.reads], [0, 0], 'refused from the URL alone')
})

test('research_read_source: read, settle from tokens, capture with its links, then the first page in its envelope', async () => {
  const service = fakeService()
  const sources = fakeSources()
  const out = await tools(service, sources).byName.research_read_source.execute({ ref: 'search:33333333-3333-4333-8333-333333333333#1' }, exec())
  const reserve = service.calls.find(([k]) => k === 'reserve')[1]
  assert.deepEqual([reserve.kind, reserve.provider, reserve.targetRef], ['read', 'jina', 'search:33333333-3333-4333-8333-333333333333#1'])
  const settle = service.calls.find(([k]) => k === 'settle')[1]
  assert.deepEqual([settle.outcome, settle.costUsd], ['settled', 0.00006])
  const capture = service.calls.find(([k]) => k === 'capture')[1]
  assert.deepEqual([capture.kind, capture.coverage, capture.links, capture.providerHttpStatus, capture.originHttpStatus, capture.title], [
    'web_read', 'complete', ['https://hosts.example.org/sandbox'], 200, null, 'Hosts',
  ])
  assert.match(out, /kind="web_page" trust="untrusted" coverage="complete" offset="0" next_offset="none"/)
  assert.match(out, /url: https:\/\/hosts\.example\.org\/a/)
  assert.match(out, /limitation: links: link:33333333-3333-4333-8333-333333333333#1 to #1/)
})

test('research_read_source: a binary is not read and its reservation is released', async () => {
  const service = fakeService()
  const sources = fakeSources({ read: (url) => ({ provider: 'jina', requestedUrl: url, providerHttpStatus: null, originHttpStatus: null, reportedFinalUrl: null, title: null, publishedAt: null, content: '', coverage: 'unsupported', truncated: false, tokens: null, binaryKind: 'pdf', limitations: ['pdf: not read in the pilot; the report may cite it only as unread'] }) })
  const out = await tools(service, sources).byName.research_read_source.execute({ ref: 'search:33333333-3333-4333-8333-333333333333#1' }, exec())
  assert.equal(out.code, 'unsupported')
  assert.equal(service.calls.find(([k]) => k === 'settle')[1].outcome, 'released')
  assert.equal(service.kinds().includes('capture'), false)
})

test('research_write_draft: the first draft names no hash; a stale one is told to read the context again', async () => {
  const service = fakeService()
  const { byName } = tools(service, fakeSources())
  await byName.research_write_draft.execute({ text: '# Draft' }, exec('call_d'))
  assert.equal(service.calls.find(([k]) => k === 'draft')[1].expectedSha256, null)
  const stale = fakeService({ draft: () => { throw new TransportError('stale', 409, 'stale_revision') } })
  const out = await tools(stale, fakeSources()).byName.research_write_draft.execute({ text: '# Again', expectedSha256: 'a'.repeat(64) }, exec())
  assert.equal(out.code, 'stale_revision')
})

test('outside a research attempt the tools refuse to run', async () => {
  const { byName } = tools(fakeService(), fakeSources(), null)
  await assert.rejects(byName.research_read_context.execute({}, exec()), /only inside a Sophia research task/)
})

test('call keys, byte clamps and links', () => {
  assert.equal(callKeyOf('call_abc123'), 'call_abc123')
  assert.match(callKeyOf('call/with spaces/' + 'x'.repeat(80)), /^tc-[0-9a-f]{40}$/)
  assert.notEqual(callKeyOf('a/b'), callKeyOf('a/c'))
  const cut = clampBytes('é'.repeat(10), 5)
  assert.deepEqual([cut.text, cut.cut], ['éé', true], 'never splits a character')
  assert.deepEqual(linksOf('[a](https://x.org/1) [b](http://x.org/2) [c](https://x.org/1) [d](ftp://x.org)'), ['https://x.org/1', 'http://x.org/2'])
})

test('a model call is reserved at its worst case and settled at its reported usage', () => {
  const prices = { input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 }
  const options = { provider: 'openai-research', model: 'gpt-6.1-sol', system: 's'.repeat(2998), messages: [], tools: [] }
  const estimate = estimateCallUsd(options, prices, 16000)
  assert.ok(estimate >= (1000 * 2 + 16000 * 10) / 1e6, 'the whole output ceiling and the input at the uncached price')
  assert.equal(estimateCallUsd({ ...options, maxTokens: 8000 }, prices, 16000) < estimate, true, 'a smaller cap reserves less')
  assert.equal(costOfUsage({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 10000, cacheWriteTokens: 2000 }, prices), (1000 * 2 + 10000 * 0.1 + 2000 * 2.5 + 500 * 10) / 1e6)
  assert.equal(costOfUsage({ inputTokens: 1000, outputTokens: 500 }, prices), (1000 * 2 + 500 * 10) / 1e6, 'absent cache counters are zero')
  // M03-RF-0010: whatever share of the input is written to the cache, the call stays within what it reserved.
  const sent = Math.ceil(JSON.stringify([options.system, options.messages, options.tools]).length / 3)
  assert.ok(estimate >= costOfUsage({ inputTokens: 0, outputTokens: 16000, cacheWriteTokens: sent }, prices), 'all of it written to the cache')
  // Text the tokenizer packs less densely than English prose is counted a token a character, not one per three.
  assert.equal(estimateInputTokens('abcdef'), 2)
  assert.equal(estimateInputTokens('città è perché'), Math.ceil(11 / 3) + 3)
  assert.equal(estimateInputTokens('東京の研究報告'), 7)
  assert.equal(estimateInputTokens('🙂'), 2, 'an astral character is two units, both counted')
  const cjk = { ...options, system: '研'.repeat(3000) }
  assert.ok(estimateCallUsd(cjk, prices, 16000) >= (3000 * 2.5 + 16000 * 10) / 1e6, 'a token a character, at the dearest input price')
})

test('a search billed above its reservation is settled at what it cost, never clipped, and the host logs it (M03-RF-0010)', async () => {
  const service = fakeService()
  const sources = fakeSources({ search: (request) => ({ provider: 'tavily', query: request.query, requestId: 'req_2', credits: 2, responseTimeSeconds: 0.4, providerHttpStatus: 200, results: [] }) })
  const { byName, lines } = tools(service, sources)
  await byName.research_search.execute({ query: 'pdf rendering sandbox' }, exec())
  const settle = service.calls.find(([k]) => k === 'settle')[1]
  assert.deepEqual([settle.outcome, settle.costUsd], ['settled', 2 * TAVILY_CREDIT_USD])
  assert.ok(settle.costUsd > SEARCH_RESERVE_USD)
  assert.equal(lines.filter((l) => /above the 0\.01 USD it reserved/.test(l)).length, 1)
})

test('research_submit_result: the current draft with its citations, once; research_report_blocker: the reason', async () => {
  const service = fakeService()
  const { byName } = tools(service, fakeSources())
  const out = await byName.research_submit_result.execute(
    { draftSha256: 'c'.repeat(64), title: 'T', summary: 'S', resultSummary: 'R', citations: ['33333333-3333-4333-8333-333333333333'], changeNote: 'Added costs.' },
    exec('call_s'),
  )
  assert.deepEqual([out.outcome, out.versionNumber], ['published', 1])
  const body = service.calls.find(([k]) => k === 'submit')[1]
  assert.deepEqual([body.callId, body.result.limitations, body.result.changeNote, 'blocker' in body], ['call_s', [], 'Added costs.', false])
  const blocked = await byName.research_report_blocker.execute({ reason: 'Behind a login.', remainingWork: 'Find a mirror.' }, exec('call_b'))
  assert.equal(blocked.outcome, 'blocked')
  assert.deepEqual(service.calls.filter(([k]) => k === 'submit')[1][1].blocker, { reason: 'Behind a login.', remainingWork: 'Find a mirror.' })
  const stale = fakeService({ submit: () => { throw new TransportError('stale', 409, 'stale_revision') } })
  const refused = await tools(stale, fakeSources()).byName.research_submit_result.execute(
    { draftSha256: 'c'.repeat(64), title: 'T', summary: 'S', resultSummary: 'R', citations: ['33333333-3333-4333-8333-333333333333'] },
    exec(),
  )
  assert.equal(refused.code, 'stale_revision')
})

test('research_submit_result: notes the service refused tell the model what disagreed, and the task goes on', async () => {
  const sections = { added: ['Pricing'], revised: [], removed: ['Conclusion'], unchanged: ['Hosts'], conclusionChanged: true }
  const problems = ['The note calls the conclusion unchanged, but it changed.']
  const service = fakeService({ submit: () => ({ taskId: 't', outcome: 'notes_rejected', problems, sections }) })
  const { byName } = tools(service, fakeSources())
  const out = await byName.research_submit_result.execute(
    { draftSha256: 'c'.repeat(64), title: 'T', summary: 'S', resultSummary: 'R', citations: ['33333333-3333-4333-8333-333333333333'], changeNote: 'Same conclusion.' },
    exec('call_s'),
  )
  assert.deepEqual([out.outcome, out.problems, out.sections], ['notes_rejected', problems, sections])
  assert.match(out.note, /^Not published: .*Submit again/)
  await byName.research_read_context.execute({}, exec('call_c'))
  assert.equal(service.kinds().at(-1), 'context', 'the tools still run: the task has not ended')
})

test('provider text is cut well formed: the service refuses an unpaired surrogate', () => {
  assert.equal(cutText('ab\u{1F600}cd', 3), 'ab\uFFFD', 'a cut through a pair')
  assert.equal(cutText('a\uD800b', 10), 'a\uFFFDb', 'a lone surrogate the provider sent')
  assert.equal(cutText('abc', 10), 'abc')
  assert.equal(JSON.stringify(cutText('x\u{1F600}', 2)).includes('\\ud'), false)
})

// --- M03-RF-0009: the disclosure guard indexes the whole private context, or nothing leaves the host -------------

const KIB = 1024
/** `bytes` of ASCII words that never repeat a six-word run, so no span of one text is found in another. */
const filler = (tag, bytes) => {
  let out = ''
  for (let i = 0; out.length < bytes; i += 1) out += `${tag}w${i} `
  return out.slice(0, bytes)
}
const sid = (n) => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`

/** A service whose task has these inputs (sourceId -> text) and, for an amendment, a base version. */
const pageOf = (text, offset) => {
  const chunk = text.slice(offset, offset + 6000)
  return { chunk, next: offset + chunk.length < text.length ? offset + chunk.length : null }
}
function serviceWith(inputs, base = null, page = pageOf) {
  const texts = new Map([...inputs, ...(base ? [[base.sourceId, base.text]] : [])])
  return fakeService({
    context(body) {
      if (body.sourceId === undefined) {
        return {
          taskId: 't', rootTaskId: 't', question: 'Which sandboxes do PDF renderers use?', outputs: ['markdown'], preferences: {}, assumptions: [],
          inputs: [...inputs].map(([sourceId, text]) => ({ ref: `input:${sourceId}`, sourceId, sha256: 'a'.repeat(64), mime: 'text/plain', byteLength: Buffer.byteLength(text) })),
          urls: [], base: base ? { artifactId: 'a', versionId: 'v', sourceId: base.sourceId } : null,
          allowance: { capUsd: 5, headroomUsd: 0.5, committedUsd: 0, searchesLeft: 5, readsLeft: 8 }, draft: null, roster: [],
        }
      }
      const text = texts.get(body.sourceId) ?? ''
      const offset = body.offset ?? 0
      const { chunk, next } = page(text, offset)
      return { sourceId: body.sourceId, offset, nextOffset: next, totalChars: text.length, truncated: next !== null, text: chunk }
    },
  })
}

test('research_search: an input after a megabyte of others is still guarded (Codex\'s reproduction, M03-RF-0009)', async () => {
  const fifth = 'Zephyr ledger flagged Osaka refunds early.'
  const inputs = new Map([
    ...[1, 2, 3, 4].map((n) => [sid(n), filler(`i${n}`, 256 * KIB)]),
    [sid(5), fifth],
  ])
  const service = serviceWith(inputs)
  const sources = fakeSources()
  const { byName } = tools(service, sources)
  const leaked = await byName.research_search.execute({ query: 'news: zephyr ledger flagged osaka refunds early' }, exec())
  assert.deepEqual([leaked.code, leaked.reason], ['disclosure_denied', 'private_span'])
  assert.equal(service.kinds().includes('reserve'), false, 'nothing reserved')
  assert.equal(sources.used.searches, 0, 'nothing searched')
  const fine = await byName.research_search.execute({ query: 'sandboxed PDF rendering services' }, exec('call_2'))
  assert.equal(fine.startsWith('<sophia-source'), true, 'a public query still runs')
})

test('research_search: the largest context admission lets in, eight 256 KiB inputs and the amended version, is indexed to its end', async () => {
  const inputs = new Map([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [sid(n), filler(`i${n}`, 256 * KIB)]))
  const base = { sourceId: sid(9), text: filler('base', 256 * KIB) }
  const service = serviceWith(inputs, base)
  const sources = fakeSources()
  const { byName } = tools(service, sources)
  const lastWords = (text) => text.trim().split(' ').slice(-7, -1).join(' ')
  for (const [n, text] of [[1, lastWords(inputs.get(sid(8)))], [2, lastWords(base.text)]]) {
    const verdict = await byName.research_search.execute({ query: text }, exec(`call_${n}`))
    assert.deepEqual([verdict.code, verdict.reason], ['disclosure_denied', 'private_span'], `the end of source ${n} is indexed`)
  }
  assert.equal(sources.used.searches, 0)
})

test('research_search: a private context the guard cannot index whole stops every search, before any reservation', async () => {
  // Longer than any admission allows (the service would never send it), and a source whose pages do not advance.
  for (const service of [
    serviceWith(new Map([[sid(1), filler('big', 2_400_000)]])),
    serviceWith(new Map([[sid(1), filler('stuck', 20 * KIB)]]), null, (text, offset) => ({ chunk: text.slice(0, 6000), next: offset })),
  ]) {
    const sources = fakeSources()
    const { byName, lines } = tools(service, sources)
    for (const callId of ['call_1', 'call_2']) {
      const refused = await byName.research_search.execute({ query: 'sandboxed PDF rendering services' }, exec(callId))
      assert.equal(refused.code, 'disclosure_unchecked')
      assert.match(refused.message, /no web search runs/)
    }
    assert.equal(service.kinds().includes('reserve'), false, 'nothing reserved')
    assert.equal(sources.used.searches, 0, 'nothing searched')
    assert.equal(lines.filter((l) => /could not index/.test(l)).length, 1, 'told once, then remembered')
  }
})
