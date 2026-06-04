FINDING:
- Title: Clear-day deletion has no behavioral test
- File: server/routers/guitar-practice.test.ts:417
- Principle: Test what might break; specify tests as behavioral variants
- Severity: P2
- What's wrong: The guitar practice router behavior suite covers list, item mutation, day upsert, item timer saves, and review generation, but it never calls `clearDay`. That mutation is a destructive workflow, so the suite does not prove that clearing one date removes the intended practice day and logs while leaving other dates and users intact.
- Consequence: A regression in the clear-day path could silently delete the wrong data, fail to clear logs, or report success without changing persisted state.
- Fix: Add behavioral tests for clearing an existing day with logs, clearing a missing day idempotently, and preserving another user's day for the same date.

FINDING:
- Title: Review generation test does not prove the review is persisted
- File: server/routers/guitar-practice.test.ts:558
- Principle: Assertions are the test; test what might break
- Severity: P2
- What's wrong: The happy-path review generation test asserts on the returned text and prompt filtering, but it does not assert that `guitarPracticeReview.upsert` changed persisted review state. Because the fake Prisma stores reviews in memory, the test can directly check whether the current day's existing review was replaced rather than merely receiving a response object.
- Consequence: The mutation could stop saving the generated review, append a duplicate, or fail to replace the current day's review while this test still passes.
- Fix: Extend the happy-path case to assert the stored review count, the current-day review text, and that previous-review context rows were not mutated.
