// A code from an email, typed where it is asked for (signing in, unlocking the personal space): digits only, 6 to 10
// of them (the length is a setting of the Supabase project), in one field with its button. The button waits as an
// outline until the code is long enough, and says "Checking…" while it is checked.
import { useEffect, useRef, useState } from 'react'
import { Field } from '@sophia/ui'

interface Props {
  id: string
  /** What the button does: "Sign in with code", "Unlock". */
  action: string
  busy: boolean
  /** Take the focus on arrival, where the code is the one thing left to do (unlocking). */
  focus?: boolean
  /** The id of the words that say the code was refused: the field is marked invalid, described by them, and its digits
   * selected so the next ones typed replace them (docs/plans/signin-hierarchy.md). */
  invalid?: string | undefined
  onCheck: (code: string) => void
  /** The code was changed: a refusal said of the old one no longer stands. */
  onEdit?: (() => void) | undefined
}

export function CodeField({ id, action, busy, focus = false, invalid, onCheck, onEdit }: Props) {
  const [code, setCode] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focus) input.current?.focus()
  }, [focus])
  useEffect(() => {
    if (!invalid) return
    input.current?.focus()
    input.current?.select()
  }, [invalid])
  return (
    <Field
      as="form"
      size="lg"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) onCheck(code)
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
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, ''))
          onEdit?.()
        }}
      />
      <button
        type="submit"
        className="pill primary"
        // Checking keeps the focus on the button (aria-disabled); a code too short isn't a press yet (disabled).
        disabled={!busy && code.length < 6}
        aria-disabled={busy || undefined}
      >
        {busy ? 'Checking…' : action}
      </button>
    </Field>
  )
}
