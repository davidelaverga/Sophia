# Settings, in one place

> 2026-10-16 · Luis's QoL queue, item 9 (informe-brechas-a-fondo.md §4, la plataforma). Today the avatar's menu holds
> everything (theme, your data, privacy, shortcuts, passkeys, sign out). A call's defaults have no place to be seen:
> whether you join with the microphone on is set by your last call, and the mirror lives in the dock's video menu (#380).
> Slack, Linear and Notion keep one settings place. Studio only: no API, and each choice is the one the Studio keeps
> today.

## What changes

- **«Settings…»** in the avatar's menu, after the theme, opens a sheet «Settings», portalled to the body as the
  menu's other sheets are. Its parts:
  - **Account:** your picture, name, email and how you signed in; Passkeys, where they are offered.
  - **Appearance:** Theme, as Dark, Light or System, the same choice the menu's row makes.
  - **Calls:**
    - «Join with my microphone on», the choice the next join reads (`mic-preference.ts`);
    - «Mirror my video», the store the stage reads (`mirror-preference.ts`).
  - **Data and privacy:** Your data, How privacy works, and the Terms of use and the Privacy notice.
  - **Help:** Keyboard shortcuts, and Send feedback where it goes somewhere.
- The menu keeps its own items: Settings gathers them, it doesn't take them away.

## Checks

`account-settings.spec.ts`, on the room fixture:
- the avatar's menu offers «Settings…», which opens the sheet with its five parts;
- Light there puts the page on paper;
- «Join with my microphone on», unchecked, makes Join say «You join with your microphone off»;
- «Mirror my video», unchecked, is kept for the next visit;
- Keyboard shortcuts there opens the index.
