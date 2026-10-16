# Ask Sophia to revise sections of a report's page

> 2026-10-15 · The deep gaps report (`evaluacion-2026-10-15/informe-brechas-a-fondo.md` §3): the API to revise named
> sections of a designed page is built and tested (`POST /html-edits`, SDD-01 G5, 0041), but the Studio never calls it.
> Today it can only be asked by voice or in text. Luis's queue, item 3.

## What changes

- **`page-sections.ts`** lists a page's sections from its checked text, without parsing it into the Studio's DOM:
  - each `data-section` id the API accepts, in page order, once;
  - each named by its `aria-label`, else its first heading's words, else its id.
- **The viewer**, showing a report's designed page:
  - For an editor or an admin, on the current version, «Revise with Sophia…» opens the sheet «Revise the page»: the
    sections, each with a checkbox, «What to change», and «Ask Sophia».
  - It sends `requestDesignEdit` with the version, the sections chosen and the instruction, under one key, so a retry
    is the same edit.
  - Admitted, it says «Sophia is revising the page. Its next version will appear here.»
  - A refusal, for example a design under way, is said in the API's words.
- **Viewers** and older versions get nothing to press.
- The page itself still shows in its frame with no permission at all; nothing here touches it.

## Checks

- `page-sections.test.ts`: ids and names, page order, invalid ids left out, repeats once.
- `revise-section.spec.ts`:
  - an admin asks for a section's revision, and it is sent with the instruction;
  - a viewer sees nothing to press;
  - a refusal is said.
