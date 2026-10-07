// A dock control's icon and its words (docs/plans/phone-dock.md): on a phone the dock shows the icon alone, in a
// square (theme.css), and the words stay the control's name; on a computer, the words alone.
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@sophia/ui'

interface Props {
  icon: IconName
  /** A letter on the icon, where the words name someone (passing the floor: whose it becomes). */
  badge?: string
  /** For a control with no tip of its own: its words, shown on a phone while it is pressed and held. */
  said?: string
  children: ReactNode
}

export function DockWord({ icon, badge, said, children }: Props) {
  return (
    <>
      <span className="dock-icon" aria-hidden>
        <Icon name={icon} />
        {badge && <span className="dock-badge">{badge}</span>}
      </span>
      <span className="dock-word">{children}</span>
      {said && (
        <span className="tip dock-tip" aria-hidden>
          {said}
        </span>
      )}
    </>
  )
}
