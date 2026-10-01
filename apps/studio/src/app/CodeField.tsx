// A code from an email, typed where it is asked for (signing in, unlocking the personal space): digits only, 6 to 10
// of them (the length is a setting of the Supabase project), in one field with its button. The button waits as an
// outline until the code is long enough, and says "Checking…" while it is checked.
import { useEffect, useRef, useState } from 'react'

interface Props {
  id: string
  /** What the button does: "Sign in with code", "Unlock". */
  action: string
  busy: boolean
  /** Take the focus on arrival, where the code is the one thing left to do (unlocking). */
  focus?: boolean
  onCheck: (code: string) => void
}

export function CodeField({ id, action, busy, focus = false, onCheck }: Props) {
  const [code, setCode] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focus) input.current?.focus()
  }, [focus])
  return (
    <form
      className="field"
      onSubmit={(e) => {
        e.preventDefault()
        onCheck(code)
      }}
    >
      <label htmlFor={id} className="sr-only">
        Code from the email
      </label>
      <input
        ref={input}
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6,10}"
        maxLength={10}
        required
        placeholder="Code from the email"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      <button type="submit" className="pill primary" disabled={busy || code.length < 6}>
        {busy ? 'Checking…' : action}
      </button>
    </form>
  )
}
