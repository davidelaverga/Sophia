// A browser notification while the tab is hidden (docs/plans/knock-alert.md, decision-alert.md): only where this
// browser can notify and has been allowed to; pressed, it brings the tab back.

/** Whether this browser can notify, and has been allowed to. */
export const canNotify = () => typeof Notification !== 'undefined' && Notification.permission === 'granted'

/** Says it beyond the tab, only while the tab is hidden: a tab on screen says it itself. */
export function notifyHidden(title: string, body: string, tag: string): void {
  if (!document.hidden || !canNotify()) return
  const shown = new Notification(title, { body, tag })
  shown.addEventListener(
    'click',
    () => {
      window.focus()
      shown.close()
    },
    { once: true },
  )
}
