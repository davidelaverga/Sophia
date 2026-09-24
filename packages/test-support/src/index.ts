// @sophia/test-support — synthetic fixtures and disposable infrastructure. Never live evidence.
export {
  createEmptyDatabase,
  createTestDatabase,
  withClusterMigrationLock,
  type EmptyDatabase,
  type TestDatabase,
} from './database.ts'
export { seedProject, type SeededProject } from './seed.ts'
