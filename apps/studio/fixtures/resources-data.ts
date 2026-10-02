// Labelled fixture data for the resource checks (e2e/resources.spec.ts): the three enrollments the continuation names
// (davide-codex, davide-claude, luis-claude), their accounts' capacity as their tools might report it, and one request
// waiting on Davide. Simulated: no tool, host or account was read, and the fixture page says so on screen.
import type { QuotaObservation, QuotaWindow, RequiredAction, Resource } from '../src/features/resources/resource.ts'

/** `stale=1`: Codex's reading stopped holding 10 minutes ago. */
export const expiredAt = () => new Date(NOW.getTime() - 10 * 60_000).toISOString()

/** The moment the page is read at: every age and reset counts from here. */
export const NOW = new Date('2026-10-02T12:00:00Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()

export const people = { davide: { id: 'davide', name: 'Davide' }, luis: { id: 'luis', name: 'Luis' } } as const

export const resources: Resource[] = [
  {
    id: 'davide-codex',
    owner: people.davide,
    tool: 'codex',
    entitlementId: 'ent-davide-openai',
    host: { state: 'online', observedAt: at(-2) },
    sessions: [
      {
        id: 'codex-reviewer',
        role: 'reviewer',
        model: null,
        effort: null,
        assignment: { workId: 'work-2', title: 'Review the report pane', state: 'running' },
      },
    ],
    controls: { steer: 'unqualified', hold: 'supported', stop: 'supported', permissions: 'unqualified' },
    reservePercent: 20,
  },
  {
    id: 'davide-claude',
    owner: people.davide,
    tool: 'claude-code',
    entitlementId: 'ent-davide-anthropic',
    host: { state: 'online', observedAt: at(-1) },
    sessions: [
      {
        id: 'claude-worker',
        role: 'worker',
        model: 'claude-opus-5-5',
        effort: 'high',
        assignment: { workId: 'work-1', title: 'Implement the PDF retry', state: 'waiting' },
      },
      { id: 'claude-reviewer', role: 'reviewer', model: 'claude-opus-5-5', effort: null, assignment: null },
    ],
    controls: { steer: 'supported', hold: 'supported', stop: 'supported', permissions: 'unqualified' },
    reservePercent: null,
  },
  {
    id: 'luis-claude',
    owner: people.luis,
    tool: 'claude-code',
    entitlementId: 'ent-luis-anthropic',
    host: { state: 'unknown', observedAt: at(-180) },
    sessions: [{ id: 'luis-worker', role: 'worker', model: null, effort: null, assignment: null }],
    controls: { steer: 'unqualified', hold: 'unqualified', stop: 'unqualified', permissions: 'unqualified' },
    reservePercent: null,
  },
]

const percent = (window_id: string, value: number, resetsIn: number): QuotaWindow => ({
  window_id,
  unit: 'percent_used',
  value,
  resets_at: at(resetsIn),
  scope: 'account',
  applicability: 'known',
  state: 'observed',
})

/** `busy=1`: Codex's account nearly used up: its 5-hour window at 92 % (red), its 7-day at 78 % (amber). */
export const busyCodex = (o: QuotaObservation): QuotaObservation => ({
  ...o,
  windows: [percent('five_hour', 92, 40), percent('seven_day', 78, 3 * 1440)],
})

/** `spent=1`: Codex's spend limit passed, at 120 % (a spend percentage has no ceiling). */
export const spentCodex = (o: QuotaObservation): QuotaObservation => ({
  ...o,
  windows: [...o.windows, { ...percent('spend_limit', 120, 10 * 1440), unit: 'spend_percent_used', scope: 'spend' }],
})

export const observations: QuotaObservation[] = [
  {
    observation_id: 'obs-codex',
    owner_id: 'davide',
    entitlement_id: 'ent-davide-openai',
    resource_ids: ['davide-codex'],
    provider: 'openai',
    source_channel: 'codex-app-server',
    observed_at: at(-2),
    valid_until: null,
    coverage: 'complete_for_route',
    windows: [percent('five_hour', 42, 120), percent('seven_day', 18, 4 * 1440)],
    missing_capabilities: [],
  },
  {
    observation_id: 'obs-claude',
    owner_id: 'davide',
    entitlement_id: 'ent-davide-anthropic',
    resource_ids: ['davide-claude'],
    provider: 'anthropic',
    source_channel: 'claude-code-statusline',
    observed_at: at(-1),
    valid_until: null,
    coverage: 'partial',
    // The 7-day reset is already due: refresh pending until the tool reports again, not fresh capacity. The model's
    // own window may not apply to this resource: it is shown, and doesn't limit it.
    windows: [
      percent('five_hour', 63, 55),
      percent('seven_day', 71, -60),
      { ...percent('seven_day_opus', 88, 2 * 1440), scope: 'model', applicability: 'unknown' },
    ],
    missing_capabilities: ['spend limit'],
  },
  {
    observation_id: 'obs-luis',
    owner_id: 'luis',
    entitlement_id: 'ent-luis-anthropic',
    resource_ids: ['luis-claude'],
    provider: 'anthropic',
    source_channel: 'claude-code-statusline',
    observed_at: at(-180),
    valid_until: null,
    coverage: 'unavailable',
    windows: [],
    missing_capabilities: ['rate limits'],
  },
]

export const actions: RequiredAction[] = [
  {
    id: 'action-1',
    workId: 'work-1',
    resourceId: 'davide-claude',
    sessionId: 'claude-worker',
    ownerId: 'davide',
    operation: 'Run a shell command: pnpm --filter @sophia/report test',
    deadline: at(40),
    state: 'open',
    openTarget: null,
  },
]

/**
 * `more=1`: two more tools, to see the panel past the three enrollments the continuation names. A Grok session on
 * Davide's xAI account with no reading yet, and a Gemini CLI session on Luis's Google account that reports a balance.
 */
export const moreResources: Resource[] = [
  {
    id: 'davide-grok',
    owner: people.davide,
    tool: 'grok',
    entitlementId: 'ent-davide-xai',
    host: { state: 'offline', observedAt: at(-26 * 60) },
    sessions: [{ id: 'grok-researcher', role: 'researcher', model: null, effort: null, assignment: null }],
    controls: { steer: 'unqualified', hold: 'unqualified', stop: 'unqualified', permissions: 'unsupported' },
    reservePercent: null,
  },
  {
    id: 'luis-gemini',
    owner: people.luis,
    tool: 'gemini-cli',
    entitlementId: 'ent-luis-google',
    host: { state: 'online', observedAt: at(-4) },
    sessions: [
      {
        id: 'gemini-worker',
        role: 'worker',
        model: 'gemini-2.5-pro',
        effort: null,
        assignment: { workId: 'work-3', title: 'Draft the onboarding copy', state: 'queued' },
      },
    ],
    controls: { steer: 'unqualified', hold: 'supported', stop: 'supported', permissions: 'unqualified' },
    reservePercent: 10,
  },
]

export const moreObservations: QuotaObservation[] = [
  {
    observation_id: 'obs-gemini',
    owner_id: 'luis',
    entitlement_id: 'ent-luis-google',
    resource_ids: ['luis-gemini'],
    provider: 'google',
    source_channel: 'gemini-cli-stats',
    observed_at: at(-4),
    valid_until: null,
    coverage: 'complete_for_route',
    windows: [
      {
        window_id: 'daily_requests',
        unit: 'credits_remaining',
        value: 820,
        resets_at: at(9 * 60),
        scope: 'account',
        applicability: 'known',
        state: 'observed',
      },
    ],
    missing_capabilities: [],
  },
]
