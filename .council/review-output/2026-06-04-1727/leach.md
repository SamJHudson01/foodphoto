FINDING:
- Title: Practice duration invariants are not enforced by Postgres
- File: prisma/schema.prisma:60
- Principle: Constraints are assertions - the database is the last line of defence
- Severity: P2
- What's wrong: `defaultPlannedSeconds`, `plannedSeconds`, and `elapsedSeconds` rely on router Zod validation for positive values and upper bounds, but the schema and migration define plain `INTEGER NOT NULL` columns with no `CHECK` constraints. Any raw SQL, migration script, future router, or Prisma call path can persist negative or unrealistic practice durations.
- Consequence: Corrupt timing data can enter the core practice log and poison totals, completion state interpretation, and generated practice reviews.
- Fix: Add explicit Postgres `CHECK` constraints in the migration for the duration columns, matching the business limits enforced in `server/routers/guitar-practice.ts`, and keep the Prisma schema comments or migration naming clear because Prisma cannot model these checks natively.

FINDING:
- Title: Default item seeding can duplicate rows under concurrent first loads
- File: server/routers/guitar-practice.ts:259
- Principle: Transactions are the unit of correctness - understand what isolation buys you
- Severity: P2
- What's wrong: `seedDefaultItemsIfNeeded` performs a count, then inserts defaults one by one outside a transaction and without a database uniqueness constraint for the seeded set. Two first-time `list` requests for the same user can both observe zero items and both insert the default practice list.
- Consequence: A new user can receive duplicate default practice items, which then affects ordering, active item limits, log selection, and review evidence.
- Fix: Make seeding atomic by using a database-enforced uniqueness invariant for seeded items plus idempotent inserts, or wrap the check-and-create sequence in a serializable transaction with retry handling.

FINDING:
- Title: Day saves are not atomic across the day row and item logs
- File: server/routers/guitar-practice.ts:425
- Principle: Transactions are the unit of correctness - understand what isolation buys you
- Severity: P2
- What's wrong: `upsertDay` persists the day comment, then upserts each item log in separate statements outside a transaction. If one item-log write fails after earlier writes have succeeded, the procedure reports failure while leaving a partially updated practice day in the database.
- Consequence: The client can retry or refresh into a mixed state where the comment and some logs came from the failed save, while later logs remain stale.
- Fix: Wrap the day upsert, item-log upserts, and final day read in a single Prisma transaction so the save either commits as one complete practice-day snapshot or rolls back completely.
