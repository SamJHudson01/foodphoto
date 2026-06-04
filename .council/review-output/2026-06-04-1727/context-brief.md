## Context Brief for Council Review

### Scope
Uncommitted work around the SamApp guitar practice feature:

- `app/guitar-practice-app.tsx`
- `app/practice-review-card.tsx`
- `app/practice-review-text.ts`
- `app/practice-review-text.test.ts`
- `app/sam-app-shell.tsx`
- `app/page.tsx`
- `app/layout.tsx`
- `app/manifest.ts`
- `app/page.module.css`
- `app/food-photo-app.tsx`
- `next.config.ts`
- `package.json`
- `prisma/schema.prisma`
- `prisma/migrations/20260603120000_add_guitar_practice/migration.sql`
- `server/routers/_app.ts`
- `server/routers/guitar-practice.ts`
- `server/routers/guitar-practice.test.ts`

Deleted plan files are present in the worktree but are not behavioral application code.

### What this code does
The change turns the original food photo app into a two-surface personal SamApp with a new guitar practice tracker. Signed-in users can manage practice items, time today's practice, save comments, view recent history, and generate an AI practice review from logged evidence and previous reviews.

### Architecture
The Next.js App Router page renders Clerk-gated signed-in/signed-out states. Signed-in users see `SamAppShell`, which switches locally between `FoodPhotoApp` and `GuitarPracticeApp`.

The guitar client uses tRPC/TanStack Query for `guitarPractice.list` plus mutations for item CRUD, day upserts, per-item timer saves, clear-day, and review generation. The server router uses Prisma models for items, days, item logs, and AI-generated reviews. Review generation builds a deterministic prompt from saved practice evidence and previous seven days of reviews, calls Vertex via `fetch`, then upserts the review.

### Stack in use
Next.js App Router, React, TypeScript strict mode, tRPC, TanStack Query, Prisma/Postgres, Clerk, Vitest/jsdom, CSS Modules, Vertex/Gemini direct HTTP call.

### Automated check results
- `npx tsc --noEmit`: pass.
- `npm test`: pass, 10 test files and 49 tests.
- `npm run db:validate`: pass, Prisma schema valid.
- `npm run lint`: fail. The configured script runs `next lint`; with the installed Next version it errors with `Invalid project directory provided, no such directory: /Users/samuelhudson/Desktop/dev/foodphotos/lint`.

### Domain File Assignments
**Hunt:** `server/routers/guitar-practice.ts`, `server/routers/_app.ts`, `server/trpc.ts`, `next.config.ts`, `app/page.tsx`

**Dodds:** `app/guitar-practice-app.tsx`, `app/practice-review-card.tsx`, `app/practice-review-text.ts`, `app/sam-app-shell.tsx`, `app/trpc-provider.tsx`, `app/trpc.ts`

**Collina:** `server/routers/guitar-practice.ts`, `server/routers/guitar-practice.test.ts`, `server/trpc.ts`

**Leach:** `prisma/schema.prisma`, `prisma/migrations/20260603120000_add_guitar_practice/migration.sql`, `server/routers/guitar-practice.ts`

**Performance:** `app/guitar-practice-app.tsx`, `app/page.module.css`, `server/routers/guitar-practice.ts`

**Saarinen:** `app/page.module.css`, `app/guitar-practice-app.tsx`, `app/practice-review-card.tsx`, `app/sam-app-shell.tsx`, `app/page.tsx`

**Friedman:** `app/guitar-practice-app.tsx`, `app/practice-review-card.tsx`, `app/sam-app-shell.tsx`, `app/page.tsx`

**Fowler:** `app/guitar-practice-app.tsx`, `server/routers/guitar-practice.ts`, `app/practice-review-text.ts`, `app/sam-app-shell.tsx`

**Willison:** `server/routers/guitar-practice.ts`, `app/practice-review-text.ts`, `server/routers/guitar-practice.test.ts`

**Beck:** `server/routers/guitar-practice.test.ts`, `app/practice-review-text.test.ts`, `app/confirm-overlay.test.tsx`, `app/lightbox.test.tsx`, `app/roundup-card.test.tsx`, `server/routers/*.test.ts`, `lib/r2.test.ts`
