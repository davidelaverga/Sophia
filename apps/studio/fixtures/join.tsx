// The guest's side of the door, on its own fixture page (docs/plans/lobby-guest.md): the Studio's own /join flow
// (JoinFlow), its four requests answered here instead of the API, and the call over the fake LiveKit every fixture
// page uses. The link's token is in the fragment, as an invitation link carries it.
//
// A guest's invitation (a member's needs the sign-in the fixture pages don't have); `state=expired|revoked|used_up`: a
// closed link;
// `session=1`: the invitation names a session; `answer=admit|deny|block`: how the room answers the knock (otherwise
// it waits until `window.joinFixture.answer(…)`). `window.joinFixture.asked` lists each request, in order.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { InvitationPreview, LobbyEntry } from '@sophia/contracts'
import { JoinFlow } from '../src/features/access/JoinFlow.tsx'
import { DEMO, DEMO_LABEL, DEMO_PROJECT } from './demo.ts'
import '../src/app/theme.css'

type Answer = 'admit' | 'deny' | 'block'

declare global {
  interface Window {
    joinFixture?: { asked: string[]; answer: (a: Answer) => void }
  }
}

const query = new URLSearchParams(window.location.search)
const STATES: readonly InvitationPreview['state'][] = ['open', 'expired', 'revoked', 'used_up']
const ANSWERS: readonly Answer[] = ['admit', 'deny', 'block']
// A link's token as access-view.ts reads one: 20 to 100 url-safe characters.
if (!window.location.hash) window.location.hash = 'fixtureInvitationTokenAbcdefghijklmnopqrstu'

const asked: string[] = []
const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

const preview: InvitationPreview = {
  projectTitle: DEMO ? DEMO_PROJECT : 'Fixture project',
  inviterName: DEMO ? 'lucia.marin@sophia.test' : 'host@sophia.test',
  kind: 'guest',
  role: null,
  email: null,
  expiresAt: at(-86_400_000),
  session:
    query.get('session') === '1'
      ? {
          id: '00000000-0000-4000-8000-0000000000c9',
          title: 'Pilot review',
          startsAt: at(-10 * 60_000),
          endsAt: at(-55 * 60_000),
          timeZone: 'UTC',
        }
      : null,
  state: STATES.find((st) => st === query.get('state')) ?? 'open',
}

let entry: LobbyEntry | null = null
const STATUS: Record<Answer, LobbyEntry['status']> = { admit: 'admitted', deny: 'denied', block: 'blocked' }

/** How the room answers: at once (`answer=`), or when the check says (`window.joinFixture.answer`). */
function answer(a: Answer) {
  if (entry) entry = { ...entry, status: STATUS[a], decidedAt: at(0) }
}
window.joinFixture = { asked, answer }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** The knock: a waiting entry, one knock more; answered at once with `answer=`. */
function knocked(init: RequestInit | undefined): Response {
  const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
  const said = typeof body === 'object' && body && 'displayName' in body ? body.displayName : null
  entry = {
    id: '00000000-0000-4000-8000-0000000000c8',
    displayName: typeof said === 'string' ? said : 'Guest',
    status: 'waiting',
    requestedAt: at(0),
    decidedAt: null,
    knocks: (entry?.knocks ?? 0) + 1,
  }
  const now = ANSWERS.find((a) => a === query.get('answer'))
  if (now) answer(now)
  return json(entry)
}

/** The four requests the door makes; anything else is a fixture's mistake and says so. */
function answerOf(path: string, init: RequestInit | undefined): Response {
  asked.push(path)
  if (path === '/api/v1/join/preview') return json(preview)
  if (path === '/api/v1/join/knock') return knocked(init)
  if (entry && path === `/api/v1/lobby/${entry.id}`) return json(entry)
  if (entry && path === `/api/v1/lobby/${entry.id}/room-token`) {
    return json({
      roomId: '00000000-0000-4000-8000-0000000000c7',
      serverUrl: 'wss://fixture.invalid',
      token: 'fixture',
      expiresAt: at(-3_600_000),
    })
  }
  return json({ code: 'not_found', message: `The fixture doesn't answer ${path}.` }, 404)
}

const real = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const href = input instanceof Request ? input.url : String(input)
  const url = new URL(href, window.location.href)
  return url.pathname.startsWith('/api/') ? Promise.resolve(answerOf(url.pathname, init)) : real(input, init)
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const guest = { name: 'Fixture guest', token: 'fixture-guest-token', role: 'guest' as const }

const root = document.getElementById('root')
if (!root) throw new Error('no #root')
createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note" data-demo={DEMO || undefined}>
      {DEMO ? DEMO_LABEL : 'Fixture · the guest’s side of the door'}
    </p>
    <QueryClientProvider client={queryClient}>
      <JoinFlow
        auth={{ status: 'signed_in', identity: guest }}
        onChooseDev={() => undefined}
        onSignOut={() => undefined}
        onOpenProject={() => undefined}
      />
    </QueryClientProvider>
  </StrictMode>,
)
