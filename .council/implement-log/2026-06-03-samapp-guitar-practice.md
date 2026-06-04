# Council Implementation Log: SamApp Guitar Practice

**Plan:** Council Plan: SamApp Guitar Practice
**Tasks completed:** 11/11
**Conventions respected:** Existing Next.js App Router, tRPC protected procedures, Prisma models/migrations, CSS Modules, colocated tests.

---

## Task Log

### Task 1: Add a Thin SamApp Shell

**Domain:** Frontend x Carmack - Duplication is local damage; wrong abstractions are systemic damage
**Ref applied:** Kept FoodPhoto mounted through its existing component and added a concrete two-tab shell instead of a module framework.

**Files changed:**
- `app/sam-app-shell.tsx` - added bottom-tab shell for FoodPhoto and Guitar.
- `app/page.tsx` - renders SamApp shell for signed-in users and SamApp branding for signed-out users.
- `app/layout.tsx`, `app/manifest.ts`, `app/food-photo-app.tsx`, `app/page.module.css` - updated user-facing app name/logo to SamApp using `public/sam.jpeg`.

**Verification:** `npx tsc --noEmit`, `npm test`, `npm run build` passed.
**Notes:** Designer reference used bottom tabs; implementation follows that pattern.

---

### Task 2: Model Guitar Daily Evidence Directly

**Domain:** Postgres x Carmack - Constraints are assertions
**Ref applied:** Added concrete guitar tables with per-user date uniqueness, foreign keys, and indexes.

**Files changed:**
- `prisma/schema.prisma` - added `GuitarPracticeItem`, `GuitarPracticeDay`, `GuitarPracticeItemLog`, `GuitarPracticeReview`, and `User` relations.
- `prisma/migrations/20260603120000_add_guitar_practice/migration.sql` - migration SQL for new tables, unique constraints, indexes, and FKs.

**Verification:** `npx prisma validate` passed; `npx prisma migrate dev --name add_guitar_practice` applied cleanly.

---

### Task 3: Create a Guitar Practice tRPC Router

**Domain:** Backend x Carmack - `protectedProcedure` as a type constraint
**Ref applied:** Every guitar procedure is protected and scopes through the authenticated user's database id.

**Files changed:**
- `server/routers/guitar-practice.ts` - added `list`, item management, day upsert, item-time save, and clear-day procedures.
- `server/routers/_app.ts` - mounted `guitarPractice` namespace.

**Verification:** `server/routers/guitar-practice.test.ts`, `npm test`, `npx tsc --noEmit` passed.

---

### Task 4: Build the Guitar AI Review Router Path

**Domain:** Backend x Collina - Validate at the boundary, sanitize at the exit
**Ref applied:** Bounded Zod inputs, empty-evidence rejection before provider call, generic provider failure to client, provider detail logged without comments/prompts.

**Files changed:**
- `server/routers/guitar-practice.ts` - added `generateReview` with target-day evidence, previous 7 review context, Vertex call, text parse, and review upsert.

**Verification:** Empty-day and previous-context tests passed; `npm test` passed.

---

### Task 5: Write the Guitar Coaching Prompt as Domain Code

**Domain:** Refactoring x Fowler - Extract pure logic, keep mutations visible
**Ref applied:** Prompt construction, evidence formatting, previous-context formatting, day-key parsing, and text extraction are pure exported functions; DB/provider/upsert side effects stay visible in the mutation.

**Files changed:**
- `server/routers/guitar-practice.ts` - added pure prompt/review helpers and tests.

**Verification:** Pure-helper tests in `server/routers/guitar-practice.test.ts` passed.

---

### Task 6: Build `GuitarPracticeApp` as a Sibling Client Surface

**Domain:** Frontend x Dodds - Eliminate state that can be derived, colocate what remains
**Ref applied:** Server data stays in tRPC query cache; local state is limited to today's draft, active timer state, comments, and settings drafts.

**Files changed:**
- `app/guitar-practice-app.tsx` - added today-first checklist, per-item timer controls, comment save, recent-day sections, review generation, and settings overlay.
- `app/page.module.css` - added guitar UI styles following the designer's compact card/progress direction.

**Verification:** `npx tsc --noEmit`, `npm run build` passed.

---

### Task 7: Copy, Do Not Generalize, the Review Card Pattern

**Domain:** Refactoring x Fowler - Speculative generality
**Ref applied:** Created guitar-specific review card/parser instead of a configurable shared review component.

**Files changed:**
- `app/practice-review-card.tsx` - guitar review card/overlay.
- `app/practice-review-text.ts` - guitar-specific review parser/preview.
- `app/practice-review-text.test.ts` - parser coverage.

**Verification:** `app/practice-review-text.test.ts` and full `npm test` passed.

---

### Task 8: Preserve Authorization and Data Minimization

**Domain:** Security x Hunt - Broken access control and data minimization
**Ref applied:** No guitar procedure trusts client row ids without user ownership checks; outputs use `select`; prompts/raw provider payloads are not stored.

**Files changed:**
- `server/routers/guitar-practice.ts` - owner-scoped queries/mutations and selected output fields.
- `server/routers/guitar-practice.test.ts` - cross-user item/day/review context tests.

**Verification:** Owner isolation tests passed.

---

### Task 9: Keep Queries and AI Work Bounded

**Domain:** Performance x Vercel - Keep payloads small; bound long chains
**Ref applied:** Recent days capped to 120, previous context capped to 7, active items capped to 20, comment/label/duration limits enforced, AI only runs on explicit click with lower output token cap.

**Files changed:**
- `server/routers/guitar-practice.ts` - bounded inputs, queries, and Vertex generation config.

**Verification:** `npm test`, `npm run build` passed.

---

### Task 10: Add Focused Tests Before Wiring the UI Fully

**Domain:** Frontend/Backend x Dodds/Fowler - Test behavior, not implementation
**Ref applied:** Tests cover ownership, archive behavior, idempotent day upsert, partial item save, invalid item ids, empty-day rejection, previous context, and parser labels.

**Files changed:**
- `server/routers/guitar-practice.test.ts`
- `app/practice-review-text.test.ts`

**Verification:** `npm test` passed with 49 tests across 10 files.

---

### Task 11: Run Migration and Verification

**Domain:** Postgres x Brandur - Migrations are production operations
**Ref applied:** Migration SQL was inspected before applying; validation, migration, tests, TypeScript, and production build were run.

**Files changed:**
- `prisma/migrations/20260603120000_add_guitar_practice/migration.sql`
- `next.config.ts` - allowed Google Fonts origins required by existing typography under CSP while leaving Clerk telemetry blocked.

**Verification:** `npx prisma validate`, `npx prisma migrate dev --name add_guitar_practice`, `npx tsc --noEmit`, `npm test`, and `npm run build` passed.

---

## Watchpoints Addressed

- Guitar remains direct and domain-specific; no module registry or generic review framework was introduced.
- Historical logs store `itemLabelSnapshot` so renamed/archived items do not rewrite old evidence meaning.
- Item removal uses `archivedAt`; active checklist excludes archived items.
- Timer is practical local UI state and persists on pause, completion, item switch, manual edits, save, and page visibility change.
- FoodPhoto data model and review path were not changed beyond SamApp branding/shell.
- Streaks, scoring, dashboards, and gamification were not added.
- After screenshot review, the Guitar UI was corrected toward the supplied design: bottom tabs, `GuitarPractice` header, amber guitar mark, today/history day sections, circular play controls, thin item progress bars, tucked practice review, full-screen timer overlay, and full-screen practice-list settings.
- Default practice items now match the design: Warm-up, Bends, Scales, Chord changes, Song.

## Pre-existing Issues Encountered

- The worktree already had deleted old plan files: `PLAN-food-photo-tracker-pwa.md` and `PLAN-hosted-storage-council-stack.md`. They were not restored or reverted.
- An existing dev server was already running on port 3000, so a new `npm run dev` session exited. Smoke check used the existing server.
- Clerk telemetry is blocked by CSP in dev console. This was left blocked for data minimization.
- Signed-in Guitar UI could not be browser-smoke-tested end to end without an authenticated Clerk session; verification relied on TypeScript, tests, and production build.

## Ready for Review

Implementation log path:
`.council/implement-log/2026-06-03-samapp-guitar-practice.md`

Files in scope:
- `app/sam-app-shell.tsx`
- `app/guitar-practice-app.tsx`
- `app/practice-review-card.tsx`
- `app/practice-review-text.ts`
- `app/practice-review-text.test.ts`
- `app/page.tsx`
- `app/layout.tsx`
- `app/manifest.ts`
- `app/food-photo-app.tsx`
- `app/page.module.css`
- `next.config.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260603120000_add_guitar_practice/migration.sql`
- `server/routers/_app.ts`
- `server/routers/guitar-practice.ts`
- `server/routers/guitar-practice.test.ts`
- `public/sam.jpeg`
