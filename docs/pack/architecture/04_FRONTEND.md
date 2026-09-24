# Studio frontend: the work stays central

**Target:** custom React/Vite application, not a reskin of a vendor's agent dashboard. **Reference:** the actual Sophia Studio V2-R1 HTML and the v0.2 semantic decisions. [P-01, P-02]

## 1. Routes and screen responsibilities

| Route | Main purpose | Default composition |
|---|---|---|
| `/` | Return to meaningful work or begin | Current projects, Needs You and compact Sophia dock |
| `/p/:project/studio` | Shared creative room | Three lenses, main artifact/conversation, work pulse, optional context drawer |
| `/p/:project/goals` | Understand the roadmap | Current outcomes, dependencies, criteria and evidence—not a mandatory task board |
| `/p/:project/work` | Inspect ongoing work | Goals/attempts, resources, heartbeat decisions and persistent controls |
| `/p/:project/knowledge` | Sources and continuity | Current decisions, source imports, project understanding and review |
| `/p/:project/updates` | Finite digest | Required actions distinct from changes and optional cooperation |
| `/p/:project/resources` | Owner-bound engineering connections | Davide Codex, Davide Claude, Luis Claude; capability/status details |

A person can start in any lens and request work without navigating first. “Build it” stays in the current lens with a bridge to the result; “Build it and show me” navigates deliberately. A routine worker event never steals the main view.

## 2. State partitions

**Server records:** project, accepted source/version, goals, decisions, work, HumanActions, review intents and evidence. Cache these with typed query keys and invalidate/update them from ordered events.

**Viewer-local state:** active lens, selected local artifact, draft, scroll, open panels, followed target, muted optional suggestions and source-editor cursor. Preserve these across unrelated streamed updates. Do not store them as a shared project mutation.

**Shared room state:** guide/focus target, input floor and exchange epoch. These are versioned server objects, not whichever browser last rendered.

**Transient media:** current audio buffer, visual-frame timestamp and connection health. These are not the accepted project record.

Use React component-level updates rather than replacing the entire Studio subtree on each event. A source editor must not lose a draft or caret when a worker returns a status.

## 3. Components to implement

`ProjectShell` owns audience, project navigation and persistent dock. `StudioLensTabs` changes local view. `ArtifactStage` renders the selected exact version. `ConversationPanel` opens the same thread records used by the Conversations archive. `WorkPulse` shows actual running/waiting/unknown state. `HumanActionCard` names the required owner and operation. `CooperationCard` supplies optional review actions. `ControlRail` remains available independent of cards. `RunInspector` contains source IDs, native correlations, usage and the detailed event history.

`PrototypeWorkspace` contains Preview/Source/Diff. `ReviewOverlay` switches between interacting with the application and selecting for discussion, so selecting a button for review does not accidentally click it. `ContextBridge` points to an existing request/result from another lens rather than creating another copy.

## 4. Visual direction

Transfer the established dark/violet tokens, warm serif headings, restrained sans body, orb and generous artifact space from the actual reference. Do not automatically apply a donor design skill's “avoid purple” preference to Sophia's existing identity. At laptop size, use optional drawers instead of three permanently competing columns. At phone size, show one primary pane with reversible overlays; do not shrink the whole desktop canvas.

Test 1440×900, 1280×800 and 390×844 as representative viewports. Maintain keyboard navigation, labelled dialogs, focus restoration, visible status text and reduced-motion behavior. These are implementation test viewports, not a pixel-fixed layout.

## 5. Voice interaction in S1

The dock shows who can address Sophia, whether the exchange is open, whether visual observation is active and whether the room transport is connected. It offers explicit invoke, pass input/guide and context-specific Stop Speaking, Stop Looking and work controls. Users do not need to see protocol terminology such as authority epoch.

Both humans hear Sophia's single room track. The room may carry human-to-human audio while Sophia's input gate is closed. Do not label “Sophia is quiet” as “Sophia cannot hear.” A user opting out of Sophia audio input is enforced by track routing, not merely a prompt.

## 6. Co-review S1

Select an exact preview and a visible region or source component. Capture the current source/build identity, screenshot timestamp and available exact text. A clear “change this, preserve that” instruction becomes a `ReviewIntent`. An ambiguous reference gets a focused clarification. The UI displays recorded → delivered → incorporation observed → checked only when those stages have evidence.

S1 sends the confirmed intent through the technical lead to the correct worker. It does not promise mechanical component-only mutation. The stable preview is retained and the returned diff/checks are visible. S2 adds the stronger target-restricted editor on this same contract.

## 7. Source editing for Luis

Use a bounded source editor, not a full general desktop IDE. The server supplies the selected source snapshot and permitted editable paths. Saving submits an expected-base patch; a concurrent change produces a conflict view rather than an overwrite. “Build preview” freezes a new snapshot and starts a controlled job. The displayed app, source and diff all identify the same candidate.

Human takeover holds the affected writer before editing its source. An independent worker in another worktree may continue. Releasing takeover does not automatically publish or merge Luis's changes.

## 8. Attention semantics from day one, richer in S2

Required actions cannot live only in expiring toasts. They persist by owner and affected dependency. Dismissing an optional invitation changes prominence, not the underlying work. Reading a request cannot approve it. Routine progress updates the Work Pulse/history. One useful discretionary invitation is preferable to a wall of activity cards.

S2 adds milestone capture, detailed attention scheduling, mobile delivery and consented room-following. The underlying record distinctions and focus behavior ship in S1 so they do not require a UI rewrite.

## 9. Frontend acceptance

The representative run proves: two users can view different lenses; one user's navigation does not change the other's source; a pending native permission appears in all relevant views under one ID; an incoming event preserves an editor draft; a disconnected browser returns to the real pending request; a new candidate does not erase the prior preview; and the controls describe the actual route's capabilities.

These checks exercise real backend state. The recovered HTML fixture is a design reference, not proof that production collaboration already works.
