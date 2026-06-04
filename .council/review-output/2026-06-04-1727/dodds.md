FINDING:
- Title: Global in-flight save guard silently drops later practice changes
- File: app/guitar-practice-app.tsx:280
- Principle: Eliminate state that can be derived, then colocate what remains
- Severity: P1
- What's wrong: `persistItem` returns immediately whenever any item save is already in flight, but callers have already updated local draft state and do not queue, retry, or surface the skipped save. A quick second timer log, reset, manual elapsed edit, or completion toggle can look accepted in the UI while never reaching the server.
- Consequence: Practice time can be lost or reverted after the next tRPC invalidation, breaking the core logging workflow.
- Fix: Replace the single global `saveInFlight` ref with per-item pending state or a queued mutation model, and make skipped/failed writes explicit so each user action either persists or reports an error.

FINDING:
- Title: Practice app has no error boundary around async client surface
- File: app/sam-app-shell.tsx:31
- Principle: Errors are not exceptional — handle them structurally
- Severity: P1
- What's wrong: `SamAppShell` switches between the full client app surfaces directly, and the assigned provider/shell files do not establish an Error Boundary for render-time failures in either tRPC-backed feature. A malformed review, unexpected Date shape, or component exception would escape the feature instead of rendering a recoverable fallback.
- Consequence: A single frontend runtime error can blank the signed-in app with no local recovery path or useful user guidance.
- Fix: Add a top-level route error boundary and/or wrap each SamApp surface in a granular Error Boundary with a retry path, keeping async mutation errors routed into component state where Error Boundaries cannot catch them.

FINDING:
- Title: Server rehydration can overwrite unsaved note and settings edits
- File: app/guitar-practice-app.tsx:233
- Principle: Don't Sync State. Derive It.
- Severity: P2
- What's wrong: The hydration effect mirrors tRPC data into `draft`, `comment`, and `settingsDrafts` whenever the computed key changes after invalidation. Because item saves also invalidate the list, a refetch can reset the note textarea or settings form to the last server value while the user is editing.
- Consequence: Local edits can disappear after an unrelated timer save, item mutation, or review refresh, creating a stale-state bug that users experience as lost input.
- Fix: Treat editable forms as local dirty state after initial load, derive read-only display directly from tRPC data, and only reset form state on explicit open/cancel/save boundaries or when the selected day/item set truly changes.

FINDING:
- Title: Settings mutations have no structured failure state
- File: app/guitar-practice-app.tsx:456
- Principle: Errors are not exceptional — handle them structurally
- Severity: P2
- What's wrong: `saveSettings` and the inline archive action await mutation calls without local error handling, pending state, or rollback messaging. The click handler discards the returned promise, so a failed update/create/archive becomes an unhandled async failure rather than a visible form state.
- Consequence: The settings sheet can leave users with no indication that a practice item was not saved or removed, and subsequent query invalidations may surprise them by restoring old data.
- Fix: Give the settings sheet its own pending and error state, wrap all settings mutations in a single handled submit flow, disable conflicting actions while saving, and keep the sheet open when persistence fails.
