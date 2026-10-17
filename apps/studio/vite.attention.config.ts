import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import app from './vite.app.config.ts'

// The Studio app (fixtures/app.tsx) as a build with the attention flag and WITHOUT the vision flag (e2e-attention/,
// docs/handoffs/FND-C-ATTENTION-BOUNDARY-attempt-1.md): Home reads A15's needs and Updates A34's window through the
// contract's parser, and nothing else of the vision flag shows. `SOPHIA_ATTENTION_PAGE=off` is the same build with neither
// flag, on the other port: the default, where neither shows. The fixtures' config sets the vision flag as it is read;
// this one, read after it, takes it back. Its own port and dependency cache, as the app's server has.
const off = process.env.SOPHIA_ATTENTION_PAGE === 'off'
const port = off ? 5199 : 5198
// The synthetic Auth service at this server's own address, as the app's server has it at its own.
process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${String(port)}/synthetic-auth`
process.env.VITE_SOPHIA_VISION = '0'
process.env.VITE_SOPHIA_ATTENTION = off ? '0' : '1'

export default mergeConfig(app, {
  server: { port },
  cacheDir: fileURLToPath(new URL(`./node_modules/.vite-attention${off ? '-off' : ''}`, import.meta.url)),
})
