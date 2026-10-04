// The brand's fixture page (e2e/brand.spec.ts): the sign-in screen (SignIn's Centered) as it opens, with Umbral beside
// the word, and the mark at 16, 32 and 48 px, at rest and live, for the checks to measure.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Mark } from '../src/app/Mark.tsx'
import { Centered } from '../src/app/SignIn.tsx'
import '../src/app/theme.css'

const root = document.getElementById('root')
if (!root) throw new Error('brand.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — the sign-in screen and the mark, no account
    </p>
    <Centered title="Sign in to Sophia" />
    <div className="fixture-sizes">
      <span data-size="16">
        <Mark size={16} />
      </span>
      <span data-size="32">
        <Mark size={32} />
      </span>
      <span data-size="48">
        <Mark size={48} />
      </span>
      <span data-size="48-live">
        <Mark size={48} live />
      </span>
    </div>
  </StrictMode>,
)
