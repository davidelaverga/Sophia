// Where the API lives. Development leaves VITE_API_URL empty and calls /api on the Studio's own
// origin through the Vite proxy; a deployed Studio calls the API origin directly (CORS-allowed).
// import.meta.env exists only under Vite; unit tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

export const API_BASE = (env?.VITE_API_URL ?? '').replace(/\/+$/, '')

export const apiUrl = (path: `/api/${string}`) => `${API_BASE}${path}`
