// A search (docs/plans/field-scale.md): one look for every place that narrows a list by what is typed. Its box
// (`.search`) places the magnifier; its input is 36 px, on the field scale, with the words inset past the glass. The
// box carries the tip when given one (`has-tip` + `Tip`); the input names itself (`aria-label`) and takes `ref`,
// `value`, `onChange`, `onKeyDown`, `placeholder` and the rest untouched. Its width is its place's: pass the place's
// class (`className`) for that.
import type { ComponentPropsWithRef } from 'react'
import { searchClass } from './field-class.ts'
import { Tip } from './Tip.tsx'

interface TipWords {
  label: string
  keys?: string
  side?: 'top' | 'bottom'
  align?: 'center' | 'end'
}

export interface SearchProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'className'> {
  /** The box's own classes (its width in its row). */
  className?: string
  /** A hint on hover and focus: what it does, and its key. */
  tip?: TipWords
}

export function Search({ className, tip, ...rest }: SearchProps) {
  return (
    <span className={searchClass(className, tip !== undefined)}>
      <input {...rest} type="search" />
      {tip && (
        <Tip
          label={tip.label}
          {...(tip.keys !== undefined && { keys: tip.keys })}
          {...(tip.side !== undefined && { side: tip.side })}
          {...(tip.align !== undefined && { align: tip.align })}
        />
      )}
    </span>
  )
}
