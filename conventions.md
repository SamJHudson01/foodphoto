# Project Conventions

## Client Mutations

- Client mutation handlers must never silently drop user writes. Queue, serialize per entity, or show an error when a write cannot be accepted.
- Editable local drafts must not be overwritten by routine server refetches. Reset drafts only on explicit open, cancel, save, or identity changes.
- Settings and form mutations need visible pending and failure states. Keep the editing surface open when persistence fails.

## Verification

- Verification scripts in `package.json` must remain executable after framework upgrades. If a tool command is deprecated or removed, replace the script in the same change.
- Destructive mutations require behavioral tests covering the target record, missing-record idempotency, and cross-user isolation.

## Persistence

- Multi-row domain saves must use a transaction so partial writes cannot persist after a failed request.
- Default seeding must be idempotent at the database boundary, using a database-enforced key or equivalent invariant.
- Business-critical numeric invariants must be enforced by Postgres constraints as well as application validation.

## AI Pipelines

- LLM output must be structurally validated before persistence or reuse as future context.
- External AI calls need bounded timeouts and abuse controls before provider requests are made.

## UI Layout

- Full-height sheets with variable content need a scrollable body and reachable actions on mobile and desktop.
