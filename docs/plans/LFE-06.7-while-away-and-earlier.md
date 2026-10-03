# LFE-06.7: what changed while you were away, and a session's earlier reports

The third round of Luis's review of Resources ("go on with the improvements") brings two things:

- the useful return the plan's board already has, here too;
- what a session did in its last minutes, without opening its tool.

## What changes

1. **While you were away.**
   - **What is remembered:** Resources keeps a glance at each resource in this browser (`away.ts`). That is its host, the requests waiting on its owner, each session's work and state, and whether its account runs short.
   - **When it is remembered:**
     - when the viewer marks it seen;
     - on a first visit, once the resources are read (even none: one enrolled later is then "new here"). That visit
       says nothing.
   - **The line:** what moved since then is one line from Sophia's light, under the line of requests: "Davide's Grok
     went offline · Davide's Codex started Review the report pane". The most pressing comes first:
     1. running short;
     2. offline;
     3. started, or back on its task after waiting;
     4. queued or given, no longer on its task, new here;
     5. back online, a request answered.

     Three are said, and the rest counted. Then **Mark seen**.
   - **The tiles:** only a tile the line speaks of wears a small lavender dot at its corner, breathing, until Mark seen.
     Every mark has its words and its way to clear.
   - **Not said, so not marked:**
     - **A request that came to wait.** The session waits with it, and both are said on top, while it waits. The line
       doesn't repeat them. One answered is said.
     - **A host gone unknown.**
     - **A task's title alone changing,** or its sessions in another order.
     - **An account no longer short** (its reading expired, or its window reset). Only running short is said.
     - **A resource that left.**
   - **On a phone** the line wraps, whole, and Mark seen stays in reach.
   - **For a screen reader,** the line is a status: it is announced when it comes.
   - **One piece:** the line is the plan's board's (`AwayLine`, shared), in the same look.
   - **Where it is kept:** per scope (the panel's `scope`: the project's id) and per viewer. Another scope or viewer
     reads its own. What a browser refuses or can't read back whole (`asSeen`) is forgotten.
2. **A session's earlier reports.**
   - The proposed `Session.recent` holds what its tool reported before its last report, newest first, a few at most.
   - Under the last report in a resource's sheet, "3 earlier" opens a short thread, each report with how long ago.
   - Like `activity`, it is the tool's own words, never its reasoning.

## States

- **The line:**
  - first visit (even with nothing enrolled): nothing;
  - nothing moved: nothing;
  - one to three phrases;
  - more, counted;
  - Mark seen: nothing again;
  - reload: still nothing;
  - while loading: nothing;
  - a new resource: "is new here".
- **Earlier reports:**
  - none: no toggle;
  - folded, then open;
  - grown when a new report comes;
  - at phone width: one column.

## Proposals

- `Session.recent: Report[]`, beside `Session.activity` (SCM-02).
- Later, the viewer's last look kept by the server, as #63's proposal 7 does for plans (`GET/PUT …/seen`).

## Checks

- **Unit** (`away.test.ts`):
  - a first visit;
  - what moved, in the order above, and only that marked;
  - the viewer's own;
  - started, back on, queued, let go;
  - new;
  - answered;
  - back online;
  - running short;
  - the silent moves;
  - a stored glance read back whole or not at all.
- **Browser:**
  - the line, the marked tiles and Mark seen remembered;
  - a first visit remembered and silent;
  - a request that comes, or a host gone unknown, marking nothing;
  - the phone's wrapped line;
  - earlier reports folded, newest first, growing as the session reports;
  - the phone's one column.
- **Mutations:** each check above must fail when its rule is broken.
