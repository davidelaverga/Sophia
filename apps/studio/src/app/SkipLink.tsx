// Skip to content (docs/plans/skip-link.md): first in the tab order on every page, shown once focused, takes the focus
// past the header to the page's content. It moves the focus, never the address: the Studio's anchors (#conversation-…,
// #task-…) live there. Each screen marks its content (data-content); several stay mounted at once (Places' three, a
// project kept behind a call), so the link takes the first marked one on screen.

/** The page's content now: the first marked element that is drawn. */
const contentNow = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-content]')).find((el) => el.getClientRects().length > 0) ??
  null

export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#content"
      onClick={(e) => {
        e.preventDefault()
        const content = contentNow()
        if (!content) return
        if (!content.hasAttribute('tabindex')) content.tabIndex = -1
        content.focus()
      }}
    >
      Skip to content
    </a>
  )
}
