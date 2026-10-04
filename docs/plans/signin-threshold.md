# Sign-in: the threshold (the "$20" pass, slice 2)

> 2026-10-04 · Luis · design note before code · follows [signin-frictions](signin-frictions.md)

## Why

The critique's first finding was that the sign-in looks like any login with a glow. Sophia's light sits above the words, but it doesn't know anyone is there. Umbral is about a threshold: you, Sophia, and the space between you. The sign-in is the one place where someone stands at that threshold before they come in.

## The idea: she notices you, and you come through

The light keeps the moods the room uses (`listen`, `think`, `rest`) and its way of attending to a point:

- **Arrival:** at rest, as today.
- **Writing your address:** while the field has the focus or holds words, Sophia **listens** and leans towards the field. The lean is 14 % of the way there, never more than 40 px.
- **Sending:** she **thinks** while the email goes.
- **Through ("Check your email"):** her light condenses where it rests and **Umbral forms there**:
  - her half grows from the light;
  - your half rises from where you wrote the address;
  - they meet across the line between you.
- **A refusal or an error:** back to rest. Nothing is dramatised.

One screen holds both steps, so the light carries on from listening to formed instead of starting again.

## The mark blocks the light (Luis, 2026-10-04: "que el logo realmente bloquee la luz y haga god rays")

Once formed, the light stands **behind** the mark, on the line between the two halves:

- the halves block it, leaving a shadow behind each one;
- it pours past their edges and through the gap between them as rays.

A fine pointer moves the light behind the mark a little towards it (3.5 units of the mark's 48 grid at most), so the rays turn as you move. This is the same lean she has towards whoever writes.

How it is drawn, with cost in mind:

- **In the light's own shader**, in the same pass: no second render target and no texture. The mark is described exactly, as two cut discs on its 48 grid, so the shadows match the SVG drawn over it.
- **Sixteen samples per pixel**, only over the light's own extent behind the mark, and only within reach of the mark. Everywhere else, and on every screen without a mark, the branch is skipped (`u_occlude` is 0).
- **Measured** at 1280×800 on the software renderer (SwiftShader), and at 1920×1080 at 2× on a GPU. Both hold 60 fps, the same as at rest, with no frame worse than the rest case. The light's existing pacing still steps the resolution down on a slow device.
- **Reduced motion:** the rays are drawn once and stay still. The streaks don't drift and the light does not follow the pointer.

## Not in this slice

- The other quiet screens (the link offer, invitations). They can take the same light later, once the sign-in's are liked.

## Checks

- The light's mood and attention follow the field, read from its box (`data-mode`, `data-attention`): at rest on arrival, listening while focused, thinking while it sends, at rest once sent.
- The mark forms at the light's own rest (`restsAt`), at the size `markSize` gives. Under reduced motion it is static. "Use another email" removes it.
- Pure numbers in `threshold.ts`: the lean, its cap, the condensed radius and the mark size.

## Before the PR

Luis sees a recording of the sign-in, from arrival to the rays turning with the pointer, and says whether it lands.
