import { useRef, useState } from 'react'
import { addressProblem } from '../../app/mail-home.ts'

/**
 * An email field that says what is wrong with the address in the page's own words, under it, and not in the browser's
 * bubble (the form is `noValidate`): checked on Send, the words gone once the address changes (docs/plans/visual-fit.md).
 */
export function useAddressField(id: string) {
  const [email, setEmail] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const errorId = `${id}-error`
  /** Whether the address can be sent; if not, the words show and the focus goes back to it. */
  const check = () => {
    const found = addressProblem(email)
    setProblem(found)
    if (found) field.current?.focus()
    return found === null
  }
  const input = {
    id,
    ref: field,
    value: email,
    'aria-invalid': problem !== null || undefined,
    'aria-describedby': problem ? errorId : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value)
      setProblem(null)
    },
  }
  const error = problem && (
    <p id={errorId} className="form-error" role="alert">
      {problem}
    </p>
  )
  return { email, setEmail, check, input, error }
}
