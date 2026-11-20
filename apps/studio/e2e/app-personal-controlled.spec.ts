import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// INC03-DES-001: a controlled Personal space through the actual Studio app (fixtures/app.tsx: App, its sign-in and the
// Supabase client, unchanged), signed in by a synthetic Auth service and with every API read answered here, in the
// browser (vite.app.config.ts). It crosses the actual reader end to end: the old read first, C5's refusal, the
// controlled read (A55) pinned for the account, its bounded refresh while open (same revision or not), the windows read
// back, the per-input views, the copy (A54's export) and the padlock. Each answer is synthetic and closed; the request
// ledger shows what the app asked, and that none of it writes. Nothing reaches an Auth service or an API.
const APP = 'http://127.0.0.1:5198'
/** supabase-js's own key for a session with the synthetic Auth service at 127.0.0.1: `sb-<host's first label>-…`. */
const SESSION_KEY = 'sb-127-auth-token'
const DAVIDE = { id: '00000000-0000-4000-8000-00000000d001', email: 'davide@sophia.test' }
const LOCK_KEY = `sophia.personal.lock.v1.${DAVIDE.id}`

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
/** A synthetic session, unsigned: only the synthetic Auth service ever sees it, and it signs nothing. */
function session() {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600
  const claims = { sub: DAVIDE.id, email: DAVIDE.email, role: 'authenticated', aud: 'authenticated', exp }
  return {
    access_token: `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...claims, is_anonymous: false })}.synthetic`,
    refresh_token: `synthetic-refresh-${DAVIDE.id}`,
    token_type: 'bearer',
    expires_in: 24 * 3600,
    expires_at: exp,
    user: {
      id: DAVIDE.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: DAVIDE.email,
      is_anonymous: false,
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
    },
  }
}

// ---- The space, as the API would keep it (synthetic) ----

const T0 = Date.now()
const ago = (minutes: number) => new Date(T0 - minutes * 60_000).toISOString()
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const IN = { x: id(201), y: id(202), z: id(203), w: id(204), v: id(205) }
const CALL = { x: id(301), w: id(302), v: id(303) }

type Reply = 'pending' | 'answered' | 'failed' | 'recorded' | 'withdrawn' | null
interface TurnOver {
  author?: 'person' | 'sophia'
  reply?: Reply
  replyTo?: string | null
  input?: { inputId: string; control: 'active' | 'held' | 'withdrawn'; revision: number } | null
  prompt?: 'eligible' | 'excluded'
  activity?: boolean
}
const turn = (seq: number, text: string, minutes: number, over: TurnOver = {}) => {
  const author = over.author ?? 'person'
  return {
    id: id(1000 + seq),
    seq,
    author,
    text,
    createdAt: ago(minutes),
    replyTo: over.replyTo ?? null,
    reply: over.reply === undefined ? (author === 'person' ? 'answered' : null) : over.reply,
    suggestion: null,
    input: over.input ?? null,
    prompt: over.prompt ?? 'eligible',
    activity: over.activity ?? true,
  }
}
type Turn = ReturnType<typeof turn>

interface ViewOver {
  control?: Record<string, unknown>
  prior?: { financial: string; effect: string; answer: string }
  calls?: object[]
  withheld?: object[]
  decisions?: object[]
}
const view = (inputId: string, t: Turn, over: ViewOver = {}) => ({
  inputId,
  turnId: t.id,
  seq: t.seq,
  createdAt: t.createdAt,
  reply: t.reply,
  decisions: over.decisions ?? [],
  route: null,
  control: {
    state: 'active',
    revision: 1,
    heldReason: null,
    withdrawnPhase: null,
    replaces: null,
    replacedBy: [],
    ...over.control,
  },
  prior: over.prior ?? { financial: 'settled', effect: 'none', answer: 'published' },
  calls: over.calls ?? [],
  withheld: over.withheld ?? [],
})
const call = (callId: string, financial: string, answer: string, possibleEffect = false) => ({
  callId,
  financial,
  reason: null,
  launch: 'tagged',
  answer,
  possibleEffect,
})
/** An input never admitted: no call was made, so nothing financial, no effect and no answer (0103). */
const NONE_PRIOR = { financial: 'none', effect: 'none', answer: 'none' }
const KEPT_W = {
  callId: CALL.w,
  text: 'Tell them the date moves to Thursday.',
  suggestion: null,
  source: 'late_settlement',
  at: ago(17),
}

/** The histories the A3-R3 seam lists, on one space: X, her answer, held Y, cancelled Z, W and an unrelated wait. */
function histories(waitReply: Reply = 'pending') {
  const x = turn(11, 'Can you draft the note to Davide?', 40, {
    input: { inputId: IN.x, control: 'withdrawn', revision: 2 },
    prompt: 'excluded',
  })
  const hers = turn(12, 'Here is a draft for Davide.', 39, { author: 'sophia', replyTo: x.id, prompt: 'excluded' })
  const y = turn(13, 'Keep it to two lines.', 30, {
    reply: 'recorded',
    input: { inputId: IN.y, control: 'held', revision: 1 },
    prompt: 'excluded',
    activity: false,
  })
  const z = turn(14, 'Never mind the summary.', 25, {
    reply: 'recorded',
    input: { inputId: IN.z, control: 'withdrawn', revision: 2 },
    prompt: 'excluded',
    activity: false,
  })
  const w = turn(15, 'What should I tell the team?', 20, {
    reply: 'withdrawn',
    input: { inputId: IN.w, control: 'withdrawn', revision: 2 },
    prompt: 'excluded',
  })
  const wait = turn(16, 'And one more thing about the launch.', 2, { reply: waitReply })
  return { x, hers, y, z, w, wait, turns: [x, hers, y, z, w, wait] }
}

/** The views of those inputs: W's cost not settled yet, its answer kept aside, unless told otherwise. */
function viewsOf(h: ReturnType<typeof histories>, { settled = false, keptOnX = false } = {}) {
  return [
    view(IN.x, h.x, {
      control: { state: 'withdrawn', revision: 2, withdrawnPhase: 'after_publication', replacedBy: [IN.y] },
      calls: [call(CALL.x, 'settled', keptOnX ? 'withheld' : 'published')],
      withheld: keptOnX
        ? [{ callId: CALL.x, text: 'A shorter draft, kept.', suggestion: null, source: 'kept_transfer', at: ago(1) }]
        : [],
    }),
    // Never admitted (0103's personal_answer_prior): no call, nothing financial, no effect, no answer.
    view(IN.y, h.y, { control: { state: 'held', heldReason: 'admission_off', replaces: IN.x }, prior: NONE_PRIOR }),
    view(IN.z, h.z, {
      control: { state: 'withdrawn', revision: 2, withdrawnPhase: 'before_admission' },
      prior: NONE_PRIOR,
    }),
    view(IN.w, h.w, {
      control: { state: 'withdrawn', revision: 2, withdrawnPhase: 'after_launch' },
      prior: settled
        ? { financial: 'settled', effect: 'possible', answer: 'withheld' }
        : { financial: 'unresolved', effect: 'possible', answer: 'withheld' },
      calls: [call(CALL.w, settled ? 'settled' : 'uncertain', 'withheld', true)],
      withheld: [KEPT_W],
    }),
  ]
}

const NOTES = [{ id: id(501), text: 'Start the deck', keptBy: 'person', fromTurnId: null, createdAt: ago(600) }]
interface SpaceOver {
  revision?: number
  turns?: Turn[]
  inputs?: object[]
  earlier?: boolean
  pending?: boolean
  companion?: string
  epoch?: number
}
const space = (h: ReturnType<typeof histories>, over: SpaceOver = {}) => ({
  spaceContract: 'personal_controlled_space_v1',
  companion: over.companion ?? 'rehearsal',
  revision: over.revision ?? 7,
  epoch: over.epoch ?? 1,
  days: 3,
  turns: over.turns ?? h.turns,
  earlier: over.earlier ?? false,
  pending: over.pending ?? h.wait.reply === 'pending',
  inputs: over.inputs ?? viewsOf(h),
  notes: NOTES,
  releases: [],
})
const LEGACY = {
  companion: 'rehearsal',
  revision: 3,
  turns: [
    {
      id: id(901),
      seq: 1,
      author: 'person',
      text: 'An ordinary day.',
      createdAt: ago(3),
      replyTo: null,
      reply: 'answered',
      suggestion: null,
    },
  ],
  earlier: false,
  notes: NOTES,
  releases: [],
  epoch: 1,
  days: 1,
}

// ---- The synthetic API and its ledger ----

interface Answer {
  status?: number
  json: unknown
}
const refusal = (status: number, code: string, retry: 'never' | 'safe_read'): Answer => ({
  status,
  json: { code, message: `Synthetic ${code}`, retry, requestId: id(999) },
})
/** C5: the old reads' refusal of a controlled space. */
const C5 = refusal(503, 'projection_unavailable', 'never')

/** How each Personal read is answered now (changed by a check as it goes); `hold` waits for `release`. */
interface World {
  legacy: () => Answer
  waiting?: () => Answer | 'hold'
  earlierLegacy?: () => Answer | 'hold'
  space: () => Answer | 'hold'
  before: (seq: number) => Answer | 'hold'
  view: (inputId: string) => Answer
  exported: (after: number) => Answer
}

async function serve(context: BrowserContext, world: World) {
  const ledger: string[] = []
  const held: (() => void)[] = []
  await context.route(`${APP}/synthetic-auth/**`, (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204 })
    if (pathname.endsWith('/auth/v1/token'))
      return route.fulfill({ status: 400, json: { code: 'refresh_token_not_found', message: 'Synthetic' } })
    return route.fulfill({ status: 404, json: { code: 404, msg: 'Synthetic Auth: nothing here' } })
  })
  await context.route(`${APP}/api/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = `${url.pathname}${url.search}`
    ledger.push(`${request.method()} ${path}`)
    let answer = answerOf(world, url)
    // Held: answered only once released, with what the world says then.
    while (answer === 'hold') {
      await new Promise<void>((go) => held.push(go))
      answer = answerOf(world, url)
    }
    const { status = 200, json } = answer
    return route.fulfill({ status, json }).catch(() => undefined) // a read the page called off meanwhile
  })
  return { ledger, holding: () => held.length, release: () => held.splice(0).forEach((go) => go()) }
}

function legacyPageOf(world: World, path: string): Answer | 'hold' | null {
  if (path === '/api/v1/personal/turns') return world.waiting?.() ?? refusal(503, 'unavailable', 'never')
  if (path === '/api/v1/personal/turns/earlier') return world.earlierLegacy?.() ?? refusal(503, 'unavailable', 'never')
  return null
}

function answerOf(world: World, url: URL): Answer | 'hold' {
  const p = url.pathname
  if (p === '/api/v1/personal') return world.legacy()
  const legacyPage = legacyPageOf(world, p)
  if (legacyPage !== null) return legacyPage
  if (p === '/api/v1/personal/answer-controls/space') return world.space()
  if (p === '/api/v1/personal/answer-controls/turns') return world.before(Number(url.searchParams.get('before')))
  if (p === '/api/v1/personal/answer-controls/export') return world.exported(Number(url.searchParams.get('after')))
  const input = /^\/api\/v1\/personal\/answers\/([^/]+)\/control$/.exec(p)?.[1]
  if (input) return world.view(input)
  return refusal(503, 'unavailable', 'never') // every other read: no API in this check (as app-auth.spec's)
}

const controlledWorld = (h = histories()): World => ({
  legacy: () => C5,
  space: () => ({ json: space(h) }),
  before: () => refusal(404, 'not_found', 'never'),
  view: () => refusal(404, 'not_found', 'never'),
  exported: () => refusal(404, 'not_found', 'never'),
})

const isLegacy = (l: string) => /^GET \/api\/v1\/personal(\?|$)/.test(l)
const isControlled = (l: string) => l.startsWith('GET /api/v1/personal/answer-controls/space')

/**
 * What was asked of the old read and of the controlled one, and every write (none may be). The app's first load may
 * ask its reads twice (a read called off as it mounts again, before any answer): each is legacy-first, as nothing is
 * pinned yet. Once the controlled read is asked, the old one never is again (`legacyAfterPin`).
 */
const asked = (ledger: readonly string[]) => {
  const pinned = ledger.findIndex(isControlled)
  return {
    legacy: ledger.filter(isLegacy).length,
    legacyAfterPin: pinned < 0 ? 0 : ledger.slice(pinned).filter(isLegacy).length,
    legacyPoll: ledger.filter((l) => l.startsWith('GET /api/v1/personal/turns')).length,
    controlled: ledger.filter(isControlled).length,
    writes: ledger.filter((l) => !l.startsWith('GET ')),
  }
}

async function signedIn(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await page.goto(`${APP}/favicon.svg`)
  await page.evaluate(([key, kept]) => localStorage.setItem(key, kept), [
    SESSION_KEY,
    JSON.stringify(session()),
  ] as const)
  return page
}

/** The app opened at Personal. */
async function openPersonal(page: Page) {
  await page.goto(`${APP}/app.html`)
  await page.getByRole('button', { name: 'Personal', exact: true }).click()
}

const statusOf = (page: Page, t: Turn) => page.locator(`[data-control="${t.id}"]`)

/** Every controlled message's status, as the cold open shows it. */
async function showsHistories(page: Page, h: ReturnType<typeof histories>) {
  await expect(page.getByText('Here is a draft for Davide.')).toBeVisible()
  await expect(statusOf(page, h.x)).toHaveText('Withdrawn after her answer was published')
  await expect(statusOf(page, h.y)).toHaveText('Held to replace an earlier message — not asked yet · answers are off')
  await expect(statusOf(page, h.z)).toHaveText('Cancelled before it was sent to Sophia')
  await expect(statusOf(page, h.w)).toContainText('Withdrawn; work may already have started · cost not settled yet')
  await expect(page.locator(`[data-recorded]`)).toHaveCount(0)
  await expect(page.locator('.c3-failed', { hasText: 'Sophia couldn’t answer this one.' })).toHaveCount(0)
}

test('controlled · a cold open reads the old way, takes C5’s refusal, and reads the space whole through A55', async ({
  context,
}) => {
  const h = histories()
  const { ledger } = await serve(context, controlledWorld(h))
  const page = await signedIn(context)
  await openPersonal(page)
  await showsHistories(page, h)
  const first = ledger.findIndex(isLegacy)
  const controlled = ledger.findIndex(isControlled)
  expect(first).toBeGreaterThanOrEqual(0)
  expect(controlled).toBeGreaterThan(first)
  // Pinned: the pending wait polls the controlled read, never the old one again, and nothing is written.
  await expect.poll(() => asked(ledger).controlled).toBeGreaterThan(1)
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, legacyPoll: 0, writes: [] })
})

for (const size of ['desktop', '@phone']) {
  test(`${size} controlled · active recorded inputs keep their quiet status without a wait or retry`, async ({
    context,
  }) => {
    const h = histories('answered')
    const recorded = ['A thought kept without asking.', 'Waiting for a payer.'].map((text, i) =>
      turn(17 + i, text, 1, {
        reply: 'recorded',
        input: { inputId: id(206 + i), control: 'active', revision: 0 },
        prompt: 'excluded',
        activity: false,
      }),
    )
    const inputs = recorded.map((t, i) => view(id(206 + i), t, { control: { revision: 0 }, prior: NONE_PRIOR }))
    const world = controlledWorld(h)
    world.space = () => ({ json: space(h, { turns: recorded, inputs, pending: false }) })
    const { ledger } = await serve(context, world)
    const page = await signedIn(context)
    await openPersonal(page)
    const status = page.locator('[data-recorded]')
    await expect(status).toHaveText(['Kept — not asked yet', 'Kept — not asked yet'])
    await expect(status.locator('button, a, [tabindex]')).toHaveCount(0)
    await expect(page.locator('.msg.typing, [data-control]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Ask again|Asking/ })).toHaveCount(0)
    await expect(page.getByText('Sophia couldn’t answer this one.')).toHaveCount(0)
    for (const line of await status.all()) {
      const box = await line.boundingBox()
      const width = await page.evaluate(() => document.documentElement.clientWidth)
      expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true)
      expect(await line.evaluate((p) => getComputedStyle(p).fontSize)).toBe('13px')
    }
    const field = page.locator('#c-input')
    await field.focus()
    await expect(field).toBeFocused()
    expect(asked(ledger).writes).toEqual([])
  })
}

test('controlled · the kept answer opens and closes by keyboard, read-only, its words as they were kept', async ({
  context,
}) => {
  const h = histories('answered')
  await serve(context, controlledWorld(h))
  const page = await signedIn(context)
  await openPersonal(page)
  const show = statusOf(page, h.w).getByRole('button', { name: 'Show the kept answer' })
  await show.focus()
  await page.keyboard.press('Enter')
  const kept = page.locator(`[data-kept="${h.w.id}"]`)
  await expect(kept).toBeVisible()
  await expect(kept.locator('q')).toHaveText(KEPT_W.text) // its marks are the quote's own (CSS)
  await expect(kept).toContainText('Kept aside at')
  const hide = statusOf(page, h.w).getByRole('button', { name: 'Hide' })
  await expect(hide).toHaveAttribute('aria-expanded', 'true')
  await expect(hide).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(kept).toBeHidden()
  // Nothing in it to press but the toggle: it writes nothing.
  await expect(kept.getByRole('button')).toHaveCount(0)
})

test('controlled · money settled, a new kept answer and a lapsed wait show at the same revision', async ({
  context,
}) => {
  const h = histories()
  const world = controlledWorld(h)
  const { ledger } = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await openPersonal(page)
  await showsHistories(page, h)
  // Same revision 7: W's cost settles, the wait lapses (read as failed), an answer to X is kept aside, nothing pending.
  const lapsed = histories('failed')
  world.space = () => ({ json: space(lapsed, { inputs: viewsOf(lapsed, { settled: true, keptOnX: true }) }) })
  await page.clock.fastForward(2000)
  await expect(statusOf(page, h.w)).toContainText('Withdrawn; work may already have started')
  await expect(statusOf(page, h.w)).not.toContainText('cost not settled yet')
  await expect(page.locator('.c3-failed', { hasText: 'Sophia couldn’t answer this one.' })).toHaveCount(1)
  await expect(statusOf(page, h.x).getByRole('button', { name: 'Show the kept answer' })).toBeVisible()
  // Nothing pending now: still read again while open and in sight, every 20 s, at the same revision: a second answer
  // kept aside for W shows.
  const reads = asked(ledger).controlled
  const second = { ...KEPT_W, callId: id(304), text: 'Or tell them on Friday.', at: ago(0) }
  world.space = () => {
    const inputs = viewsOf(lapsed, { settled: true, keptOnX: true })
    return {
      json: space(lapsed, {
        inputs: inputs.map((v) => (v.inputId === IN.w ? { ...v, withheld: [KEPT_W, second] } : v)),
      }),
    }
  }
  await page.clock.fastForward(21_000)
  await expect.poll(() => asked(ledger).controlled).toBeGreaterThan(reads)
  await expect(statusOf(page, h.w).getByRole('button', { name: 'Show the 2 kept answers' })).toBeVisible()
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, legacyPoll: 0, writes: [] })
})

test('controlled · a window read back is read again with the space, and its old message’s control change shows', async ({
  context,
}) => {
  const h = histories('answered')
  const old = turn(5, 'An older question about the pilot.', 300, {
    input: { inputId: IN.v, control: 'active', revision: 1 },
  })
  const world = controlledWorld(h)
  world.space = () => ({ json: space(h, { earlier: true }) })
  world.before = (seq) => ({
    json: { revision: 7, epoch: 1, turns: seq === 11 ? [old] : [], earlier: false, pending: false },
  })
  world.view = (inputId) => (inputId === IN.v ? { json: view(IN.v, old) } : refusal(422, 'not_found', 'never'))
  const { ledger } = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await openPersonal(page)
  await showsHistories(page, h)
  await page.locator('.c3-day').first().click()
  await page.getByRole('menuitem', { name: 'Show earlier days' }).click()
  await expect(page.getByText('An older question about the pilot.')).toBeVisible()
  await expect(statusOf(page, old)).toHaveCount(0) // active: nothing to say
  // The space moves to revision 8: its read-back window is read again with it, and the old message is now withdrawn.
  const withdrawn = turn(5, 'An older question about the pilot.', 300, {
    reply: 'withdrawn',
    input: { inputId: IN.v, control: 'withdrawn', revision: 2 },
  })
  world.space = () => ({ json: space(h, { earlier: true, revision: 8 }) })
  world.before = () => ({ json: { revision: 8, epoch: 1, turns: [withdrawn], earlier: false, pending: false } })
  world.view = () => ({
    json: view(IN.v, withdrawn, {
      control: { state: 'withdrawn', revision: 2, withdrawnPhase: 'before_launch' },
    }),
  })
  const before = ledger.filter((l) => l.includes('/turns?before=11')).length
  await page.clock.fastForward(21_000)
  await expect(statusOf(page, old)).toHaveText('Withdrawn before Sophia was asked')
  expect(ledger.filter((l) => l.includes('/turns?before=11')).length).toBeGreaterThan(before)
  expect(ledger.filter((l) => l === `GET /api/v1/personal/answers/${IN.v}/control`).length).toBeGreaterThan(1)
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, legacyPoll: 0, writes: [] })
})

// R01 (CORE df064b29): a view read after its page may be at a newer control than the page has. Never shown together:
// a turn read back must never say both Ask again (its page: active, failed) and Withdrawn (its newer view).
const R1_OLD = turn(5, 'An older question about the deck.', 300, {
  reply: 'failed',
  input: { inputId: IN.v, control: 'active', revision: 0 },
})
const R1_NEWER = view(IN.v, R1_OLD, {
  control: { state: 'withdrawn', revision: 1, withdrawnPhase: 'before_reservation' },
  prior: NONE_PRIOR,
})
const R1_AS_PAGE = view(IN.v, R1_OLD, { control: { revision: 0 }, prior: NONE_PRIOR }) // as its page has it
const R1_WITHDRAWN = turn(5, 'An older question about the deck.', 300, {
  reply: 'withdrawn',
  input: { inputId: IN.v, control: 'withdrawn', revision: 1 },
})

/** The turn read back never shows Ask again and a control status at once (a mix of its page and a newer view). */
async function neverMixed(page: Page) {
  const asks = await page.locator('.c3-failed', { hasText: 'Sophia couldn’t answer this one.' }).count()
  const said = await statusOf(page, R1_OLD).count()
  expect(asks > 0 && said > 0, `Ask again ${String(asks)} with a status ${String(said)}`).toBe(false)
}

test('R01 · read more: a window whose view moved past its page isn’t joined mixed; once they hold, it is', async ({
  context,
}) => {
  const h = histories('answered')
  const world = controlledWorld(h)
  world.space = () => ({ json: space(h, { earlier: true }) })
  world.before = () => ({ json: { revision: 7, epoch: 1, turns: [R1_OLD], earlier: false, pending: false } })
  world.view = (inputId) => (inputId === IN.v ? { json: R1_NEWER } : refusal(422, 'not_found', 'never'))
  const { ledger } = await serve(context, world)
  const page = await signedIn(context)
  await openPersonal(page)
  await showsHistories(page, h)
  const more = async () => {
    // The days' menu stays open after a read (Escape would leave Personal for Home): open it only when it's shut.
    const item = page.getByRole('menuitem', { name: 'Show earlier days' })
    if (!(await item.isVisible())) await page.locator('.c3-day').first().click()
    await item.click()
  }
  const before = asked(ledger).controlled
  await more()
  await expect.poll(() => ledger.filter((l) => l.endsWith(`/answers/${IN.v}/control`)).length).toBeGreaterThan(0)
  await expect.poll(() => asked(ledger).controlled).toBeGreaterThan(before) // not joined: read whole again instead
  await neverMixed(page)
  await expect(page.getByText('An older question about the deck.')).toHaveCount(0)
  // The page and the view agree now (withdrawn at control revision 1): read more joins it, with its one status.
  world.before = () => ({ json: { revision: 7, epoch: 1, turns: [R1_WITHDRAWN], earlier: false, pending: false } })
  await more()
  await expect(statusOf(page, R1_OLD)).toHaveText('Withdrawn before Sophia was asked')
  await neverMixed(page)
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, writes: [] })
})

test('R01 · a refresh whose view and page disagree keeps the last whole read, said stale, never a mix', async ({
  context,
}) => {
  const h = histories('answered')
  const world = controlledWorld(h)
  world.space = () => ({ json: space(h, { earlier: true }) })
  world.before = () => ({ json: { revision: 7, epoch: 1, turns: [R1_OLD], earlier: false, pending: false } })
  world.view = (inputId) => (inputId === IN.v ? { json: R1_AS_PAGE } : refusal(422, 'not_found', 'never'))
  const { ledger } = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await openPersonal(page)
  await showsHistories(page, h)
  await page.locator('.c3-day').first().click()
  await page.getByRole('menuitem', { name: 'Show earlier days' }).click()
  await expect(page.getByText('An older question about the deck.')).toBeVisible()
  await expect(page.locator('.c3-failed', { hasText: 'Sophia couldn’t answer this one.' })).toHaveCount(1)
  // A control commits between the page and its view on every refresh now: each round is read twice, then said stale.
  world.view = (inputId) => (inputId === IN.v ? { json: R1_NEWER } : refusal(422, 'not_found', 'never'))
  await page.clock.fastForward(21_000)
  await expect(page.locator('[data-stale]')).toBeVisible()
  await neverMixed(page)
  await expect(page.locator('.c3-failed', { hasText: 'Sophia couldn’t answer this one.' })).toHaveCount(1)
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, writes: [] })
})

// R2 (CORE ccf09b9a F01): a window read back while the space is read again joins only the very read it was read for.
// asOf is when a read ended, by this device's clock, not which read it is: with the clock held still (setFixedTime),
// every read ends at the same instant, and a newer read (a new revision, a new epoch, or newer money at the same
// revision) must never take an older window or its views. The read-back page is held at a gate until let through.
const R2_FIXED = new Date(T0)
const R2_OLD = turn(5, 'An older, private question from before.', 300, {
  input: { inputId: IN.v, control: 'active', revision: 1 },
})
/** A window read back; more before it, so Show earlier days stays and says which read is shown by its cursor. */
const r2Page = (revision: number, epoch: number, turns: Turn[] = [R2_OLD], earlier = true) => ({
  json: { revision, epoch, turns, earlier, pending: false },
})
/** After an erasure elsewhere: epoch 2, a new conversation, earlier days of its own. */
const R2_AFTER = turn(31, 'A new beginning, after the erasure.', 1, { reply: 'answered' })

async function r2Crossing(context: BrowserContext) {
  const h = histories('answered')
  const world = controlledWorld(h)
  world.space = () => ({ json: space(h, { earlier: true }) })
  const gate: { open: boolean; page: Answer } = { open: false, page: r2Page(7, 1) }
  world.before = () => (gate.open ? gate.page : 'hold')
  world.view = (inputId) => (inputId === IN.v ? { json: view(IN.v, R2_OLD) } : refusal(422, 'not_found', 'never'))
  const served = await serve(context, world)
  const { ledger } = served
  const page = await signedIn(context)
  await page.clock.install()
  await page.clock.setFixedTime(R2_FIXED)
  await openPersonal(page)
  await showsHistories(page, h)
  const cursors = () => ledger.filter((l) => l.includes('/answer-controls/turns?before=')).map((l) => l.split('=')[1])
  const views = () => ledger.filter((l) => l.endsWith(`/answers/${IN.v}/control`)).length
  /** Show earlier days, and the cursor it asks: the first seq of the read shown now. */
  const more = async () => {
    const n = cursors().length
    // The days' menu stays open after a read and is drawn again as the read changes: open it only when it's shut.
    if (!(await page.getByRole('menuitem').first().isVisible())) await page.locator('.c3-day').first().click()
    await page.getByRole('menuitem', { name: 'Show earlier days' }).click()
    await expect.poll(() => cursors().length).toBe(n + 1)
    return cursors()[n]
  }
  /** The page held at the gate is let through as `answer`, with its input's view; the gate shuts again after. */
  const letThrough = async (answer: Answer) => {
    const n = views()
    gate.page = answer
    gate.open = true
    served.release()
    await expect.poll(views).toBe(n + 1)
    gate.open = false
  }
  /** The space read again while the page is held (20 s on); `later` ends that read at another instant. */
  const readAgain = async (answer: () => Answer, later?: Date) => {
    const reads = asked(ledger).controlled
    world.space = answer
    if (later) await page.clock.setFixedTime(later)
    await page.clock.fastForward(21_000)
    await expect.poll(() => asked(ledger).controlled).toBeGreaterThan(reads)
  }
  return { h, page, ledger, more, letThrough, readAgain }
}

const r2Old = (page: Page) => page.getByText('An older, private question from before.')

test('controlled · a refresh on its way keeps earlier days read while it was waiting', async ({ context }) => {
  const h = histories('answered')
  const world = controlledWorld(h)
  world.space = () => ({ json: space(h, { earlier: true }) })
  world.before = () => r2Page(7, 1)
  world.view = (inputId) => (inputId === IN.v ? { json: view(IN.v, R2_OLD) } : refusal(422, 'not_found', 'never'))
  const served = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await openPersonal(page)
  await showsHistories(page, h)

  world.space = () => 'hold'
  await page.clock.fastForward(21_000)
  await expect.poll(served.holding).toBe(1)
  await page.locator('.c3-day').first().click()
  await page.getByRole('menuitem', { name: 'Show earlier days' }).click()
  await expect(r2Old(page)).toBeVisible()

  // The refreshed result settles the cost at the same revision and epoch. The earlier days must still be shown.
  world.space = () => ({ json: space(h, { earlier: true, inputs: viewsOf(h, { settled: true }) }) })
  served.release()
  await expect(statusOf(page, h.w)).not.toContainText('cost not settled yet')
  await expect(r2Old(page)).toBeVisible()
  expect(served.ledger.filter((read) => read.includes('/answer-controls/turns?before=11')).length).toBeGreaterThan(1)
  expect(asked(served.ledger)).toMatchObject({ legacyAfterPin: 0, writes: [] })
})

test('R2 · read more joins the read it was read for, when that read is still the one shown', async ({ context }) => {
  const { page, ledger, more, letThrough } = await r2Crossing(context)
  expect(await more()).toBe('11')
  await letThrough(r2Page(7, 1))
  await expect(r2Old(page)).toBeVisible()
  expect(await more()).toBe('5') // joined: the next window is asked before it
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, writes: [] })
})

test('R2 · a newer revision read at the same instant never takes the older window; read more then reads against it', async ({
  context,
}) => {
  const { h, page, ledger, more, letThrough, readAgain } = await r2Crossing(context)
  expect(await more()).toBe('11')
  await readAgain(() => ({ json: space(h, { earlier: true, revision: 8 }) }))
  await letThrough(r2Page(7, 1))
  expect(await more()).toBe('11') // not joined: the read shown still begins at 11
  await expect(r2Old(page)).toHaveCount(0)
  // Read more against revision 8 joins its own window.
  await letThrough(r2Page(8, 1))
  await expect(r2Old(page)).toBeVisible()
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, writes: [] })
})

test('R2 · a new epoch read at the same instant never takes the erased epoch’s window', async ({ context }) => {
  const { h, page, ledger, more, letThrough, readAgain } = await r2Crossing(context)
  expect(await more()).toBe('11')
  await readAgain(() => ({ json: space(h, { epoch: 2, revision: 1, turns: [R2_AFTER], inputs: [], earlier: true }) }))
  await expect(page.getByText('A new beginning, after the erasure.')).toBeVisible()
  await letThrough(r2Page(7, 1))
  expect(await more()).toBe('31') // the erased epoch's window was let go
  await expect(r2Old(page)).toHaveCount(0)
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, writes: [] })
})

test('R2 · newer money at the same revision, epoch and instant stays; the older window isn’t joined to it', async ({
  context,
}) => {
  const { h, page, ledger, more, letThrough, readAgain } = await r2Crossing(context)
  expect(await more()).toBe('11')
  await expect(statusOf(page, h.w)).toContainText('cost not settled yet')
  await readAgain(() => ({ json: space(h, { earlier: true, inputs: viewsOf(h, { settled: true }) }) }))
  await expect(statusOf(page, h.w)).not.toContainText('cost not settled yet')
  await letThrough(r2Page(7, 1))
  expect(await more()).toBe('11') // the read the window was read for was replaced: not joined
  await expect(r2Old(page)).toHaveCount(0)
  await expect(statusOf(page, h.w)).not.toContainText('cost not settled yet') // the newer money stays
  await letThrough(r2Page(7, 1))
  await expect(r2Old(page)).toBeVisible()
  await expect(statusOf(page, h.w)).not.toContainText('cost not settled yet')
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, writes: [] })
})

test('R2 · a read that ended at another instant isn’t the one read for either: the window waits for the next', async ({
  context,
}) => {
  const { h, page, ledger, more, letThrough, readAgain } = await r2Crossing(context)
  expect(await more()).toBe('11')
  await readAgain(() => ({ json: space(h, { earlier: true }) }), new Date(T0 + 60_000))
  await letThrough(r2Page(7, 1))
  expect(await more()).toBe('11')
  await expect(r2Old(page)).toHaveCount(0)
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, writes: [] })
})

test('controlled · a failed controlled read is said, never the old read: absent, an unknown enum, Try again', async ({
  context,
}) => {
  const world = controlledWorld()
  world.space = () => refusal(503, 'projection_unavailable', 'never')
  const { ledger } = await serve(context, world)
  const page = await signedIn(context)
  await openPersonal(page)
  const conversation = page.getByLabel('Conversation with Sophia')
  const failed = conversation.getByText('Couldn’t load your personal space.')
  await expect(failed).toBeVisible()
  await expect(page.getByText('Here is a draft for Davide.')).toHaveCount(0)
  world.space = () => ({ json: { ...space(histories()), companion: 'somewhere' } })
  const reads = asked(ledger).controlled
  await conversation.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => asked(ledger).controlled, { timeout: 20_000 }).toBeGreaterThan(reads)
  await expect(failed).toBeVisible({ timeout: 20_000 })
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, legacyPoll: 0, writes: [] })
})

test('controlled · a refresh that fails keeps the last read, said as when it ended, and Try again reads it', async ({
  context,
}) => {
  const h = histories('answered')
  const world = controlledWorld(h)
  const { ledger } = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await openPersonal(page)
  await showsHistories(page, h)
  world.space = () => refusal(503, 'projection_unavailable', 'never')
  await page.clock.fastForward(21_000)
  const stale = page.locator('[data-stale]')
  await expect(stale).toContainText('Couldn’t read the latest; the last full read ended at')
  await expect(statusOf(page, h.x)).toBeVisible() // what was read stays, said as of then
  world.space = () => ({ json: space(h) })
  await stale.getByRole('button', { name: 'Try again' }).click()
  await expect(stale).toHaveCount(0)
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, legacyPoll: 0, writes: [] })
})

test('controlled · Copy reads every page against its epoch and copies the whole graph; an erasure since copies nothing', async ({
  context,
}) => {
  const h = histories('answered')
  const world = controlledWorld(h)
  const page1 = {
    exportedAt: ago(1),
    epoch: 1,
    turns: h.turns.slice(0, 3),
    next: 13,
    inputs: viewsOf(h).slice(0, 2),
    notes: NOTES,
    releases: [],
  }
  const page2 = { ...page1, exportedAt: ago(0), turns: h.turns.slice(3), next: null, inputs: viewsOf(h).slice(2) }
  world.exported = (after) => ({ json: after === 0 ? page1 : page2 })
  const { ledger } = await serve(context, world)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await signedIn(context)
  await openPersonal(page)
  await showsHistories(page, h)
  await page.getByRole('button', { name: 'Account' }).first().click()
  await page.getByRole('menuitem', { name: 'Your data' }).click()
  const sheet = page.getByRole('dialog', { name: 'Your data' })
  await sheet.locator('#c-data-copy').click()
  await expect(page.locator('.toast')).toHaveText('Copied to your clipboard')
  const text = await page.evaluate(() => navigator.clipboard.readText())
  for (const line of [
    '  Withdrawn after her answer was published',
    '  Held to replace an earlier message — not asked yet · answers are off',
    '  Cancelled before it was sent to Sophia',
    '  Withdrawn; work may already have started · cost not settled yet',
    `  Kept aside from call 1 (late settlement), at`,
    '  Not counted as time together',
    // R03: each control exactly as recorded, apart from the friendly words.
    '  Control: withdrawn · phase after_publication · held reason none',
    '  Control: held · phase none · held reason admission_off',
    '  Control: withdrawn · phase before_admission · held reason none',
    '  Control: withdrawn · phase after_launch · held reason none',
    '(The rest as of',
  ])
    expect(text).toContain(line)
  expect(ledger.filter((l) => l.includes('/answer-controls/export'))).toEqual([
    'GET /api/v1/personal/answer-controls/export?after=0',
    'GET /api/v1/personal/answer-controls/export?after=13',
  ])
  // Erased since the copy began: the page is refused (request_erased), and nothing new reaches the clipboard.
  await page.evaluate(() => navigator.clipboard.writeText('before'))
  world.exported = () => refusal(409, 'request_erased', 'never')
  await sheet.locator('#c-data-copy').click()
  await expect(page.locator('.toast').filter({ hasNotText: 'Copied to your clipboard' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('before')
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, writes: [] })
})

test('controlled · the padlock takes the space and the pin; a read on its way is let go, and unlocked it reads legacy first', async ({
  context,
}) => {
  const h = histories('answered')
  const world = controlledWorld(h)
  const { ledger, holding, release } = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await openPersonal(page)
  await showsHistories(page, h)
  // A refresh on its way when another tab shuts the padlock: its answer, when it comes, shows nothing.
  world.space = () => 'hold'
  await page.clock.fastForward(21_000)
  await expect.poll(holding).toBe(1)
  const other = await context.newPage()
  await other.goto(`${APP}/favicon.svg`)
  await other.evaluate((key) => localStorage.setItem(key, 'you'), LOCK_KEY)
  await expect(page.getByText('Here is a draft for Davide.')).toHaveCount(0)
  world.space = () => ({ json: space(h) })
  release()
  await page.clock.fastForward(60_000)
  await expect(page.getByText('Here is a draft for Davide.')).toHaveCount(0)
  const locked = ledger.length
  await page.clock.fastForward(60_000)
  expect(ledger.slice(locked).filter((l) => l.includes('/api/v1/personal'))).toEqual([])
  // Unlocked elsewhere: the pin went with the padlock, so the old read is asked first again, then C5's refusal.
  await other.evaluate((key) => localStorage.removeItem(key), LOCK_KEY)
  await page.getByRole('button', { name: 'Personal', exact: true }).click()
  await showsHistories(page, h)
  const after = ledger.slice(locked).filter((l) => l.includes('/api/v1/personal'))
  expect(after[0]).toMatch(/^GET \/api\/v1\/personal(\?|$)/)
  expect(asked(after)).toMatchObject({ legacyAfterPin: 0 })
  expect(after.some(isControlled)).toBe(true)
  expect(asked(ledger).writes).toEqual([])
})

test('controlled · signing out takes the space; reopened, the app reads the old way first again', async ({
  context,
}) => {
  const h = histories('answered')
  const { ledger } = await serve(context, controlledWorld(h))
  const page = await signedIn(context)
  await openPersonal(page)
  await showsHistories(page, h)
  const reloaded = ledger.length
  await page.reload()
  await page.getByRole('button', { name: 'Personal', exact: true }).click()
  await showsHistories(page, h)
  // A reload is a new cache: chosen again, the old way first, then pinned.
  const again = ledger.slice(reloaded).filter((l) => l.includes('/api/v1/personal'))
  expect(again[0]).toMatch(/^GET \/api\/v1\/personal(\?|$)/)
  expect(asked(again)).toMatchObject({ legacyAfterPin: 0 })
  await page.getByRole('button', { name: 'Account' }).first().click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.getByText('Here is a draft for Davide.')).toHaveCount(0)
  expect(asked(ledger).writes).toEqual([])
})

test('legacy · an uncontrolled owner reads the old way only: no controlled read, no status lines', async ({
  context,
}) => {
  const world = controlledWorld()
  world.legacy = () => ({ json: LEGACY })
  world.space = () => refusal(500, 'unexpected', 'never')
  const { ledger } = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await openPersonal(page)
  await expect(page.getByText('An ordinary day.')).toBeVisible()
  await page.clock.fastForward(30_000)
  expect(asked(ledger)).toMatchObject({ controlled: 0, writes: [] })
  expect(ledger.some((l) => l.includes('answer-controls') || l.includes('/answers/'))).toBe(false)
  await expect(page.locator('[data-control], [data-stale]')).toHaveCount(0)
})

/** A legacy space already open when another device first controls one of its inputs. */
function transitioningWorld(entry: 'waiting' | 'earlier') {
  const world = controlledWorld(histories('answered'))
  world.legacy = () => ({
    json: {
      ...LEGACY,
      earlier: entry === 'earlier',
      turns: LEGACY.turns.map((t) => ({ ...t, reply: entry === 'waiting' ? 'pending' : 'answered' })),
    },
  })
  world.waiting = () => 'hold'
  world.earlierLegacy = () => 'hold'
  world.space = () => 'hold'
  return world
}

async function beginLegacyRead(page: Page, entry: 'waiting' | 'earlier') {
  await openPersonal(page)
  await expect(page.getByText('An ordinary day.')).toBeVisible()
  if (entry === 'earlier') {
    await page.locator('.c3-day').first().click()
    await page.getByRole('menuitem', { name: 'Show earlier days' }).click()
  } else await expect(page.locator('.msg.typing')).toHaveCount(1)
}

test('C5 transition · concurrent legacy refusals keep the first controlled read on its way', async ({ context }) => {
  const world = transitioningWorld('waiting')
  const legacy = world.legacy
  world.legacy = () => ({
    ...legacy(),
    json: { ...LEGACY, earlier: true, turns: LEGACY.turns.map((t) => ({ ...t, reply: 'pending' })) },
  })
  const { ledger, holding, release } = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await beginLegacyRead(page, 'waiting')
  await page.locator('.c3-day').first().click()
  await page.getByRole('menuitem', { name: 'Show earlier days' }).click()
  await expect.poll(holding).toBe(2)
  world.waiting = () => C5
  world.earlierLegacy = () => C5
  release()
  await expect.poll(() => asked(ledger).controlled).toBe(1)
  await expect(page.getByText('An ordinary day.')).toHaveCount(0)
  await page.clock.fastForward(5000)
  expect(asked(ledger)).toMatchObject({ controlled: 1, legacyPoll: 2, writes: [] })
  expect(holding()).toBe(1)
  world.space = () => ({ json: space(histories('answered')) })
  release()
  await showsHistories(page, histories('answered'))
})

test('C5 transition · a late successful legacy poll cannot restart the held controlled read', async ({ context }) => {
  const world = transitioningWorld('waiting')
  world.legacy = () => ({
    json: { ...LEGACY, earlier: true, turns: LEGACY.turns.map((t) => ({ ...t, reply: 'pending' })) },
  })
  const { ledger, holding, release } = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await beginLegacyRead(page, 'waiting')
  await page.locator('.c3-day').first().click()
  await page.getByRole('menuitem', { name: 'Show earlier days' }).click()
  await expect.poll(holding).toBe(2)
  world.earlierLegacy = () => C5
  release()
  await expect.poll(() => asked(ledger).controlled).toBe(1)
  await expect.poll(holding).toBe(2) // the legacy poll and the first A55 read are still held
  world.waiting = () => ({ json: { revision: 4, turns: [], pending: false } })
  release()
  await expect.poll(holding).toBe(1)
  await page.clock.fastForward(5000)
  expect(asked(ledger)).toMatchObject({ controlled: 1, legacyPoll: 2, writes: [] })
  await expect(page.getByText('An ordinary day.')).toHaveCount(0)
  world.space = () => ({ json: space(histories('answered')) })
  release()
  await showsHistories(page, histories('answered'))
})

for (const entry of ['waiting', 'earlier'] as const) {
  test(`C5 transition · ${entry} switches an open legacy space, hides its cache and stops legacy polling`, async ({
    context,
  }) => {
    const world = transitioningWorld(entry)
    const { ledger, holding, release } = await serve(context, world)
    const page = await signedIn(context)
    await page.clock.install()
    await beginLegacyRead(page, entry)
    await expect.poll(holding).toBe(1)
    world.waiting = () => C5
    world.earlierLegacy = () => C5
    release()
    await expect.poll(() => asked(ledger).controlled).toBe(1)
    await expect(page.getByText('An ordinary day.')).toHaveCount(0)
    await expect(page.locator('.msg.typing')).toHaveCount(0)
    const legacyReads = asked(ledger).legacyPoll
    await page.clock.fastForward(5000)
    expect(asked(ledger).legacyPoll).toBe(legacyReads)
    world.space = () => refusal(503, 'unavailable', 'never')
    release()
    const conversation = page.getByLabel('Conversation with Sophia')
    await expect(conversation.getByText('Couldn’t load your personal space.')).toBeVisible()
    await page.clock.fastForward(5000)
    expect(asked(ledger).legacyPoll).toBe(legacyReads)
    await expect(page.getByText('An ordinary day.')).toHaveCount(0)
    world.space = () => ({ json: space(histories('answered')) })
    await conversation.getByRole('button', { name: 'Try again' }).click()
    await showsHistories(page, histories('answered'))
    expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, legacyPoll: legacyReads, writes: [] })
  })

  test(`C5 transition · ${entry} preserves a near-C5 ordinary failure without pinning`, async ({ context }) => {
    const world = transitioningWorld(entry)
    const { ledger, holding, release } = await serve(context, world)
    const page = await signedIn(context)
    await page.clock.install()
    await beginLegacyRead(page, entry)
    await expect.poll(holding).toBe(1)
    const ordinary = refusal(503, 'projection_unavailable', 'safe_read')
    world.waiting = () => ordinary
    world.earlierLegacy = () => ordinary
    release()
    await page.clock.fastForward(5000)
    await expect(page.getByText('An ordinary day.')).toBeVisible()
    expect(asked(ledger)).toMatchObject({ controlled: 0, writes: [] })
  })

  test(`C5 transition · ${entry} refused after the padlock shuts cannot restore a pin or start A55`, async ({
    context,
  }) => {
    const world = transitioningWorld(entry)
    const { ledger, holding, release } = await serve(context, world)
    const page = await signedIn(context)
    await page.clock.install()
    await beginLegacyRead(page, entry)
    await expect.poll(holding).toBe(1)
    const other = await context.newPage()
    await other.goto(`${APP}/favicon.svg`)
    await other.evaluate((key) => localStorage.setItem(key, 'you'), LOCK_KEY)
    await expect(page.getByText('An ordinary day.')).toHaveCount(0)
    world.waiting = () => C5
    world.earlierLegacy = () => C5
    release()
    await page.clock.fastForward(5000)
    expect(asked(ledger)).toMatchObject({ controlled: 0, writes: [] })
    // Settle ordinary legacy polls after unlock so this assertion concerns only the old aborted refusal.
    world.waiting = () => ({ json: { revision: 3, turns: [], pending: true } })
    await other.evaluate((key) => localStorage.removeItem(key), LOCK_KEY)
    await page.getByRole('button', { name: 'Personal', exact: true }).click()
    await expect(page.getByText('An ordinary day.')).toBeVisible()
    expect(asked(ledger).controlled).toBe(0)
  })
}

test('@phone controlled · at 390 the statuses, the kept answer and the stale line fit and work by touch', async ({
  context,
}) => {
  const h = histories('answered')
  const world = controlledWorld(h)
  const { ledger } = await serve(context, world)
  const page = await signedIn(context)
  await page.clock.install()
  await openPersonal(page)
  await showsHistories(page, h)
  await statusOf(page, h.w).getByRole('button', { name: 'Show the kept answer' }).tap()
  await expect(page.locator(`[data-kept="${h.w.id}"]`)).toBeVisible()
  world.space = () => refusal(503, 'projection_unavailable', 'never')
  await page.clock.fastForward(21_000)
  const stale = page.locator('[data-stale]')
  await expect(stale).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  world.space = () => ({ json: space(h) })
  await stale.getByRole('button', { name: 'Try again' }).tap()
  await expect(stale).toHaveCount(0)
  expect(asked(ledger)).toMatchObject({ legacyAfterPin: 0, legacyPoll: 0, writes: [] })
})
