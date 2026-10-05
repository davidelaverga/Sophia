// Labelled fixture data for the resource checks (e2e/resources.spec.ts): the three enrollments the continuation names
// (davide-codex, davide-claude, luis-claude), their accounts' capacity as their tools might report it, and one request
// waiting on Davide. Simulated: no tool, host or account was read, and the fixture page says so on screen.
import type { QuotaObservation, QuotaWindow, RequiredAction, Resource } from '../src/features/resources/resource.ts'

/** `stale=1`: Codex's reading stopped holding 10 minutes ago. */
export const expiredAt = () => new Date(NOW.getTime() - 10 * 60_000).toISOString()

/** The moment the page is read at: every age and reset counts from here. */
export const NOW = new Date('2026-10-02T12:00:00Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()

/** A drawn picture, as an account provider would give one; Luis has none, so his initial shows. */
const picture = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#7fd6c4"/><stop offset="1" stop-color="#6f8cff"/></linearGradient></defs>' +
    '<rect width="32" height="32" fill="url(#g)"/><circle cx="16" cy="13" r="6" fill="#0b0a0f" opacity=".55"/>' +
    '<path d="M5 32c1.5-7 6-10 11-10s9.5 3 11 10z" fill="#0b0a0f" opacity=".55"/></svg>',
)}`

/** The levels each tool says its sessions can start with (its native catalog), as a host would report them. */
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode']
const GPT_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'ultra']

export const people = {
  davide: { id: 'davide', name: 'Davide', avatarUrl: picture },
  luis: { id: 'luis', name: 'Luis', avatarUrl: null },
} as const

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
        model: 'gpt-6.1-sol',
        effort: 'ultra',
        efforts: GPT_EFFORTS,
        assignment: {
          workId: 'work-2',
          title: 'Review the report pane',
          state: 'running',
          id: 'assignment-codex-reviewer',
          epoch: 1,
        },
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
        mode: 'ultracode',
        efforts: CLAUDE_EFFORTS,
        assignment: {
          workId: 'work-1',
          title: 'Implement the PDF retry',
          state: 'waiting',
          id: 'assignment-claude-worker',
          epoch: 3,
        },
      },
      {
        id: 'claude-reviewer',
        role: 'reviewer',
        model: 'claude-sonnet-5-5',
        effort: null,
        efforts: CLAUDE_EFFORTS,
        assignment: null,
      },
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
  window_epoch: `${window_id}@${resetsIn}`,
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

/** `busy=1`: Davide's Claude Code at 95 % of its 5-hour window, with 80 % of it passed when read: ahead of pace. */
export const busyClaude = (o: QuotaObservation): QuotaObservation => ({
  ...o,
  windows: o.windows.map((w) => (w.window_id === 'five_hour' ? percent('five_hour', 95, 59) : w)),
})

/**
 * `tight=1`: Davide's Claude Code at 81 % of its 5-hour window halfway through it: at this pace it is used up in ~35
 * min, ~2 h before it resets, while his Codex has room.
 */
export const tightClaude = (o: QuotaObservation): QuotaObservation => ({
  ...o,
  windows: o.windows.map((w) => (w.window_id === 'five_hour' ? percent('five_hour', 81, 150) : w)),
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
 * Earlier readings of Davide's two accounts, as a store that keeps more than the latest would serve them: every 40
 * minutes before the latest, each window climbing to where it is now. Same windows, same resets: one window's history.
 */
export function earlierReadings(latest: readonly QuotaObservation[]): QuotaObservation[] {
  const climbing = [0.3, 0.45, 0.6, 0.72, 0.86]
  return latest
    .filter((o) => o.entitlement_id === 'ent-davide-anthropic' || o.entitlement_id === 'ent-davide-openai')
    .flatMap((o) =>
      climbing.map((share, i) => ({
        ...o,
        observation_id: `${o.observation_id}-earlier-${i}`,
        observed_at: new Date(Date.parse(o.observed_at) - (climbing.length - i) * 40 * 60_000).toISOString(),
        windows: o.windows.map((w) => (w.value === null ? w : { ...w, value: Math.round(w.value * share) })),
      })),
    )
}

/** A request that comes to wait while the page is open (resourcesFixture.addRequest): Codex asks Davide to edit. */
export const arriving = (n: number): RequiredAction => ({
  id: `action-arriving-${n}`,
  workId: 'work-2',
  resourceId: 'davide-codex',
  sessionId: 'codex-reviewer',
  ownerId: 'davide',
  operation: 'Edit a file: apps/studio/src/features/report/ReportPane.tsx',
  deadline: at(30),
  state: 'open',
  openTarget: null,
})

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
    sessions: [{ id: 'grok-researcher', role: 'researcher', model: 'grok-4', effort: null, assignment: null }],
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
        effort: 'high',
        assignment: {
          workId: 'onboarding-copy',
          title: 'Draft the onboarding copy',
          state: 'queued',
          id: 'assignment-gemini-worker',
          epoch: 1,
        },
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
