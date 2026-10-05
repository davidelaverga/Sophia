/**
 * The plugin's manifest (PaperclipPluginManifestV1 at the pinned source). Its routes are the Sophia-owned plugin
 * routes of 03_PAPERCLIP_INTEGRATION §4, declared through the manifest's `apiRoutes` contract: board callers only (the
 * integration board principal), the company resolved by the host from the body or from the issue, never from a
 * free field. Capabilities are the issue, wakeup, managed-agent and namespace ones the handlers use, and the schedule
 * of the one job that settles status writes, nothing broader.
 * @module @sophia/paperclip-plugin/manifest
 */
import { PLUGIN_ID, ROUTES } from '@sophia/coordination/plugin-wire'

/** The managed agent commissioned issues are assigned to; its adapter is the external `sophia_dsh` adapter. */
export const REVIEWER_AGENT_KEY = 'source-reviewer'

/** The job that settles status writes no delivery settled (coordination.ts, settleOpenWrites). */
export const SETTLE_JOB_KEY = 'settle-status-writes'

export const manifest = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: '0.1.0',
  displayName: 'Sophia coordination',
  description:
    "Turns Sophia's signed source-review commissions into core issues assigned to Sophia's source reviewer, and mirrors Sophia's Hold, Resume and Stop onto them. Sophia keeps the decisions, permits and source text.",
  author: 'Sophia',
  categories: ['automation'],
  capabilities: [
    'api.routes.register',
    'database.namespace.migrate',
    'database.namespace.read',
    'database.namespace.write',
    'issues.read',
    'issues.create',
    'issues.update',
    'issues.wakeup',
    'agents.managed',
    'jobs.schedule',
  ],
  entrypoints: { worker: './dist/worker.js' },
  database: { migrationsDir: 'migrations', coreReadTables: ['issues', 'heartbeat_runs'] },
  jobs: [
    {
      jobKey: SETTLE_JOB_KEY,
      displayName: 'Settle status writes',
      description:
        'Settles any status write on a Sophia issue that its own delivery could not settle, so a late write never undoes a later control.',
      schedule: '* * * * *',
    },
  ],
  agents: [
    {
      agentKey: REVIEWER_AGENT_KEY,
      displayName: 'Sophia source reviewer',
      role: 'review',
      title: 'Source reviewer (Sophia)',
      capabilities:
        "Runs one bounded source review that Sophia admitted, through Sophia's own runtime. It holds no provider credential.",
      adapterType: 'sophia_dsh',
      adapterPreference: ['sophia_dsh'],
      instructions: { content: 'Sophia runs this work and decides whether it may run; Paperclip tracks it.' },
    },
  ],
  apiRoutes: [
    {
      routeKey: 'commission',
      method: 'POST',
      path: ROUTES.commission,
      auth: 'board',
      capability: 'api.routes.register',
      companyResolution: { from: 'body', key: 'companyId' },
    },
    {
      routeKey: 'lookup',
      method: 'POST',
      path: ROUTES.lookup,
      auth: 'board',
      capability: 'api.routes.register',
      companyResolution: { from: 'body', key: 'companyId' },
    },
    {
      routeKey: 'control',
      method: 'POST',
      path: '/issues/:issueId/control',
      auth: 'board',
      capability: 'api.routes.register',
      companyResolution: { from: 'issue', param: 'issueId' },
    },
  ],
} as const
