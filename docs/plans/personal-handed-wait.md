# Personal: words handed from Home wait, never lost

> 2026-10-04 · Luis · after [personal-codex-p2](personal-codex-p2.md) · "Continua"

## Why

The review of #95 found an older bug. Words said to Sophia from Home are handed to Personal's composer to send (`useHanded`). If another message is on its way when they arrive (another tab of this device holds its send), the send declines them and they are never put in the field: the person's words are gone, under a line saying "send this one after it" over an empty field.

Measured in the fixture: with another tab holding the device's send, words handed from Home left the field empty and nothing was sent.

## What changes

Since #95 the send says whether the words went on their way. Words handed from Home that don't go now wait in the field, after anything typed there meanwhile, with the line saying another message is on its way. Words that go, go at once as before.

## Checks (written first)

- Another tab sending: the handed words are in the field, the line says why, nothing was sent.
- Nothing else sending: they go at once, and the field stays empty (a guard).
- Words written earlier come first, the handed words after them.

## Left for later

Words handed while the space's epoch is still unknown (neither the space nor the projects read yet) are shown but not kept, and the first read of the device's draft can replace them. Older than this change and narrow (the projects give the epoch early); a follow-up.
