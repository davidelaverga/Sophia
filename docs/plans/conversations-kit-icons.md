# Conversations' icons, the kit's

> 2026-11-16 · the premium UI report (`informe-ui-premium.md` §2.7, one icon family; Luis: «es imposible que no se pueda
> avanzar mucho»). Conversations drew its own glyphs inside the kit's icon presses: New conversation's plus
> (`ConversationsView.tsx`), back to the list (`OpenConversation.tsx`), the context's Close (`ProjectContext.tsx`), and,
> found beside them, «Context» and Send's arrow. Each on a 14- or 16-unit grid of its own, 1.3–1.6 strokes, while
> «Copy link» in the same head already draws the kit's `Icon`. Studio and `packages/ui` only; no API, no new words.

## What changes

- **The three presses the report names draw the kit's `Icon`:** `plus`, `back` and `close`, at the kit's default 16 px
  like «Copy link» beside them. The glyphs come out as the family draws them: the close is the same 8 px as before,
  the plus and the back a touch smaller and lighter (1 px strokes against 1.5).
- **«Context» and Send's arrow, the same:** Send's arrow is the kit's `send` already (the same drawing on another grid);
  «Context» (a pane at the side) has no glyph in the kit, so the kit gains one, `panel`, in its style: a 17×15 frame,
  `rx` 2.5, and the side pane's edge.
- **Unchanged:** the presses themselves (the kit's `Button`, icon, md), their names and tips, their boxes (32 px; 40 px
  on touch, `conversations.css`), their focus rings, and Send's turning arc while it sends (a progress mark, not an
  icon; the kit has none).

## Checks

- **`conversations-icons.spec.ts`** (new): on a desktop, New conversation and, under 1180 px, the context's Close each
  hold one picture, the kit's (`svg.icon`, `viewBox 0 0 24 24`, hidden from readers), a 32 px box and a solid ring on
  the keyboard; on a phone New conversation, back and Close the same at 40 px. «Context» and Send the same, in their
  own pair.
- The neighbours: `conversations-panes.spec.ts` (40 px on touch, back, the context's toggle) and
  `conversations-start.spec.ts`.
