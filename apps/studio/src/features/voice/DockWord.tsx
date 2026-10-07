// A dock control's icon and its words (docs/plans/phone-dock.md): on a phone the dock shows the icon alone, in a
// square (theme.css), and the words stay the control's name; on a computer, the words alone.
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@sophia/ui'

/** `badge`: a letter on the icon, where the words name someone (passing the floor: whose it becomes). */
export function DockWord({ icon, badge, children }: { icon: IconName; badge?: string; children: ReactNode }) {
  return (
    <>
      <span className="dock-icon" aria-hidden>
        <Icon name={icon} />
        {badge && <span className="dock-badge">{badge}</span>}
      </span>
      <span className="dock-word">{children}</span>
    </>
  )
}
