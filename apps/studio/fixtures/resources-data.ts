// Labelled fixture data for the resource checks (e2e/resources.spec.ts): the three enrollments the continuation names
// (davide-codex, davide-claude, luis-claude), their accounts' capacity as their tools might report it, and one request
// waiting on Davide. Simulated: no tool, host or account was read, and the fixture page says so on screen.
import type { QuotaObservation, QuotaWindow, RequiredAction, Resource } from '../src/features/resources/resource.ts'

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
    // The 7-day reset is already due: refresh pending until the tool reports again, not fresh capacity.
    windows: [percent('five_hour', 63, 55), percent('seven_day', 71, -60)],
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
