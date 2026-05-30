## Context + Feature Brief for Council Plan

### Codebase context

The project directory is currently empty and is not a git repository. This is a new app plan rather than a feature plan against an existing codebase.

### Stack in use

No stack is implemented yet. Use the council baseline where it fits the agreed scope: Next.js App Router, React, TypeScript, and CSS Modules + BEM for the PWA. Because v1 is local-only and personal-only, do not activate tRPC, Prisma, Neon, or Clerk yet; preserve clean boundaries so those parts of the council stack can be added later if sync, backend storage, or auth enter scope.

### Accepted conventions

No `conventions.md` exists in the project. Use the council defaults: simple boundaries, type-safe data handling, minimal dependencies, local state colocation, and no speculative abstractions.

### Feature scope (AGREED WITH DEVELOPER)

Feature: Personal food photo tracker PWA.

What it does: A mobile-first PWA where the user opens the app, takes a food photo from inside the app, saves it with an automatic timestamp and optional note, then browses saved entries in a gallery grouped by day.

Users and access: Personal-only app. No accounts, sharing, roles, or multi-user permissions in v1.

Data: Local-only storage on the device for photos, timestamps, and notes. Entries can be deleted. Notes can be edited after saving.

Integrations: Device camera via browser/PWA APIs.

Out of scope: Photo library upload, backup/export, cross-device sync, hosted backend, cloud storage, auth, analytics, nutrition tracking, calorie/macros, search/filtering, tags, meal categories, and offline-first guarantees.

Developer decisions: Keep it extremely simple. Camera capture only. Local-only for now. Offline support is not important beyond whatever naturally works from local browser storage.

### Key observations

- Next.js App Router should be used as the app shell, but the v1 data boundary remains browser-local.
- Browser-local image persistence should be treated as the core domain boundary, not an implementation detail.
- IndexedDB is the right browser primitive for local photo blobs; localStorage is not appropriate for image data.
- The PWA can be installable without promising robust offline capture.
- Because there is no backend, security and Postgres recommendations mostly translate into data minimisation, camera permission scope, dependency minimisation, and preserving future migration boundaries.
