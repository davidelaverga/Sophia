# Home · the guided first run

The first time someone arrives with nothing yet, Home asks three short things in its own column, under the greeting:
what to call them, whether they work alone or with a team, and the first project's name. Copy approved by Luis.

## When it shows

- Only while the person has **no projects**: the active list read and empty, and the archived list read and empty (a
  person whose projects are all archived is not new; a failed read of either holds it back, it is never guessed).
- Only while the profile has been read or is known not to answer: never over a read still on its way.
- Only until it ends: finished (the project created), «Not now, just talk to Sophia», or Escape. After that it never
  shows again on this browser. Skipping a step moves on; it is not the end.
- A project that arrives meanwhile (an invitation accepted from the band, another tab) ends it, remembered as any end
  is: Home is as today. Ended in another tab of this browser (a `storage` event on its key), it ends here too.
- While it can't tell yet (no projects, not ended, the archived list or the profile still being read), the place under
  the greeting is **held** (`firstRunHolds`): Home is never shown as today and then swapped for the first run.

Pure rules: `features/personal/first-run.ts` (`firstRunShows`, `firstRunHolds`, `firstSteps`, `stepAt`, `afterStep`,
`savedFrom`, `endsOnEscape`, `arrivedMidRun`, `endedElsewhere`, `profileFacts`, `namePrefill`), tested in
`first-run.test.ts`; when it shows, `useFirstRun.ts`.

## The steps

1. **Name** · «What should people in your projects call you?» · field «Your name», prefilled with the account's name
   (the profile's name, else the provider's, never an email) · «Continue» saves it, «Skip» moves on without saving.
   Skipped when the profile says the person already **chose** their name (`Profile.chosen`, A32), and when this server
   has no profile to change (404), the person was refused, or the read failed: a name that can't be saved isn't asked.
2. **How** · «Will you work on your own or with a team?» · «On my own» (A project for you and Sophia. You can invite
   people later.) · «With a team» (A project you’ll invite people to.) · «Skip» moves on as «On my own». The choice
   only decides whether «Invite people» opens once the project is created.
3. **Project** · «Name your first project» · field «Project name» · «Start the project» · «Not now, just talk to
   Sophia» ends the first run and leaves Home as today.

## What is saved where

- **The name**: the profile, exactly where «Your name» in the account menu saves it (`PUT /api/v1/me/profile`,
  `ProfileUpdate` over the revision read, one key per edit through `useAdmission`). Saved, the profile's cache takes
  the answer, so the account menu and the members' lists read the same name. A refusal is said in place
  (`saveWords`); no reply holds the name as sent (read-only) and the press itself says Try again, with the same key
  (one Try again, not two). A name changed elsewhere (409 `stale_revision`) is read again and said in «Your name»'s
  words (`conflictWords`, `CONFLICT_UNREAD` when that read fails), the typed name kept for the next Continue. While
  the save waits, Skip waits too; a save that lands moves on only from the name (`savedFrom`).
- **The project**: the existing create-project action (`createProject`, one key per intent, `useAdmission`), as
  Work's «Start a project» does. Created, the project opens; with «With a team» its Invite sheet opens over it
  (`inviteOnOpen`, the same one-shot as Join's `joinOnOpen`, dropped as Join's is once the person is elsewhere).
  Made after the first run ended (Escape or «Not now» while «Creating…»), nobody is taken into it: the projects are
  read again, as Work's NewProject does.
- **That it ended**: per browser, `localStorage['sophia.home.firstRun.v1.<account>'] = 'done'`, read and written in
  try/catch (blocked storage: it may show again on the next load, never breaks Home). The profile has no field for it
  (`displayName`, `chosen`, `revision`) and no new API is in scope. On another browser a person with no projects may
  see it once more, with the name step already skipped (chosen). A second key keeps nothing personal: it says only
  that the first run ended.

## Focus, keys and screen readers

- Each step is a `section` named by its title (`aria-labelledby`): a screen reader announces «region, What should
  people in your projects call you?» and reads the field by its visible label.
- On arrival the focus stays where Home puts it (Home's own arrival rules). On each advance the focus moves to the new
  step's field (its first choice on step 2), read with the region's name, as Work's New project does
  (`focus-kept.md`, 2026-11-22; until then it went to the step's title, which drew a field's ring).
- Order inside a step: field, then its primary press, then Skip / Not now. Step 2: «On my own», «With a team», «Skip».
- Enter submits a step's form (Continue, Start the project); on step 2 Enter presses the focused choice.
- Escape anywhere on Home ends it as «Not now» does (not while an input method composes, not over a dialog or a
  menu, not while Home is out of sight): Home as today; when the focus was in the first run, it goes to «You and
  Sophia»'s heading. Nothing traps: every step has its way out, and the focus never stays on something removed.
- A name's problem describes its field (`aria-describedby`) and is said politely as it comes (a live region mounted
  all along), not as an alert at every key; refusals and no reply are alerts once, in the error ink (`--rose`).

## Look

Home's own column and type: the greeting stays above (her sentence held back while the first run asks), Sophia's
light on the right. A step's title is a 20 px line in `--text`; its field's label the Studio's `field-label` (mono
capitals); the field the kit's `Field` (`lg`, 44 px) with its press inside (primary «Continue», «Start the project»);
«Skip» a ghost press and «Not now, just talk to Sophia» a text one; the two choices kit `Card`s pressed whole (radius
12, hover and ring from the kit). No hover value or shadow of its own; motion is Home's `hw-in` on the step as it
arrives (`--ease`), off under reduced motion.

- **Phone width** (≤ 860 px): one column at Home's gutter; the choices stack, the presses wrap; nothing scrolls
  sideways at 375 px.
- **Light and dark**: only theme tokens (`--text`, `--text-2`, `--text-3`, the kit's field and card surfaces), so
  paper and room each read their own.
