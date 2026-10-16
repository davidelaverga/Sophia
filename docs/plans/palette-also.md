# The palette understands other words people type

> 2026-10-14 · `evaluacion-2026-10-13/informe-comandos-20.md`, finding 1. Luis's queue: work that needs no asking.

## What was measured

- In Tasks, ⌘K with 40 words people type: 29 find nothing. Nine of those have a command there that does just that:
  «theme» and «dark» (with the page dark; «light» works) for the light's switch; «keys» and «help» for «Keyboard
  shortcuts»; «find» for search; «sophia» and «ask sophia» for Conversations; «what changed» for Updates; «report» for
  Knowledge. The palette answers «Nothing does that».
- `matchCommands` reads a command's own words and its group's, nothing else (`commands.ts`, `scoreOf`).

## What changes

- **A command may carry other words** (`also`): words people type for it that its words don't say. They are never
  shown (the palette and the index say the command's words) and they score 1, as a group's word does, below a
  command's own (3 for its first word, 2 for a later one). So what a query found before it still finds in the same
  order, and a command's own word outranks another's `also`.
- **The words given**:
  - the light's switch: theme, dark, light, mode;
  - «Keyboard shortcuts»: keys, help, hotkeys;
  - the searches: find;
  - invite: add, people, members;
  - the views:
    - Studio: room, call;
    - Conversations: sophia, ask, chat;
    - Goals: outcomes;
    - Tasks: board, plan;
    - Knowledge: reports, library, docs;
    - Updates: what changed, recap, news;
    - Resources: tools, agents, sessions;
  - the Studio view's chat: sophia, ask, talk; its brief: summary, decisions;
  - the room: join (call, meet); microphone (mute, unmute, mic); camera (video); screen (present);
  - Places: Personal (sophia, companion); Your data (privacy, export).

## Checks

- `commands.test.ts`: a word only in `also` finds its command (and a prefix of it); two words, each own or `also`; a
  command's own word outranks another's `also`; the index lists the words alone.
- `e2e/commands.spec.ts`: in Tasks, «dark», «help», «what changed», «find» and «sophia» each bring their command
  first.
- Prettier, type-aware lint, typecheck; CI as the run on record.
