# Council Plan: SamApp Guitar Practice

**Scope:** Expand FoodPhoto into SamApp by adding a private Guitar Practice tracker as a sibling feature. Preserve the current FoodPhoto capture/review flow and copy its shape for guitar rather than creating a generic module framework. Guitar practice evidence includes a semi-fixed user-owned practice item list, a planned time per item, and a simple timer for recording time while practicing.

**Context:** The repo is a small Next.js App Router app with Clerk auth, tRPC, Prisma/Postgres, CSS Modules, and Vertex/Gemini AI review generation. FoodPhoto currently has a narrow `entries` router for photo evidence, a `roundups` router for daily AI reviews with previous 7-day context, and a single client capture/review surface in `app/food-photo-app.tsx`.

**Boundaries:** Build only the Guitar Practice loop, a small Guitar settings surface for practice items, and the minimal SamApp shell needed to reach it. Do not build a module registry, LifeOS architecture, dashboards, social sharing, gamification, or Gym Tracker. Do not rewrite FoodPhoto. The timer should be a practical capture control, not a productivity system.

**Council dispatched:** Troy Hunt security, Martin Fowler refactoring, Kent C. Dodds frontend, Matteo Collina backend, Brandur Leach Postgres, Vercel performance.

---

## Task Sequence

### 1. Add a Thin SamApp Shell

| | |
|---|---|
| **Domain** | Frontend x Carmack - Duplication is local damage; wrong abstractions are systemic damage |
| **Ref** | `references/quality-frontend.md` -> Principle 1 |
| **What** | Replace the signed-in page's direct `FoodPhotoApp` render with a minimal SamApp shell that offers two concrete surfaces: FoodPhoto and Guitar Practice. Keep FoodPhoto mounted through its existing component, with only naming/navigation changes required to make it a sibling inside SamApp. |
| **Why** | The product needs a second loop, not a platform. A small shell gives access to both features without forcing shared module contracts before there are enough modules to justify them. |
| **Depends on** | None |

Implementation notes:
- Keep `FoodPhotoApp` behavior intact.
- Prefer a compact segmented control or two-button switch in the authenticated app surface.
- Update metadata/app naming from Food Photos to SamApp where user-facing, without renaming existing FoodPhoto database models.

### 2. Model Guitar Daily Evidence Directly

| | |
|---|---|
| **Domain** | Postgres x Carmack - Constraints are assertions |
| **Ref** | `references/quality-postgres.md` -> Principle 1 |
| **What** | Add concrete Prisma models for user-owned guitar practice items, guitar practice days, timed practice item evidence, and guitar daily reviews. Use per-user uniqueness on the date, foreign keys to `User`, and indexes on `(userId, dayStart/practiceDate)`. |
| **Why** | The core entity is a daily evidence record with per-item time evidence. The item list is configurable, but still domain-specific to Guitar Practice. A generic module table or template system would be speculative; direct tables are easier to query, test, and protect. |
| **Depends on** | None |

Recommended shape:
- `GuitarPracticeItem`: `id`, `userId`, `label`, `defaultPlannedSeconds Int`, `sortOrder Int`, `archivedAt DateTime?`, timestamps, `@@index([userId, sortOrder])`.
- `GuitarPracticeDay`: `id`, `userId`, `practiceDate @db.Date`, `comment String @default("")`, timestamps, `@@unique([userId, practiceDate])`, `@@index([userId, practiceDate])`.
- `GuitarPracticeItemLog`: `id`, `practiceDayId`, `practiceItemId`, `itemLabelSnapshot`, `plannedSeconds Int`, `elapsedSeconds Int @default(0)`, `completed Boolean @default(false)`, timestamps, `@@unique([practiceDayId, practiceItemId])`, `@@index([practiceDayId])`.
- `GuitarPracticeReview`: `id`, `userId`, `dayStart @db.Date`, `text`, `generatedAt`, timestamps, `@@unique([userId, dayStart])`, `@@index([userId, dayStart])`.
- Add `guitarPracticeItems`, `guitarPracticeDays`, and `guitarPracticeReviews` relations to `User`.
- Seed default practice items lazily for a user the first time they open Guitar Practice or call the guitar router, using a small constant list in code.
- Use `archivedAt` for removal instead of hard delete so historical practice logs and AI reviews remain interpretable.

### 3. Create a Guitar Practice tRPC Router

| | |
|---|---|
| **Domain** | Backend x Carmack - `protectedProcedure` as a type constraint |
| **Ref** | `references/quality-backend.md` -> Principle 4 |
| **What** | Add a sibling `guitarPractice` router with protected procedures for listing recent days, managing practice items, upserting a day, and deleting/clearing a day if needed. Merge it into `server/routers/_app.ts` under its own namespace. |
| **Why** | This copies the FoodPhoto router organization while keeping auth and cache invalidation obvious. Every query must filter by the authenticated user's database id. |
| **Depends on** | Task 2 |

Procedure outline:
- `list`: returns active practice items, recent practice days, item logs, and reviews, bounded with `take`.
- `createItem`: adds a user-owned practice item with `label`, `defaultPlannedSeconds`, and `sortOrder`.
- `updateItem`: edits a user-owned practice item's `label`, `defaultPlannedSeconds`, and ordering fields.
- `archiveItem`: sets `archivedAt`; do not hard-delete items that may have historical logs.
- `upsertDay`: accepts `dayKey`, timed item logs, and `comment`; validates practice item ids belong to the current user; validates planned and elapsed seconds; trims comments.
- `saveItemTime`: accepts `dayKey`, `itemId`, `plannedSeconds`, `elapsedSeconds`, and `completed` for low-friction timer saves if a full-day upsert feels too coarse.
- Optional `deleteDay` or `clearDay`: only if the UI needs a real undo/reset path.

### 4. Build the Guitar AI Review Router Path

| | |
|---|---|
| **Domain** | Backend x Collina - Validate at the boundary, sanitize at the exit |
| **Ref** | `references/quality-backend.md` -> Principle 3 |
| **What** | Add `generateReview` to the guitar router, following `roundups.generate`: load the user's target day, load previous 7 practice days/reviews, build a prompt, call Vertex, parse text, and upsert the daily guitar review. |
| **Why** | The product loop requires recent-history-aware feedback. Keeping the guitar AI path next to guitar practice data avoids a generic AI-review framework and makes the day evidence explicit. |
| **Depends on** | Task 3 |

Key rules:
- Reject empty days before calling Vertex: no completed/timed checklist items and no comment means no evidence.
- Use a text-only prompt; no R2 or image handling.
- Return a generic provider failure message to the client and log provider details server-side.
- Keep generated output in a stable plain-text section format so the client can parse it like FoodPhoto.

### 5. Write the Guitar Coaching Prompt as Domain Code

| | |
|---|---|
| **Domain** | Refactoring x Fowler - Extract pure logic, keep mutations visible |
| **Ref** | `references/refactoring.md` -> Principle 2 |
| **What** | Put the guitar prompt builder, previous-context formatter, day-key parser, and review text extraction tests near the guitar router. Keep database reads, Vertex calls, and review upsert visible in the mutation body. |
| **Why** | Prompt construction is pure and should be testable. The side-effect sequence should remain readable in one place, matching the current FoodPhoto style. |
| **Depends on** | Task 4 |

Prompt focus:
- Consistency across recent days.
- Avoided practice items, including user-customized item names.
- Planned time versus actual time spent.
- Time allocation across practice categories.
- Weak spots and repeated friction.
- Useful patterns in comments.
- One current bottleneck.
- Exactly one next practice focus for tomorrow.

Suggested output labels:
- `Overview:`
- `Practice Evidence:`
- `Pattern Read:`
- `Main Observation:`
- `Tomorrow Focus:`
- `Standard:`

### 6. Build `GuitarPracticeApp` as a Sibling Client Surface

| | |
|---|---|
| **Domain** | Frontend x Dodds - Eliminate state that can be derived, colocate what remains |
| **Ref** | `references/quality-frontend.md` -> Principle 2 |
| **What** | Create `app/guitar-practice-app.tsx` with a today-first timed practice checklist, per-item timer controls, comment box, save state, recent day sections, daily AI review card, and a small settings overlay for practice items. Use tRPC query cache for server data and local state only for the currently edited day, active timer, and settings form draft. |
| **Why** | The feature should feel like FoodPhoto: open the app, capture evidence, generate review. Avoid a dashboard or settings-heavy workflow. |
| **Depends on** | Tasks 1, 3, 4 |

UI shape:
- Header: SamApp / Guitar Practice, count or streak-like wording only if it is factual and not gamified.
- Today card: semi-fixed checklist where each row shows the item name, planned duration, elapsed duration, start/pause/reset controls, completion state, comment textarea, save button.
- Day sections: completed item summary, planned-versus-actual time summary, comment preview, review generate/regenerate.
- Settings overlay: add item, edit item label, edit default time, archive/remove item, and adjust display order if cheap to implement. Keep this utilitarian and close to Guitar Practice, not a global SamApp settings system.
- Empty state: "Log today's practice" with checklist visible, not a marketing page.

Timer behavior:
- Only one item timer can run at a time.
- Timer state is local while running, then persisted on pause, completion, item switch, or page visibility change where feasible.
- Timer precision can be practical seconds; do not build analytics-grade time tracking.
- The UI should allow manual elapsed-time adjustment for missed timer starts.

### 7. Copy, Do Not Generalize, the Review Card Pattern

| | |
|---|---|
| **Domain** | Refactoring x Fowler - Speculative generality |
| **Ref** | `references/refactoring.md` -> Principle 5 |
| **What** | Create a guitar-specific review card/parser or lightly duplicate `RoundupCard` instead of making a configurable module review component. |
| **Why** | Food reviews and practice reviews will diverge in wording, empty copy, labels, and evidence shape. A shared abstraction now would likely become a prop-heavy component with domain branches. |
| **Depends on** | Tasks 5, 6 |

Acceptable duplication:
- A `PracticeReviewCard` mirroring `RoundupCard`.
- A `practice-review-text.ts` parser mirroring `roundup-text.ts`.
- Shared CSS classes where they already fit, plus guitar-specific classes for checklist rows and evidence summaries.

### 8. Preserve Authorization and Data Minimization

| | |
|---|---|
| **Domain** | Security x Hunt - Broken access control and data minimization |
| **Ref** | `references/security.md` -> Principles 3 and 7 |
| **What** | Use `protectedProcedure`, user lookup by `clerkUserId`, and `where: { userId: user.id }` on every guitar query/mutation. Return only selected fields. Do not store raw AI request/response JSON. |
| **Why** | Guitar comments and practice evidence are private personal data. The concrete attack is IDOR: changing a day id/date or review id to read or overwrite another user's practice history. |
| **Depends on** | Tasks 3, 4 |

Checks:
- No `findUnique` by guitar row id without `userId`.
- No full Prisma model returns to the client.
- No user comments in logs.
- No provider prompts logged in full.

### 9. Keep Queries and AI Work Bounded

| | |
|---|---|
| **Domain** | Performance x Vercel - Keep payloads small; bound long chains |
| **Ref** | `references/performance.md` -> Rules 6 and 8 |
| **What** | Bound list queries, previous-history windows, comment sizes, checklist item counts, and AI output size. Trigger AI only on explicit button click. |
| **Why** | The guitar loop should stay fast and cheap. Text-only review generation is simpler than FoodPhoto image review, but unbounded history or comments can still create slow requests and noisy prompts. |
| **Depends on** | Tasks 3, 4 |

Initial limits:
- Recent practice list: 120 days max, matching FoodPhoto roundups.
- Previous context: 7 days.
- Comment: 1,000 chars max unless the UI proves it needs more.
- Practice items: cap active items to a small practical maximum, such as 20.
- Practice item labels: trim and cap length; reject blank labels.
- Practice item durations: positive bounded seconds; reject unrealistic values.
- AI output: similar or lower `maxOutputTokens` than FoodPhoto.

### 10. Add Focused Tests Before Wiring the UI Fully

| | |
|---|---|
| **Domain** | Frontend/Backend x Dodds/Fowler - Test behavior, not implementation |
| **Ref** | `references/quality-frontend.md` -> Principle 4; `references/refactoring.md` -> Principle 7 |
| **What** | Add tests for guitar data access, prompt boundaries, previous-history context, empty-day rejection, per-user isolation, and review parsing. |
| **Why** | The current repo has strong targeted tests for FoodPhoto behavior. Guitar should get the same level of coverage where data loss, privacy leaks, or poor AI prompts would hurt. |
| **Depends on** | Tasks 3, 4, 5, 7 |

Minimum tests:
- `guitar-practice` router creates/updates only the owner user's day.
- Practice item create/edit/archive is owner-scoped.
- Archived practice items stop appearing in today's active checklist but remain visible through historical logs.
- Duplicate day saves are idempotent via upsert.
- Invalid or cross-user practice item ids are rejected.
- Planned and elapsed item times are validated and persisted.
- Updating one timed item does not overwrite another item on the same day.
- Empty day review generation rejects before Vertex.
- Previous 7 practice days/reviews are included; current day and other users are excluded.
- Review parser extracts the expected labels.

### 11. Run Migration and Verification

| | |
|---|---|
| **Domain** | Postgres x Brandur - Migrations are production operations |
| **Ref** | `references/quality-postgres.md` -> Principle 3 |
| **What** | Generate a Prisma migration for the new guitar tables, inspect the SQL before applying, then run validation, tests, and a production build. |
| **Why** | New tables are low-risk, but indexes, foreign keys, and uniqueness constraints are still production operations. Verification should catch Prisma/schema drift before deploy. |
| **Depends on** | Tasks 2 through 10 |

Verification commands:
- `npx prisma validate`
- `npx prisma migrate dev --name add_guitar_practice`
- `npm test`
- `npm run build`

---

## Council Recommendations Kept

RECOMMENDATION:
- Title: Keep module boundaries concrete.
- Principle: Speculative generality.
- What to get right: Add guitar as `guitarPractice`, not as configurable modules.
- Risk if skipped: The app becomes a generic platform before the second loop proves its real needs.
- Depends on: Tasks 1, 3, 6, 7.

RECOMMENDATION:
- Title: Enforce owner scoping on every guitar row.
- Principle: Broken access control.
- What to get right: Every query and mutation must join through the authenticated user's database id.
- Risk if skipped: A user can read or mutate another user's private practice evidence.
- Depends on: Tasks 3, 4, 8.

RECOMMENDATION:
- Title: Store daily evidence with database constraints.
- Principle: Constraints are assertions.
- What to get right: Unique daily rows per user, indexed foreign keys, non-null core fields.
- Risk if skipped: Duplicate or orphaned daily evidence makes AI history unreliable.
- Depends on: Task 2.

RECOMMENDATION:
- Title: Keep AI generation explicit and bounded.
- Rule: Bound long chains and keep payloads small.
- What to get right: Explicit generate action, 7-day context, bounded comments, bounded output.
- Risk if skipped: Slow, expensive, noisy reviews that degrade the core loop.
- Depends on: Tasks 4, 9.

RECOMMENDATION:
- Title: Test the behavior that preserves trust.
- Principle: Test behavior, not implementation.
- What to get right: Per-user isolation, prompt context, empty-day rejection, parser behavior.
- Risk if skipped: The app can appear to work while leaking context or generating reviews from bad evidence.
- Depends on: Task 10.

---

## Watchpoints

- Checklist item names and planned durations are user-adjustable Guitar settings. Keep this as a direct Guitar-specific table and overlay; do not turn it into a configurable module/template system.
- Editing an item should affect future/default display. Historical logs should keep `itemLabelSnapshot` and recorded times so old evidence does not change meaning.
- Timer reliability should be good enough for personal evidence, but do not turn this into a background time-tracking service.
- Do not make FoodPhoto use the guitar data model or review card as part of this work.
- Avoid streaks, scores, progress dashboards, and gamified summaries until the capture/review loop is working.
- If Gym Tracker arrives later, use what is learned from FoodPhoto plus Guitar Practice to decide what, if anything, deserves extraction.
- Existing dirty worktree entries include deleted old plan files and `next-env.d.ts`; implementation should not restore or revert them unless explicitly requested.
