// A field group (the kit's second piece, docs/plans/field-scale.md): an input with its press, or its select, in one
// box that theme.css draws as `.field`. It is 36 px tall and its press 28; a hero field (`size="lg"`: the sign-in
// address and code, the door's name) is 44 and its press 36. It renders a `div`, or a `form` when it is one, and
// everything else (`onSubmit`, `noValidate`, `aria-*`, `ref`) passes through untouched.
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { fieldClass, type FieldSize } from './field-class.ts'

interface Look {
  /** Its height on the scale: 36, or 44 for a hero field. */
  size?: FieldSize
  /** No fill behind it: a filter in a toolbar, a find line. */
  quiet?: boolean
  children?: ReactNode
}

type AsDiv = Look & { as?: 'div' } & Omit<ComponentPropsWithRef<'div'>, 'children'>
type AsForm = Look & { as: 'form' } & Omit<ComponentPropsWithRef<'form'>, 'children'>
export type FieldProps = AsDiv | AsForm

export function Field(props: FieldProps) {
  if (props.as === 'form') {
    const { as: _as, size, quiet, className, children, ...rest } = props
    return (
      <form
        {...rest}
        className={fieldClass({
          ...(size !== undefined && { size }),
          ...(quiet !== undefined && { quiet }),
          ...(className !== undefined && { className }),
        })}
      >
        {children}
      </form>
    )
  }
  const { as: _as, size, quiet, className, children, ...rest } = props
  return (
    <div
      {...rest}
      className={fieldClass({
        ...(size !== undefined && { size }),
        ...(quiet !== undefined && { quiet }),
        ...(className !== undefined && { className }),
      })}
    >
      {children}
    </div>
  )
}
