// The terms and the privacy notice's fixture page (e2e/terms-privacy.spec.ts): the Studio's own LegalPage, as `/terms`
// and `/privacy` draw it. `doc=terms|privacy` picks the document.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LegalPage } from '../src/app/Legal.tsx'
import '../src/app/theme.css'
import { bootTheme } from '../src/app/theme.ts'

const query = new URLSearchParams(window.location.search)
bootTheme(query.get('theme'))
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <LegalPage doc={query.get('doc') === 'privacy' ? 'privacy' : 'terms'} />
    </StrictMode>,
  )
}
