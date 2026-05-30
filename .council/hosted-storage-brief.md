## Context + Feature Brief for Council Plan

### Codebase context

FoodPhoto is a Next.js App Router PWA in `/Users/samuelhudson/Desktop/dev/foodphotos`.

Current implementation:
- `app/food-photo-app.tsx` is a Client Component containing most product behavior.
- Photos are currently captured in-browser, compressed to a Blob, and stored in IndexedDB under `foodphotos-local`.
- Entries, notes, and AI roundups are local-first right now.
- `app/api/roundup/route.ts` calls OpenRouter directly from a Next API route.
- The app uses CSS Modules + BEM-like class naming.
- There is no tRPC, Prisma, Neon, Clerk, or R2 integration yet.
- No `conventions.md` exists.

Recent commits:
- `26e0cc8 Add local sample photos for testing`
- `247da74 Add daily AI roundup experiment`
- `1e17320 Lock empty app viewport on mobile`
- `0be2b11 Fix empty mobile viewport scrolling`
- `6f81944 Build real local food photo app`

One unrelated generated file is dirty: `next-env.d.ts`.

### Stack in use

Current stack:
- Next.js App Router
- React
- TypeScript strict mode
- CSS Modules
- IndexedDB via `idb`
- Direct API route for OpenRouter

Target council stack:
- Next.js App Router
- React
- TypeScript
- tRPC
- Prisma
- Neon Postgres
- Clerk auth
- CSS Modules + BEM
- Cloudflare R2 for photo object storage
- OpenRouter for AI roundups

### Accepted conventions

No project `conventions.md` exists. Follow the council stack conventions:
- tRPC is the application API boundary.
- Prisma + Neon is the durable metadata store.
- Clerk owns authentication; app code owns authorization.
- CSS Modules + BEM for UI.
- Server secrets stay server-only.
- Browser storage cannot be source of truth.

### Feature scope (AGREED WITH DEVELOPER)

Feature: Hosted storage + DB migration using the council stack.

What it does:
Migrate FoodPhoto from browser-local IndexedDB storage to a hosted architecture. Photos are uploaded to Cloudflare R2, food entry metadata is stored in Neon Postgres through Prisma, and app data is accessed through tRPC from the Next.js App Router frontend. Existing locally stored IndexedDB photos should be preserved through a one-time upload/import flow.

Users and access:
Use Clerk from the beginning. The app is still personal-only, but data must be scoped to the authenticated Clerk user. Only the signed-in owner should be able to create, read, update, delete, migrate, or generate AI roundups for their own entries.

Data:
Hosted source of truth. R2 stores photo objects. Neon stores users, food entries, photo object keys/URLs, notes, timestamps, migration status, and AI daily roundups. Nothing should remain local as source of truth. IndexedDB may only be used temporarily to detect and migrate old local entries.

Integrations:
Clerk auth, Prisma + Neon Postgres, Cloudflare R2 object storage, tRPC API layer, OpenRouter for AI roundups. R2 photo reads may use unlisted public URLs, but uploads/deletes must happen server-side.

Out of scope:
Native iOS app, iPhone Photos library integration, public sharing, multi-user/social features, nutrition scoring, calorie/macros, automatic background sync, and long-term analytics/trend dashboards.

Developer decisions:
Use the council stack: Next.js App Router, React, TypeScript, tRPC, Prisma, Neon Postgres, Clerk, CSS Modules + BEM. Use Cloudflare R2 for photo storage. R2 unlisted public read URLs are acceptable. Preserve current local photos via migration.

### Key observations

- This is a source-of-truth migration, not just a storage adapter swap.
- The app currently has a large client component that mixes capture, local persistence, gallery rendering, sample data, roundup generation, and edit/delete flows.
- The new architecture should move durable mutations behind protected tRPC procedures.
- R2 object keys must include authenticated user ownership in the key or metadata shape, but authorization cannot rely on object key naming alone.
- Existing IndexedDB data needs a deliberate migration flow after Clerk sign-in.
- AI roundup generation should move from local blobs to server-side R2/DB-backed day data.
