# Council Review: SamApp Guitar Practice Feature

**Scope:** New guitar practice app, SamApp shell, Prisma guitar practice schema/migration, tRPC router, AI practice review flow, tests, and verification scripts.

**Context:** This uncommitted work adds a second signed-in app surface for tracking guitar practice and generating Vertex-backed practice reviews from saved evidence.

**Council dispatched:** Hunt, Dodds, Collina, Leach, Willison, Beck via delegated reviewers; Saarinen, Friedman, Fowler, and Performance completed locally.

## P1 - Fix Now

### 1. Global in-flight save guard silently drops later practice changes

| | |
|---|---|
| **File** | `app/guitar-practice-app.tsx:280` |
| **Council** | Dodds x Carmack - Colocate state and make writes explicit |
| **Ref** | `references/quality-frontend.md` |

**Finding:** `persistItem` returns immediately whenever any save is already in flight. Callers update local draft state before calling it, so a quick second timer log, reset, elapsed edit, or completion toggle can appear accepted while never being sent to the server.

**Consequence:** Practice time can be lost or reverted after the next tRPC invalidation, breaking the core logging workflow.

**Fix:** Replace the single global save guard with per-item pending state or a queued mutation model. Each user action should either persist, queue behind the current write, or report a visible error.

### 2. Configured lint verification is broken

| | |
|---|---|
| **File** | `package.json:9` |
| **Council** | Beck x Carmack - Static checks must be executable |
| **Ref** | `references/quality-testing.md` |

**Finding:** `npm run lint` runs `next lint`, which fails under the installed Next version with `Invalid project directory provided, no such directory: /Users/samuelhudson/Desktop/dev/foodphotos/lint`.

**Consequence:** CI or local preflight that relies on `npm run lint` cannot validate lint rules, so a configured quality gate is currently nonfunctional.

**Fix:** Replace the script with the supported ESLint command for this Next version and make sure it runs against the app/server/lib surfaces.

## P2 - Fix Soon

### 3. Generated reviews are stored without validating the required structure

| | |
|---|---|
| **File** | `server/routers/guitar-practice.ts:681` |
| **Council** | Willison x Beck - Validate after generation |
| **Ref** | `references/quality-llm.md`, `references/quality-testing.md` |

**Finding:** `generateReview` stores any non-empty Vertex text, while the prompt and UI expect six labeled sections. The request also sets `maxOutputTokens` and does not reject truncation finish reasons; the happy-path test accepts a response with only `Overview` and `Standard` at `server/routers/guitar-practice.test.ts:549`.

**Consequence:** Malformed or truncated model output can become durable review history, degrade the UI parser, and poison later review context.

**Fix:** Validate all required labels and minimum section content before upsert, reject truncation or incomplete finish reasons, remove the artificial output cap per project LLM policy, and update tests to prove malformed outputs are rejected.

### 4. Day saves are not atomic across the day row and item logs

| | |
|---|---|
| **File** | `server/routers/guitar-practice.ts:425` |
| **Council** | Leach x Carmack - Transactions are the unit of correctness |
| **Ref** | `references/quality-postgres.md` |

**Finding:** `upsertDay` writes the day row, then upserts item logs one by one outside a transaction.

**Consequence:** If a later item-log write fails, the procedure reports failure while leaving a partially updated practice day in the database.

**Fix:** Wrap the day upsert, log upserts, and final read in one Prisma transaction so the save commits or rolls back as a complete snapshot.

### 5. Default item seeding can duplicate rows under concurrent first loads

| | |
|---|---|
| **File** | `server/routers/guitar-practice.ts:260` |
| **Council** | Collina x Leach - Concurrent request behavior must be explicit |
| **Ref** | `references/quality-backend.md`, `references/quality-postgres.md` |

**Finding:** `seedDefaultItemsIfNeeded` counts existing rows, then inserts defaults one at a time without a uniqueness-backed idempotency boundary.

**Consequence:** Two concurrent first-time `list` calls can both seed the same user, producing duplicate default items that affect timers, item limits, and review evidence.

**Fix:** Add a database-backed uniqueness invariant for seeded defaults or another seed marker, then use idempotent inserts or a serializable transaction with retry.

### 6. Settings mutations have no structured failure state

| | |
|---|---|
| **File** | `app/guitar-practice-app.tsx:456` |
| **Council** | Dodds x Friedman - Handle errors structurally |
| **Ref** | `references/quality-frontend.md`, `references/quality-ux.md` |

**Finding:** `saveSettings` and the inline archive action await mutations without local error state, pending state, or rollback messaging; the click handler discards the promise.

**Consequence:** Failed item updates, creates, or archives can leave the user with no indication that the practice list did not persist.

**Fix:** Give the settings sheet its own submit state and error message, keep it open on failed persistence, and prevent conflicting mutations while a save is active.

### 7. Server rehydration can overwrite unsaved note and settings edits

| | |
|---|---|
| **File** | `app/guitar-practice-app.tsx:233` |
| **Council** | Dodds x Carmack - Do not sync state unnecessarily |
| **Ref** | `references/quality-frontend.md` |

**Finding:** The hydration effect mirrors tRPC data into `draft`, `comment`, and `settingsDrafts` whenever its key changes after invalidation. Item saves also invalidate the list.

**Consequence:** A refetch from an unrelated timer or item mutation can reset a note or settings edit that the user is still typing.

**Fix:** Track dirty editable state after initial load and reset form drafts only on explicit open, cancel, save, or real selected-day/item-set changes.

### 8. Vertex review generation has no timeout or cancellation

| | |
|---|---|
| **File** | `server/routers/guitar-practice.ts:640` |
| **Council** | Collina x Carmack - Bound external resource lifetimes |
| **Ref** | `references/quality-backend.md` |

**Finding:** The Vertex `fetch` has no `AbortSignal`, timeout, or cancellation path.

**Consequence:** A stalled provider or network can leave the tRPC mutation open until the platform or client eventually gives up, with no controlled failure state.

**Fix:** Use an `AbortController` with a bounded timeout, clear it in `finally`, and translate aborts into the existing operational generation failure path.

### 9. Expensive AI review mutation has no per-user rate limit

| | |
|---|---|
| **File** | `server/routers/guitar-practice.ts:556` |
| **Council** | Hunt x Carmack - Deploy assertions as tripwires |
| **Ref** | `references/security.md` |

**Finding:** Any signed-in user can repeatedly call `generateReview`, and each call reaches Vertex even though the saved review is only upserted for the day.

**Consequence:** A compromised account or automated client can burn API quota and create a denial-of-wallet path.

**Fix:** Add a server-side per-user cooldown or rate limit keyed by user and day, and return the recent saved review when regeneration is not allowed.

### 10. Practice duration invariants are not enforced by Postgres

| | |
|---|---|
| **File** | `prisma/schema.prisma:60` |
| **Council** | Leach x Carmack - Constraints are assertions |
| **Ref** | `references/quality-postgres.md` |

**Finding:** `defaultPlannedSeconds`, `plannedSeconds`, and `elapsedSeconds` rely on router Zod validation but are plain `INTEGER NOT NULL` columns in the database.

**Consequence:** Raw SQL, migrations, future routers, or Prisma paths can persist negative or unrealistic durations that corrupt totals and AI evidence.

**Fix:** Add Postgres `CHECK` constraints in the migration matching the router's business limits.

### 11. Practice settings sheet can overflow past the viewport

| | |
|---|---|
| **File** | `app/page.module.css:903` |
| **Council** | Saarinen x Friedman - Keep actions reachable |
| **Ref** | `references/quality-ui.md`, `references/quality-ux.md` |

**Finding:** The settings sheet is full-height with large padding, but the row list has no constrained scroll region. The product allows up to 20 active items.

**Consequence:** On smaller screens or with many items, Save list and Cancel can be pushed below the reachable viewport.

**Fix:** Make the rows area scrollable and keep the bottom actions fixed or sticky inside the sheet.

### 12. Clear-day deletion has no behavioral test

| | |
|---|---|
| **File** | `server/routers/guitar-practice.test.ts:417` |
| **Council** | Beck x Carmack - Test destructive behavior |
| **Ref** | `references/quality-testing.md` |

**Finding:** The router exposes `clearDay`, but the test suite never exercises it.

**Consequence:** A regression could delete the wrong day, fail to delete logs, or report success without clearing data.

**Fix:** Add behavioral tests for clearing an existing day with logs, clearing a missing day idempotently, and preserving another user's same-date day.

### 13. Production CSP allows inline scripts on private user data pages

| | |
|---|---|
| **File** | `next.config.ts:22` |
| **Council** | Hunt x Carmack - Browser defenses should remain effective |
| **Ref** | `references/security.md` |

**Finding:** The production `script-src` includes `'unsafe-inline'` for every route.

**Consequence:** If any future rendering regression or dependency markup issue creates an HTML injection path, CSP will not block inline script execution on pages that handle private food and practice data.

**Fix:** Move toward nonce or hash-based inline script allowance. If rollout risk is high, start with report-only CSP and enforce once legitimate violations are resolved.

## P3 - Consider

No P3 findings survived the Carmack filter.

## Summary

| # | Finding | Severity | Council | Fix effort |
|---|---|---|---|---|
| 1 | Global in-flight save guard silently drops later practice changes | P1 | Dodds | M |
| 2 | Configured lint verification is broken | P1 | Beck | S |
| 3 | Generated reviews are stored without validating the required structure | P2 | Willison/Beck | M |
| 4 | Day saves are not atomic across the day row and item logs | P2 | Leach | M |
| 5 | Default item seeding can duplicate rows under concurrent first loads | P2 | Collina/Leach | M |
| 6 | Settings mutations have no structured failure state | P2 | Dodds/Friedman | M |
| 7 | Server rehydration can overwrite unsaved note and settings edits | P2 | Dodds | M |
| 8 | Vertex review generation has no timeout or cancellation | P2 | Collina | S |
| 9 | Expensive AI review mutation has no per-user rate limit | P2 | Hunt | M |
| 10 | Practice duration invariants are not enforced by Postgres | P2 | Leach | M |
| 11 | Practice settings sheet can overflow past the viewport | P2 | Saarinen/Friedman | S |
| 12 | Clear-day deletion has no behavioral test | P2 | Beck | S |
| 13 | Production CSP allows inline scripts on private user data pages | P2 | Hunt | M |

## Verdict

The feature is broadly typed and the existing automated tests pass, but it is not ready to ship as-is. The main risks are core workflow data loss on rapid saves, a broken lint gate, incomplete persistence boundaries around day saves and generated reviews, and several failure states where the UI or backend does not make errors visible or bounded.

## Findings Breakdown by Expert

| Expert | P1 | P2 | P3 | Total | Key Areas |
|---|---:|---:|---:|---:|---|
| Hunt | 0 | 2 | 0 | 2 | CSP, AI mutation abuse |
| Dodds | 1 | 3 | 0 | 4 | Save state, hydration, settings errors |
| Collina | 0 | 2 | 0 | 2 | Concurrency, external fetch lifecycle |
| Leach | 0 | 3 | 0 | 3 | Transactions, constraints, seeding |
| Willison | 0 | 1 | 0 | 1 | LLM output contract |
| Beck | 1 | 2 | 0 | 3 | Broken verification, destructive tests, LLM test contract |
| Saarinen/Friedman | 0 | 1 | 0 | 1 | Settings sheet reachability |
| Fowler | 0 | 0 | 0 | 0 | No findings after filter |
| Performance | 0 | 0 | 0 | 0 | No findings after filter |

**Review output written to:** `.council/review-output/2026-06-04-1727/FINAL-REVIEW.md`
