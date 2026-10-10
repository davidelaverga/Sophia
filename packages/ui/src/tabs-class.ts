// A tab strip's classes (Tabs.tsx; docs/plans/tabs-scale.md): a row of tabs under a line, the one that is on marked by
// its own line. It stands on the field scale, 36 px, as the segmented box and the field do; the Invite sheet's, the
// room's side panel's and the report viewer's strips measured 34, 36 and 38 before. Pure: no React.

/** The height of a tab strip and each of its tabs, in px. */
export const TAB_HEIGHT = 36

/** The class attribute of the strip: `tabs`, then its own classes (its place in a row, its line below). */
export function tabsClass(className?: string): string {
  const parts = ['tabs']
  if (className?.trim()) parts.push(className.trim())
  return parts.join(' ')
}
