// The API Home's first run reads and writes on Home's fixture page (fixtures/home.tsx, e2e/home-first-run.spec.ts),
// answered in the page as the API would: GET/PUT /api/v1/me/profile, GET /api/v1/projects/archived and POST
// /api/v1/projects. The query string picks how: `first=new|named` (the profile's «Luis Pérez», not chosen or chosen);
// `archived=1` (one archived project) or `archived=fail` (its read fails); `profile=404` (a server with no profile to
// change) or `profile=hold` (its read waits for `release()`); `save=refuse` (422), `save=noreply` (the first save gets
// no reply, the next is answered), `save=stale` (the first save meets a name changed elsewhere: 409, the profile now
// «Luis P.» at revision 2) or `save=hold` (it waits for `release()`); `create=hold` (the project's creation waits).
// Each answered save is recorded as "name <name>" and each creation as "create <title>"; `puts` lists every save sent,
// as "<key> r<revision>".
import type { ProjectSummary } from '@sophia/contracts'

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

/** The API's refusal, as its error body says one. */
const refusal = (status: number, code: string, message: string) =>
  json({ code, message, requestId: '00000000-0000-4000-8000-0000000000bd', retry: 'never' }, status)

export const CREATED = '00000000-0000-4000-8000-0000000000f1'

/** A field of a request's JSON body, as text. */
function sentField(init: RequestInit | undefined, key: string): string {
  const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
  const value: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, key) : undefined
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

const keyOf = (init: RequestInit | undefined) => new Headers(init?.headers).get('idempotency-key') ?? ''

export interface FirstRunApi {
  /** Lets every held answer through (`profile=hold`, `save=hold`, `create=hold`), and every later one. */
  release: () => void
  /** Every save sent, as "<key> r<revision>". */
  puts: () => string[]
}

/** Answers held until `release()`, and every later one let through at once. */
function holder() {
  const held: (() => void)[] = []
  let holding = true
  return {
    later: (answer: () => Response) =>
      holding ? new Promise<Response>((resolve) => held.push(() => resolve(answer()))) : Promise.resolve(answer()),
    release: () => {
      holding = false
      for (const go of held.splice(0)) go()
    },
  }
}

/** The profile's save (PUT /api/v1/me/profile), as `save=…` says it goes. */
function profileSaves(query: URLSearchParams, pressed: string[], later: (answer: () => Response) => Promise<Response>) {
  let profile = { displayName: 'Luis Pérez', chosen: query.get('first') === 'named', revision: 1 }
  let save = query.get('save')
  const puts: string[] = []
  const saved = (init: RequestInit | undefined) => {
    const displayName = sentField(init, 'displayName')
    if (Number(sentField(init, 'expectedRevision')) !== profile.revision)
      return refusal(409, 'stale_revision', 'The profile changed')
    pressed.push(`name ${displayName}`)
    profile = { displayName, chosen: true, revision: profile.revision + 1 }
    return json(profile)
  }
  const put = (init: RequestInit | undefined): Promise<Response> => {
    puts.push(`${keyOf(init)} r${sentField(init, 'expectedRevision')}`)
    if (save === 'refuse') return Promise.resolve(refusal(422, 'invalid_display_name', 'Invalid display name'))
    if (save === 'noreply') {
      save = null
      return Promise.reject(new TypeError('Failed to fetch'))
    }
    if (save === 'stale') {
      save = null
      profile = { displayName: 'Luis P.', chosen: false, revision: 2 }
    }
    return save === 'hold' ? later(() => saved(init)) : Promise.resolve(saved(init))
  }
  const read = (): Promise<Response> => {
    if (query.get('profile') === '404') return Promise.resolve(refusal(404, 'not_found', 'Not found'))
    return query.get('profile') === 'hold' ? later(() => json(profile)) : Promise.resolve(json(profile))
  }
  return { put, read, puts: () => [...puts] }
}

export function installFirstRunApi(query: URLSearchParams, pressed: string[], old: ProjectSummary): FirstRunApi {
  const { later, release } = holder()
  const profile = profileSaves(query, pressed, later)
  if (!query.get('first')) return { release, puts: profile.puts }
  const archived = () =>
    query.get('archived') === 'fail'
      ? refusal(503, 'dependency_unavailable', 'The service is away')
      : json({ projects: query.get('archived') === '1' ? [old] : [], personalEpoch: 1 })
  const created = (init: RequestInit | undefined) => {
    pressed.push(`create ${sentField(init, 'title')}`)
    return json({ projectId: CREATED, cursor: '1' })
  }
  const create = (init: RequestInit | undefined) =>
    query.get('create') === 'hold' ? later(() => created(init)) : Promise.resolve(created(init))
  const real = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const route = `${init?.method ?? 'GET'} ${new URL(url, window.location.href).pathname}`
    if (route === 'PUT /api/v1/me/profile') return profile.put(init)
    if (route === 'GET /api/v1/me/profile') return profile.read()
    if (route === 'GET /api/v1/projects/archived') return Promise.resolve(archived())
    if (route === 'POST /api/v1/projects') return create(init)
    return real(input, init)
  }
  return { release, puts: profile.puts }
}
