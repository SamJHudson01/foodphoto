# Council Plan: Food Photo Tracker PWA

**Scope:** Personal-only mobile PWA for taking food photos, saving timestamped entries with optional notes, and browsing them in a gallery grouped by day.
**Context:** New empty project in `/Users/samuelhudson/Desktop/dev/foodphotos`. No existing app, git history, conventions, backend, database, or auth.
**Boundaries:** Local-only v1. Camera capture only. No upload picker, sync, export, accounts, nutrition tracking, search, tags, or offline-first guarantees.
**Council dispatched:** Troy Hunt (security), Martin Fowler (refactoring), Kent C. Dodds (frontend), Matteo Collina (backend/runtime), Brandur Leach (data integrity), Vercel Performance.
**Stack decision:** Use the council baseline where it fits v1: Next.js App Router, React, TypeScript, and CSS Modules + BEM. Do not activate tRPC, Prisma, Neon, or Clerk until the product scope includes server data, sync, or accounts.

---

## Task Sequence

### 1. Create the Next.js App Router PWA skeleton

| | |
|---|---|
| **Domain** | Martin Fowler + Carmack - Architecture earns its boundaries |
| **Ref** | `references/refactoring.md` -> Principle 6 |
| **Depends on** | - |

Create a Next.js App Router project with React, TypeScript, and CSS Modules + BEM. Keep it server-light: no tRPC router, Prisma schema, Neon connection, or Clerk auth in v1 because the agreed product is local-only and personal-only.

---

### 2. Define the local domain model before UI work

| | |
|---|---|
| **Domain** | Brandur Leach + Carmack - Constraints are assertions |
| **Ref** | `references/quality-postgres.md` -> Principle 1 |
| **Depends on** | 1 |

Define one `FoodEntry` shape: stable id, captured timestamp, optional note, image blob reference, and any lightweight image metadata needed for rendering. Store an epoch timestamp and derive the displayed day from the user's local timezone so grouping matches how you think about meals.

---

### 3. Build a narrow IndexedDB persistence boundary

| | |
|---|---|
| **Domain** | Martin Fowler + Carmack - Extract pure logic, keep mutations visible |
| **Ref** | `references/refactoring.md` -> Principle 2 |
| **Depends on** | 2 |

Use IndexedDB for photo blobs and entry metadata, preferably through a small typed wrapper such as `idb`. Keep all create, update-note, delete, and list-by-date operations in one client-only local storage module so storage mutation is visible and future tRPC/Prisma sync can be added without touching every component.

---

### 4. Implement camera-only capture with explicit permission states

| | |
|---|---|
| **Domain** | Troy Hunt + Carmack - Shrink the attack surface |
| **Ref** | `references/security.md` -> Principle 5 |
| **Depends on** | 1 |

Use `getUserMedia` from a Client Component with the rear-facing camera preference and capture from the live stream into an image blob. Avoid a generic file input for v1 because browsers may expose the photo library, which violates the agreed camera-only scope.

---

### 5. Save entries as a single visible transaction in the UI flow

| | |
|---|---|
| **Domain** | Matteo Collina + Carmack - Validate at the boundary, sanitize at the exit |
| **Ref** | `references/quality-backend.md` -> Principle 3 |
| **Depends on** | 3, 4 |

When the user confirms a photo, validate the captured blob exists, generate the timestamp, normalize the note, and persist the entry in one clear sequence. Treat camera denial, storage quota failure, and failed blob creation as operational errors with specific UI states instead of silent failures.

---

### 6. Render the gallery from persisted entries with derived day groups

| | |
|---|---|
| **Domain** | Kent C. Dodds + Carmack - Eliminate state that can be derived |
| **Ref** | `references/quality-frontend.md` -> Principle 2 |
| **Depends on** | 3, 5 |

Load entries ordered by timestamp and derive day sections during render or in a pure selector. Do not store grouped gallery state separately; the persisted entry list is the source of truth, and duplicated grouping state will eventually drift.

---

### 7. Add simple note editing with local state only at the edit surface

| | |
|---|---|
| **Domain** | Kent C. Dodds + Carmack - Composition over configuration |
| **Ref** | `references/quality-frontend.md` -> Principle 5 |
| **Depends on** | 3, 6 |

Use a focused entry detail or inline edit surface that owns only the draft note while editing. On save, update just the note field in IndexedDB and refresh the gallery from storage rather than trying to maintain parallel copies across the app.

---

### 8. Add delete with confirmation and blob cleanup

| | |
|---|---|
| **Domain** | Matteo Collina + Carmack - Resource management |
| **Ref** | `references/quality-backend.md` -> Principle 5 |
| **Depends on** | 3, 6 |

Deleting an entry should remove both metadata and the stored photo blob, then update the visible list. Keep the confirmation modest but explicit because local-only plus no export means deletion is final in v1.

---

### 9. Design mobile-first screens around the actual daily workflow

| | |
|---|---|
| **Domain** | Kent C. Dodds + Carmack - Duplication is local damage; wrong abstractions are systemic damage |
| **Ref** | `references/quality-frontend.md` -> Principle 1 |
| **Depends on** | 4, 6, 7, 8 |

Make the App Router root page the gallery with a persistent capture action, not a landing page. Keep components concrete until repeated shapes appear: capture view, gallery day section, entry tile, and edit/delete surface are enough for v1.

---

### 10. Make the PWA installable without overpromising offline behavior

| | |
|---|---|
| **Domain** | Vercel Performance + Carmack - Cache intentionally |
| **Ref** | `references/performance.md` -> Rule 5 |
| **Depends on** | 1, 9 |

Add Next metadata, manifest, app icons, theme color, viewport handling, and minimal service worker setup needed for installability. Cache the app shell if convenient, but do not build complex offline queues because offline robustness is explicitly not important for v1.

---

### 11. Keep image payloads bounded at capture time

| | |
|---|---|
| **Domain** | Vercel Performance + Carmack - Keep payloads small |
| **Ref** | `references/performance.md` -> Rule 6 |
| **Depends on** | 4, 5 |

Resize or compress captured photos before storing them locally so the gallery stays responsive and device storage is not burned quickly. Use a conservative fixed maximum dimension suitable for phone viewing rather than preserving full camera resolution.

---

### 12. Add focused behavior tests and manual device checks

| | |
|---|---|
| **Domain** | Kent C. Dodds + Carmack - Test behavior, not implementation |
| **Ref** | `references/quality-frontend.md` -> Principle 4 |
| **Depends on** | 5, 6, 7, 8, 10 |

Cover the core behavior: capture/save creates a timestamped entry, gallery groups by day, note edits persist, delete removes the entry, and storage errors show a recoverable state. Add real mobile browser checks for camera permission and PWA install behavior because desktop tests will not prove those paths.

---

## Risks & Watchpoints

- **Troy Hunt - Data minimization:** Local-only does not mean risk-free. Do not add analytics, logging of notes, cloud uploads, or broad permissions without a new scope decision.
- **Brandur Leach - Constraints are assertions:** IndexedDB has weaker constraint ergonomics than Postgres. Keep validation close to the storage boundary so bad records do not accumulate locally.
- **Kent C. Dodds - Derive state:** Gallery day groups, entry counts, and empty states should be derived from entries, not stored as separate state.
- **Matteo Collina - Operational errors:** Camera denial, quota exceeded, and browser API unsupported states are expected runtime outcomes, not programmer bugs. They need clear UI states.
- **Vercel Performance - Asset optimization:** Uncompressed phone photos will make the app feel broken long before the code is complex.
- **Martin Fowler - Speculative generality:** Do not build sync-ready abstractions, tagging systems, nutrition fields, account models, or import/export surfaces until v1 proves the diary habit is useful.

## Summary

| # | Task | Domain | Depends on |
|---|------|--------|------------|
| 1 | Create the Next.js App Router PWA skeleton | Refactoring | - |
| 2 | Define the local domain model before UI work | Data integrity | 1 |
| 3 | Build a narrow IndexedDB persistence boundary | Refactoring | 2 |
| 4 | Implement camera-only capture with explicit permission states | Security | 1 |
| 5 | Save entries as a single visible transaction in the UI flow | Runtime | 3, 4 |
| 6 | Render the gallery from persisted entries with derived day groups | Frontend | 3, 5 |
| 7 | Add simple note editing with local state only at the edit surface | Frontend | 3, 6 |
| 8 | Add delete with confirmation and blob cleanup | Runtime | 3, 6 |
| 9 | Design mobile-first screens around the actual daily workflow | Frontend | 4, 6, 7, 8 |
| 10 | Make the PWA installable without overpromising offline behavior | Performance | 1, 9 |
| 11 | Keep image payloads bounded at capture time | Performance | 4, 5 |
| 12 | Add focused behavior tests and manual device checks | Frontend | 5, 6, 7, 8, 10 |

## Verdict

Build this as a small local-first Next.js App Router PWA with React, TypeScript, CSS Modules + BEM, IndexedDB as the only persistence layer, and `getUserMedia` as the capture path. The full council stack remains the direction of travel, but tRPC, Prisma, Neon, and Clerk should not be installed for v1 because they contradict the local-only/no-account scope. Anything resembling accounts, sync, import/export, nutrition analysis, or generalized media management should stay out of v1.
