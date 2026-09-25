import '@fontsource-variable/instrument-sans/wdth.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import './app/theme.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
