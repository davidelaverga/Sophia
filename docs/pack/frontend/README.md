# Frontend binding unit

Start with [architecture 13](../architecture/13_FRONTEND_BINDINGS.md). `bindings.json` maps actual reference anchors and source lines to proposed production components and API operation IDs. The line may contain minified source; the named anchor is the precise lookup. These destinations are proposed new files, not files that already exist in Sophia.

Use one TanStack Query `QueryClientProvider` for server state. The SSE controller updates appropriate cache entries and exposes a resnapshot condition; pure reducers do not perform writes. Local lens/source selection, scroll and unsaved drafts live separately. CodeMirror 6 is the selected lazy source editor; its installed version is locked during repository setup. No CodeMirror-specific API implementation is claimed in this pack.

The actual visual reference is included, with its original fixture labels. Its actor-switcher and simulated approve/complete actions are not production functionality. The app obtains current states and mutation receipts from the API; only the proper authenticated owner can answer a native permission. Source navigation and shared focus are independent of that authority.

A frontend coding session reads its assigned goal, this map, the relevant OpenAPI operations and the reference anchors—not the entire historical research folder. A source/API change updates this binding map and the matching contract test in the same commit.

Acceptance still requires two actual users in the working room, real returned application source, a permission handoff and a review-to-steer episode. A polished static rendering or Storybook story is not that proof. [UI-01, UI-02]
