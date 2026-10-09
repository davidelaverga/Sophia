// The Studio app's fixture page (e2e/app-auth.spec.ts), served from the Studio's own index.html by its own server
// (vite.app.config.ts), whose Supabase Auth is a synthetic one the checks answer in the page. Only the entry is this
// file, as src/main.tsx is: App, its sign-in (auth.ts) and the Supabase client are the Studio's own, unchanged.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../src/app/App.tsx'
import { begin } from '../src/app/entry.ts'
import '../src/app/theme.css'

begin()

const root = document.getElementById('root')
if (!root) throw new Error('index.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — the Studio app, signed in by a synthetic Auth service, no account
    </p>
    <App />
  </StrictMode>,
)
