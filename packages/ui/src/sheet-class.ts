// A sheet's frame (SheetFrame.tsx; docs/plans/sheet-frame.md): the Studio's panel over the page, one frame for every
// sheet. Its numbers, as theme.css draws them: 420 px wide beside the page (the width on a phone), 12 · 20 · 28 of
// padding, a head of 36 with the title at 15/600 and Close a 28 px square 20 px from the edge, a veil at half. Pure:
// no React.

/** The frame's numbers, in px (the veil's alpha apart). */
export const SHEET = {
  width: 420,
  head: 36,
  close: 28,
  pad: { top: 12, side: 20, bottom: 28 },
  veil: 0.5,
} as const

/** The class attribute of the panel: `sheet`, then its own classes (a resource's, a task's). */
export function sheetClass(className?: string): string {
  const parts = ['sheet']
  if (className?.trim()) parts.push(className.trim())
  return parts.join(' ')
}

/** The class attribute of the head: `sheet-head`, then its own. */
export function sheetHeadClass(className?: string): string {
  const parts = ['sheet-head']
  if (className?.trim()) parts.push(className.trim())
  return parts.join(' ')
}
