import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import { begin } from './app/entry.ts'
import { bootTheme } from './app/theme.ts'
import './app/theme.css'

// The app runs: on the way in from a sign-in, the opening takes its next step (docs/plans/entry-opening.md).
bootTheme()
begin()

const root = document.getElementById('root')
if (!root) throw new Error('index.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
