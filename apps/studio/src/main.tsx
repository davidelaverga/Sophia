import '@fontsource-variable/instrument-sans'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
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
