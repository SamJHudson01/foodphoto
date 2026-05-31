# Test Audit: FoodPhoto Current Suite

**Audited:** 2 test files covering 2 source files directly
**Untested high-risk files:** `server/routers/entries.ts`, `server/routers/roundups.ts`, `server/trpc.ts`, `lib/r2.ts`, `app/food-photo-app.tsx`

---

## P1 — Fix Now

### 1. Photo persistence mutations have no backend behavioral tests

| | |
|---|---|
| **Test file** | None |
| **Source file** | `server/routers/entries.ts` |
| **Principle** | Principle 4 — Test what might break |

**Finding:** The create, updateNote, and delete tRPC mutations are untested even though they are the system of record for photo persistence. The code uploads to R2 before creating the database row, trims note text, handles migration-key idempotency, enforces ownership, and deletes the R2 object after deleting the database row.

**Consequence:** The UI tests prove the buttons do not double-submit locally, but they do not prove the server protects data ownership, preserves idempotency for migration uploads, stores the correct metadata, or cleans up R2 when Prisma creation fails.

**Fix:** Add Vitest integration tests for `entries.create`, `entries.updateNote`, `entries.delete`, and `entries.list` using a real test database context or a deliberately small procedure harness. Mock only the R2 boundary (`putPhotoObject`, `deletePhotoObject`, `publicPhotoUrl`) and assert persisted rows plus ownership behavior.

---

## P2 — Fix Soon

### 2. AI roundup orchestration is untested at the deterministic boundaries

| | |
|---|---|
| **Test file** | None |
| **Source file** | `server/routers/roundups.ts` |
| **Principle** | Principle 8 — Non-deterministic systems need deterministic tests |

**Finding:** The roundup path has deterministic logic mixed into the live Vertex path: prompt construction, timezone formatting, R2 image fetch handling, Vertex response parsing, empty-response handling, no-entry handling, and daily roundup upsert. None of those are covered.

**Fix:** Extract and test deterministic units first: prompt builder includes the required sections, `getRoundupText` handles multi-part and empty responses, date summaries honor the supplied timezone, and image-fetch conversion rejects non-200 or oversized images. Then add one fixture-based procedure test that injects canned Vertex and image responses and asserts a saved roundup.

---

### 3. Date and grouping helpers lack regression tests around local-day boundaries

| | |
|---|---|
| **Test file** | None |
| **Source file** | `app/date-format.ts`, `app/food-photo-app.tsx` |
| **Principle** | Principle 5 — Specify tests as behavioral variants |

**Finding:** `startOfDay`, `dayLabel`, `dateChip`, `dayKey`, and `dayRange` drive both gallery grouping and the day window sent to the AI roundup. These paths are not covered, despite the app already hitting a timezone-related roundup bug.

**Fix:** Add deterministic tests with fixed system time for today/yesterday/older labels, local midnight grouping, and the exact `dayKey` and `dayRange` values sent to `roundups.generate`.

---

### 4. Roundup display parsing has no component coverage

| | |
|---|---|
| **Test file** | None |
| **Source file** | `app/food-photo-app.tsx` |
| **Principle** | Principle 5 — Specify tests as behavioral variants |

**Finding:** The current UI relies on `parseRoundupText` and `roundupPreview` to turn the AI response into preview and overlay sections. The user specifically requested a short preview that opens like a photo; that behavior is not tested.

**Fix:** Extract the roundup parser/preview and overlay card into a small component or utility module, then add component tests for preview truncation, opening the overlay, closing it, rendering all six sections, and falling back to raw text when the model returns an unexpected shape.

---

## P3 — Consider

### 5. Parent-level save and delete guards are only indirectly covered

The component tests are strong for `ConfirmOverlay` and `Lightbox`, but `FoodPhotoApp` also has parent-level `saveDraftInFlight` and `deleteEntryInFlight` refs. Those backup guards are not directly exercised. This is not false confidence in the current save/delete tests; it is a remaining orchestration gap if those child components are reused or changed later.

---

## Summary

| # | Finding | Severity | Principle | File |
|---|---------|----------|-----------|------|
| 1 | Photo persistence mutations have no backend behavioral tests | P1 | 4 | `server/routers/entries.ts` |
| 2 | AI roundup orchestration is untested at the deterministic boundaries | P2 | 8 | `server/routers/roundups.ts` |
| 3 | Date and grouping helpers lack regression tests around local-day boundaries | P2 | 5 | `app/date-format.ts`, `app/food-photo-app.tsx` |
| 4 | Roundup display parsing has no component coverage | P2 | 5 | `app/food-photo-app.tsx` |
| 5 | Parent-level save and delete guards are only indirectly covered | P3 | 7 | `app/food-photo-app.tsx` |

## Verdict

The two tests added for save and delete are meaningful behavioral tests, not mock theatre. The suite is still thin where it matters most: the server-side photo persistence path and the AI roundup path. Fix `server/routers/entries.ts` first because it protects the data and storage contract; then split the roundup path into deterministic units so the AI feature can be tested without live Vertex calls.

