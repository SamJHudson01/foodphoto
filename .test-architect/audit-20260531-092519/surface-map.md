# Test Surface Map: FoodPhoto

**Audit timestamp:** 2026-05-31 09:25:19 Europe/London
**Scope:** Full current repository test sweep
**Test runner:** Vitest

---

## Test Files

| Test file | Source covered | Layer | Coverage notes |
|---|---|---|---|
| `app/confirm-overlay.test.tsx` | `app/confirm-overlay.tsx` | Component | Covers visible save state, duplicate save suppression, and retry after save failure. |
| `app/lightbox.test.tsx` | `app/lightbox.tsx` | Component | Covers visible delete state, duplicate delete suppression, and retry after delete failure. |

---

## Source Risk Map

| Source file | Risk | Test file | Rationale |
|---|---:|---|---|
| `server/routers/entries.ts` | High | None | Authenticated tRPC mutations create, update, and delete persisted photos; touches Prisma and R2 object storage. |
| `server/routers/roundups.ts` | High | None | Authenticated AI orchestration; builds prompts, fetches R2 images, calls Vertex, parses response, persists result. |
| `server/trpc.ts` | High | None | Auth boundary and error formatting for every protected procedure. |
| `lib/r2.ts` | High | None | R2 key construction, public URL construction, upload, and delete boundary. |
| `app/food-photo-app.tsx` | High | Partial indirect | Main app orchestration for camera, uploads, deletes, roundups, migration, grouping, and local IndexedDB migration. Child components are tested, parent flows are not. |
| `app/confirm-overlay.tsx` | Medium | `app/confirm-overlay.test.tsx` | User-visible save interaction with async in-flight guard. |
| `app/lightbox.tsx` | Medium | `app/lightbox.test.tsx` | User-visible delete and note editing interaction with async in-flight guard. |
| `app/date-format.ts` | Medium | None | Date/time grouping and labels; timezone and day-boundary behavior has already caused production confusion. |
| `app/trpc-provider.tsx` | Medium | None | Client-side tRPC provider setup; mostly wiring, but config errors break the app shell. |
| `app/trpc.ts` | Medium | None | tRPC React client exports; mostly wiring. |
| `app/api/trpc/[trpc]/route.ts` | Medium | None | Route handler adapter for the API boundary. |
| `app/page.tsx` | Low | None | Simple page composition. |
| `app/layout.tsx` | Low | None | Root layout and Clerk provider composition. |
| `app/manifest.ts` | Low | None | Static PWA manifest data. |
| `lib/prisma.ts` | Low | None | Prisma client singleton/wiring. |
| `server/routers/_app.ts` | Low | None | Router composition only. |
| `next.config.ts` | Low | None | Next config. |
| `proxy.ts` | Medium | None | Clerk middleware matcher; important but low local logic. |
| `prisma.config.ts` | Low | None | Prisma config. |
| `vitest.config.ts` | Low | None | Test config. |

---

## Untested High-Risk Files

- `server/routers/entries.ts`
- `server/routers/roundups.ts`
- `server/trpc.ts`
- `lib/r2.ts`
- `app/food-photo-app.tsx`

---

## Current Test Run

```text
Test Files  2 passed (2)
Tests       6 passed (6)
Duration    833ms
```

