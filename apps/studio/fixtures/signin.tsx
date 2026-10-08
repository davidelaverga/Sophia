// The sign-in's fixture page (e2e/signin.spec.ts): the Studio's own email sign-in, with its two ports answered here
// instead of Supabase Auth. `fail=1`: the first email can't be sent, as when the Auth service is out of reach;
// `limit=1`: an email asked for again is refused with the wait Supabase gives, as hosted Auth does within its window;
// `limit=hour`: refused for the hour's emails, which gives no wait; `stall=1`: an email asked for again never answers.
// `window.signinFixture.sent` lists each address an email was sent to, for the checks to read.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EmailSignIn } from '../src/app/SignIn.tsx'
import { DEMO, DEMO_LABEL } from './demo.ts'
import '../src/app/theme.css'

declare global {
  interface Window {
    signinFixture?: { sent: string[] }
  }
}

const query = new URLSearchParams(window.location.search)
const sent: string[] = []
window.signinFixture = { sent }

const send = (email: string) =>
  new Promise<void>((done, fail) =>
    setTimeout(() => {
      sent.push(email)
      if (query.get('fail') === '1' && sent.length === 1) {
        fail(new Error('Couldn’t reach the sign-in service. Check your connection and try again.'))
      } else if (query.get('limit') === '1' && sent.length > 1) {
        fail(new Error('An email was just sent. You can ask for another in 17 seconds.'))
      } else if (query.get('limit') === 'hour' && sent.length > 1) {
        fail(new Error('Too many emails were sent in the last hour. The newest one still works; or try again later.'))
      } else if (query.get('stall') !== '1' || sent.length === 1) done()
      // stall=1: the second one never settles.
    }, 300),
  )
const verify = () => new Promise<void>((_, fail) => setTimeout(() => fail(new Error('That code didn’t work.')), 300))

const root = document.getElementById('root')
if (!root) throw new Error('signin.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note" data-demo={DEMO || undefined}>
      {DEMO ? DEMO_LABEL : 'Simulated — no Auth service, no email sent'}
    </p>
    <EmailSignIn notice={undefined} send={send} verify={verify} />
  </StrictMode>,
)
