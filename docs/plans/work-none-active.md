# Work with no active project, only archived ones, says «No active projects»

> 2026-10-22 · #368's follow-up «Suppress the empty state when archived projects exist»
> (`evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md`, the S row and Luis's question under «Preguntas para
> Luis»), answered with the coordinator's option (b); Luis 2026-10-22: «Procede con la P2 y pon tus sugerencias a las
> preguntas», and earlier «Lo que no se mide, no se puede mejorar». Studio only, no API. Read beside
> [archive-project](archive-project.md).

## Read first (`origin/main` `86eef1c21`)

- `WorkSpace.tsx:412`: the first-run empty state («No projects yet. A project is where your team and Sophia build
  something together.», with Start a project) shows whenever the active list is empty, whatever the archived list
  holds; `ArchivedFold` (`:416`) then puts «Archived (n)» right under it. So a person whose only projects are
  archived reads «No projects yet» above them: a false none.
- `WorkSpace.tsx:382` (the question cited `:350`, before later changes): New project shows in the header only while
  the active list has a project, so removing the sentence alone would also remove the way to make one.
- No browser test pins the first-run empty state today; `work-space.html` (`fixtures/work-space.tsx`) always hands two
  active projects, and its New project is a stub.

## What changes

- **Which empty line** (`emptyLine`, in `WorkSpace.tsx`), once the active list has loaded and is empty:
  - no archived list handed, or one read as empty: the first-run state, exactly as it is;
  - one or more archived: «No active projects.», in the same empty-state look, with no press of its own;
  - the archived list couldn't be read: «No active projects.» too (true either way), with the failure said where
    «Archived» goes, as now;
  - the archived list still loading: neither line, as the file already does while the active list loads, so no «none»
    is claimed before it is known.
- **New project in the header** once the active list is in, whenever the first run's Start a project isn't said: with
  active projects (as now), with «No active projects.», and while the archived list is still coming (loading, retrying,
  or paused offline), so creating one is never out of reach (review). Once that list is known to be empty, the first
  run swaps it for its own sentence and Start a project.
- «Archived (n)» stays folded under it, unchanged.
- **No flash on the way** (`useArchiveWrite`, `Archive.tsx`; review): after an Unarchive both lists were read again at
  once, and when the archived one answered first, Work with none active held two empty lists and said «No projects
  yet» for a moment. The list a project joins is now read before the one it leaves (the active one for Unarchive, the
  archived one for Archive), so no moment holds it in neither. The press waits on its row one read longer.

## Limits

- For that one read, a project being brought back can show both among the active ones and in the fold; truthful, and
  gone when the archived list lands.
- Only this person's own Archive and Unarchive are ordered. Lists read again for other reasons (a project's feed
  after a change elsewhere, which reads the archived one; another tab) read as they did before.
- The first run's header New project shows while the archived list is coming and goes once it is known to be empty: a
  one-time swap for the press below.

## Checks (written first)

`e2e/archive-project.spec.ts`, on `work-space.html` with a new `active=0` (no active project) and the fixture's New
project kept as Places keeps it (open/closed), desktop and `@phone`:

- 0 active + 1 archived: no «No projects yet» and no Start a project; «No active projects.» shown; the header's New
  project opens the form (its title field); «Archived (1)» opens to Old pilot.
- 0 active + 0 archived: «No projects yet…» with Start a project, which opens the form; no header New project, no
  «No active projects», no fold.
- 0 active, the archived list held (`hold=archived`): New project in the header at once, no line; released, «No active
  projects.» (1 archived) or the first run (none).
- 0 active, the archived read refused (`archivedFails=1`): «Couldn't load your archived projects.», «No active
  projects.», the header's New project.
- 0 active + 1 archived with the active list answering late (`activeSlow=1`): Unarchive never puts «No projects yet»
  on the page (a MutationObserver watches), and Old pilot ends among the active ones, the fold gone.

Work's fixture page now reads its active list in the page's cache under Places's key (`['projects', name]`), so an
Unarchive reads it again as Places does, and a project brought back joins it.
