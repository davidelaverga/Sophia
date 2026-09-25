// @sophia/persistence — Postgres access for the API and worker.
// Runs as a login granted `sophia_api` (never the migration owner or a service-role key).
export { createPool, checkRoleSafety, withActor, type PoolOptions, type TxMode } from './tx.ts'
export { classifyDbError } from './errors.ts'
export { migrate, readMigrations, MigrationDrift, type MigrationReport } from './migrate.ts'
export { readSnapshot } from './snapshot.ts'
export { admitGoalCommand } from './commands.ts'
export { createProject } from './projects.ts'
export { authorizeRoomJoin, transferInputFloor, type MemberRole } from './room.ts'
export { claimOutbox, expireDispatchLeases, recordDispatchResult, type OutboxRow } from './outbox.ts'
export { readEventFrames, type EventFrame, type EventPage } from './events.ts'
export { ProjectEventListener, PROJECT_EVENTS_CHANNEL, type ListenHandlers } from './listen.ts'
