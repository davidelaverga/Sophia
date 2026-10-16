# Hearing a knock at the door

> 2026-10-15 · The deep gaps report (`evaluacion-2026-10-15/informe-brechas-a-fondo.md` §2.6): someone waiting at the
> door showed only in the room's panel. An editor in another tab, or looking at the stage, never knew, and the guest
> waited. Meet chimes when someone asks to join and, with the tab hidden, sends a browser notification. Luis's queue,
> item 3.

## What changes

- **`knock-alert.ts`** (pure):
  - `arrivals`: who started waiting since the last look; those already waiting when the page opened are not news;
  - `knockWords`: what the notification says, «Ana Ruiz is asking to join» or «2 people are asking to join».
- **`useKnockAlert`**, for those who can let people in (editors and admins):
  - a short chime (two soft notes made in the browser, no file) for each new arrival;
  - with the tab hidden and notifications allowed, a browser notification with the project's name;
  - pressing the notification brings the tab back;
  - a viewer hears nothing, since they cannot answer.
- **The door's panel**, while notifications have never been asked for, offers «Notify me when someone knocks»; the
  browser asks, and the offer goes either way.
- **The fixture:** `window.fixture.knock()` has someone start waiting.

## Checks

- `knock-alert.test.ts`: only new arrivals count; the words for one and for several.
- `knock-alert.spec.ts`:
  - a knock chimes for an admin, with no notification while the tab is shown;
  - with the tab hidden and notifications allowed, it notifies with the name and the project;
  - a viewer hears nothing;
  - the offer asks the browser and goes.
