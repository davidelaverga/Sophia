// @sophia/persistence — Postgres access for the API and worker.
// Runs as a login granted `sophia_api` (never the migration owner or a service-role key).
export { createPool, checkRoleSafety, withActor, type TxMode } from './tx.ts'
export { classifyDbError } from './errors.ts'
export { migrate, readMigrations, MigrationDrift, type MigrationReport } from './migrate.ts'
export { readSnapshot } from './snapshot.ts'
export { admitGoalCommand } from './commands.ts'
export { createProject } from './projects.ts'
export { claimOutbox, expireDispatchLeases, recordDispatchResult, type OutboxRow } from './outbox.ts'
export { readEventFrames, type EventFrame, type EventPage } from './events.ts'
export { listenForProjectEvents, PROJECT_EVENTS_CHANNEL } from './listen.ts'
