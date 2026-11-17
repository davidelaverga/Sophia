# ⌘K opens a conversation by its title

> 2026-11-16 · Item 7 of `evaluacion-2026-11-16/textos-lote-18.md` («⌘K lleva a una conversación»). Luis approved the
> line on 2026-11-16: «Open conversation: <title>».

## What was measured

- The palette (`commands.md`) opens a view, a project by its name (`find-projects.md`), the Studio view's lenses; no
  part of `features/conversations` offers a command, so a conversation is reached only through its row in the list.

## What changes

- **In Conversations, each conversation the list shows is a command**, «Open conversation: <title>», with no key, in
  the «Go» group. Enter opens it as its row does (the open one, its pane on a phone).
- Only the conversations the person sees: the list as shown (`shownList`), none while the view is fenced after a
  refusal; erased ones are gone from it. Bounded by the list itself: the API serves the newest only (`more`).
- `typed`, as projects are: offered once what is typed names it, so a long list never crowds the blank palette; one
  opened shows under Recent.
- Matched as every command is (`matchCommands`: each typed word starts a word of the title, accents folded). The
  title is the row's words, drawn as text.

## Checks (written first)

- `e2e/palette-conversations.spec.ts` (fixture, `conversations=1`): the blank palette names no conversation; «short
  brie» finds «Open conversation: Short or long briefs?» first; Enter opens it (the open conversation's heading).
- After the review (2026-11-16): fenced after a refusal of the list, the palette names no conversation; one erased
  elsewhere leaves it with the list. Both held already; they guard it. A rename has no way in the client to test by:
  the words follow the list as read, so a title changed in a read since is the new one.

## Left

- From the other views of a project: their palette has no list read, and reading one there would bypass the view's
  fence. A later piece could hand the list up once it is read and fenced.
