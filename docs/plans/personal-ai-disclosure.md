# Personal says Sophia is an AI, and help is one press away

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §3). Personal never said Sophia is an AI; only the terms
> did (`legal-text.ts`). Nothing offered help in a crisis. Three laws ask both of an «AI companion», and the terms call
> Sophia one. **A draft for Luis and legal review: not to merge before they approve it.** Studio only.
>
> 2026-11-01 · **Ported to Main as facts and manual links only** (FND-B-DISCLOSURE-MAIN-PORT-01): P selected this
> narrower part for Main under the current integration mandate and set the draft's hold aside for it alone. Nobody's
> approval is claimed: no Luis or legal review, and no law below is claimed to be met. Two words were narrowed on an
> independent copy review (R2): 112 is said for the EU, and a service's own charge is told apart from a phone plan's.

## What the laws ask

The draft's reasons, kept as written. Showing a line and a list of numbers is not a claim that any of them is met.

- **New York, GBL art. 47** (since 2025-11-05):
  - detect suicidal ideation or self-harm and refer to crisis services, 988 for one;
  - say it isn't a person at the start, and at least every 3 hours.
- **California, SB 243** (since 2026-01-01):
  - a clear notice that it's an AI;
  - a protocol for suicide and self-harm, with referral to crisis services.
- **EU, AI Act art. 50(1)** (since 2026-08-02): tell people they're talking to an AI, unless it's obvious.

## What changes

- **A line that stays:** «Sophia is an AI, not a person.» It sits under the field, on every visit and for as long as the
  conversation is open, so it's said at the start and never drops out of sight. A talk by voice covers the field, so the
  line is in the talk too.
- **«Help now»** at the end of the line opens a sheet of crisis lines, each one press away:
  - **in danger now:** the local emergency number, 911 in the US and Canada, 112 in the EU (the EU's own page; not every
    European country);
  - **United States:** the 988 Suicide & Crisis Lifeline: call or text 988, or chat at 988lifeline.org;
  - **Canada:** the 9-8-8 Suicide Crisis Helpline: call or text 988;
  - **UK and Ireland:** Samaritans, 116 123;
  - **Spain:** Línea 024, 024;
  - **anywhere else:** findahelpline.com, helplines by country; their hours and costs vary.
- **Above the list:** these services don't charge for their help, though a phone plan's usual rates may apply (the 988
  pages tell the two apart). No line is promised to answer at once.
- **Checked on 2026-10-16** against each service's own or government pages (sources in the handoff). Calls and texts
  are `tel:` and `sms:` links; the sites open in a new tab.
- **`help-lines.ts`** holds the line and the lines as data, so the numbers are checked in one place.

## Not here

- **Detecting** suicidal ideation or self-harm in what's written, and Sophia's answer to it: the API's, with Davide
  (issue #365). NY and California ask for it; this draft is only what the Studio can do alone.
- **Where people are:** the sheet lists every line, since the Studio doesn't know the country. The person picks their
  own; nothing asks for a location, dials, texts or looks anyone up.
- **Help during a talk by voice:** a talk shows the line alone; «Help now» is under the field once the talk ends.
- Legal review of the words, and of whether a line that stays is enough for the 3-hour rule.

## Checks

- **`help-lines.test.ts`:** the line's words; every action is a bare `tel:`, `sms:` or `https:` link, nothing of the
  person in it; the numbers as checked; 112 for the EU and the charge told apart.
- **`personal-ai-disclosure.spec.ts`:**
  - the line under the field;
  - «Help now» opens the sheet with each line's press; Esc gives the focus back to «Help now»;
  - in a talk by voice, the line is there too, with no «Help now» of its own;
  - (Main port) from the keyboard, inside the composer's form: nothing sent or submitted, the draft kept, Tab held in the
    sheet, Close and Esc back to «Help now»; offline and with Sophia unavailable, the same; no talk without a voice;
    readable in dark and light; on a phone, every press 40 px or more, none over another, Close in sight.
