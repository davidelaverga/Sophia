// What a view that failed to draw says (docs/plans/view-boundary.md): that it couldn't, that the rest is still here,
// and its two ways on. ViewFailed.tsx draws it.
export const VIEW_FAILED = {
  title: 'This view couldn’t be drawn.',
  note: 'Something in it didn’t draw as it should. The rest of the project is still here.',
  again: 'Try again',
  reload: 'Load the page again',
} as const
