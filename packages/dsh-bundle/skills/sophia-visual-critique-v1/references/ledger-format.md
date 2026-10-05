---
id: critique/ledger-format
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/review-against-ai-patterns/references/ledger-format.md (blob 0233bfc219c2eb61a00e44cb53a17e31ab1e5246)
status: Sophia-authored English adaptation; recorded with design_record_work (kind risk_ledger) instead of ANTI-SLOP-CHECK.md
---

# Risk ledger format

Record only decisions that change pixels: one entry per place, in short sentences. [L0.1]

## Entry

```
## <group> <name> · <high|medium> risk
- location: <section id>, <region of the page>
- symptom: <one visible fact>
- change: <which source file and where, changed to what>
- recheck: <after re-rendering: which capture you looked at, and what you saw>
```

Rules [L1.1–L1.4]:

- The symptom states what is seen, never the intent or an explanation.
- The change names a concrete action, never "optimized" or "adjusted".
- The recheck happens after the change and after a new render: name the capture and what it shows, never "confirmed".
- A group you routed to that does not occur in the final state gets one line: `## <group> <name> · not present`.

## Final whole-artifact scan

Before delivery, add at the end [L2.1]:

```
## Whole-artifact scan
- looked at: <the captures, by id>
- new hits: <groups, each with an entry in the format above> or none
```

## Example

```
## G grey AI micro-text · high risk
- location: findings, the caveat under the second table
- symptom: the sample-size caveat is 12 px light grey under the table and reads like a footnote nobody needs
- change: index.html #findings: the caveat moves into the paragraph the table supports, body size and colour; styles.css drops .note
- recheck: render r3, capture findings@1280: the caveat reads at body size next to the claim it limits
```
