// @sophia/test-support — synthetic fixtures and disposable infrastructure. Never live evidence.
export {
  createEmptyDatabase,
  createTestDatabase,
  withClusterMigrationLock,
  type EmptyDatabase,
  type TestDatabase,
} from './database.ts'
export { registerRuntime, seedProject, type RegisteredRuntime, type SeededProject } from './seed.ts'
export { assertGrowth, growth, type Growth, type GrowthOptions, type Timed } from './growth.ts'
