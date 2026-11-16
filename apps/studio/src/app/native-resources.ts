// The native resources read flag (INC01-DES-002, docs/plans/inc01-resources-service-adapter.md): the project's
// Resources view, reading A51's member-safe catalog of enrolled native tools, shows only where the build sets
// VITE_SOPHIA_NATIVE_RESOURCES=1. Off by default. It is its own: the vision flag never turns it on, and it grants no
// write, control or backend permission. Off, the view stays hidden and the catalog is never read. import.meta.env
// exists only under Vite; unit tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

export const NATIVE_RESOURCES = env?.VITE_SOPHIA_NATIVE_RESOURCES === '1'
