# Incremental UI targets and design context

This is the specialist's scope guide. It specifies useful behavior and priority, not a replacement visual system. Read the current production design rules and the assigned module first.

## Product character

Sophia is a place to think, explore, and bring work into a verified result with people and agents. The interface should make the next useful interaction obvious while keeping agent machinery in optional detail.

Use concrete previews, source thumbnails, stateful controls, consistent icons, and purposeful spacing where they aid recognition. Remove repeated explanatory text before adding more panels. Keep the current production identity; a broad palette/type/layout change is significant and requires review.

## Surface sequence

| Slice | Required improvement | Main action | Details kept secondary |
|---|---|---|---|
| Resources, INC-01 | Real connections and an obvious Manage use path | Connect/reconnect or edit contribution | Host/profile provenance and detailed usage windows |
| Build, INC-02 | Goal, current phase, project-manager status, blocker and evidence | Respond to decision, inspect result, or control current work | Expanded agent sessions and technical logs |
| Converse, INC-03 | One natural composer and accessible thread history | Write/speak; optional @mention and context | Route reason and resource policy |
| Explore continuity, INC-03 | Exact artifact/version and clear link into repository work | Discuss/revise or implement the accepted source | Source manifest and detailed settings |
| Team allocation, INC-04 | Available contributions, actual allocation, all relevant role settings | Manage use or edit future allocation | Per-window telemetry and exclusions |
| Room voice, INC-05 | Clear Sophia voice entry and central active-call stage | Speak, mute, stop speech, leave | Work/resource detail and technical connection state |

An action's audience and payer are discoverable before commitment. They must not become an always-visible wall of contract text. Use a compact resource control with expandable detail; preserve a clear audience indicator.

## Conversation direction

Personal remains private Sophia threads. Shared projects have topic-based conversations that support human contributions and Sophia participation. Optional mentions and reply targets identify addressees. They do not change who can read the thread.

Conversation history belongs in Converse or the current conversation-navigation surface, consistently in Personal and project contexts. Team resources is for connections, contributions and allocation. General notifications belong in Inbox.

Do not replace the removed intent selector with four post-submit action buttons, a hidden mandatory mode, or a repeated confirmation for clear authorized requests. A concise consequential receipt is sufficient; ambiguity gets one focused clarification.

## Resource detail

Show every relevant role, including project manager, workers, review, testing, and design where applicable. A combined independent review/test thread may carry two sequential role obligations; the UI should make that understandable.

Resource information distinguishes owner, native/API route, permitted project/use, model, effort, availability and capacity source. The panel expands for known usage windows, reset/freshness, contribution cap/expiry, commitments and policy edits.

Unknown remaining usage uses an honest label such as “Usage not reported,” not an empty progress bar that looks full or an illustrative percentage. A pin that cannot run shows its wait and an intentional change action.

## Active work and artifacts

Keep selected work as the page's subject, with one coherent header/toolbar and optional detail. Preserve current production navigation unless the bounded assignment specifically changes it.

Explore source design and Build implementation preview are different items. Exact version remains visible in the viewer/details; accepted source is not overwritten by a candidate. A draft follows its selected target/version.

Decisions appear with the work they block and in Inbox. Build prioritizes status and evidence over a decorative preview. Goals complete at verified release; a failed verification remains visible and actionable.

## Voice

“Speak with Sophia” or the current accepted equivalent must be easy to find. Active call state gets a recognizable central place while preserving mute and leave through reconnect/errors. The voice indicator represents voice only, not background coding activity.

Speech interruption, call termination and work Stop are separate controls. Display camera/screenshare only if the current qualified media implementation actually supports the offered action.

## Required review states

For the affected surface, include normal, empty, loading, slow, error/refused, offline/reconnect, active work, pending permission/approval, and narrow/desktop variants as applicable. Check focus and keyboard after panel open/close, submission, refusal, navigation and reconnect.

Present the working significant candidate using templates/DESIGN_REVIEW.md and hold at awaiting_design_approval. Do not request another speculative whole-product design direction.
