// A press (the kit's first piece, docs/plans/control-heights.md): one element for every button the Studio draws, so
// its look (kind) and its height (size) come from one place and every single-line press stands on one of four
// heights. It renders the `<button>` theme.css already styles, with `type="button"` unless told otherwise, and carries
// its tip when given one (`has-tip` + `Tip`: the tip is decorative; the press names itself with `aria-label` or its
// words). Everything else (`aria-*`, `onClick`, `disabled`, `ref`) passes through untouched.
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { buttonClass, type ButtonKind, type ButtonSize } from './button-class.ts'
import { Tip } from './Tip.tsx'

interface TipWords {
  label: string
  keys?: string
  side?: 'top' | 'bottom'
  align?: 'center' | 'end'
}

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** What it looks like; a pill unless said. */
  kind?: ButtonKind
  /** Its height on the scale; each kind's own unless said. */
  size?: ButtonSize
  /** A hint on hover and focus: what it does, and its key. */
  tip?: TipWords
  children?: ReactNode
}

export function Button({ kind, size, tip, className, type = 'button', children, ...rest }: ButtonProps) {
  const look = { ...(kind !== undefined && { kind }), ...(size !== undefined && { size }) }
  return (
    <button
      {...rest}
      type={type}
      className={buttonClass({ ...look, tip: tip !== undefined, ...(className !== undefined && { className }) })}
    >
      {children}
      {tip && (
        <Tip
          label={tip.label}
          {...(tip.keys !== undefined && { keys: tip.keys })}
          {...(tip.side !== undefined && { side: tip.side })}
          {...(tip.align !== undefined && { align: tip.align })}
        />
      )}
    </button>
  )
}
