FINDING:
- Title: Default item seeding can duplicate rows under concurrent first loads
- File: server/routers/guitar-practice.ts:260
- Principle: Async correctness; make concurrent request behavior explicit instead of relying on a check-then-create sequence.
- Severity: P2
- What's wrong: `seedDefaultItemsIfNeeded` counts existing items, then creates each default item one at a time outside a transaction or uniqueness-backed idempotent write. Two concurrent `list` calls for a new user can both observe `existingCount === 0` and both insert the default set.
- Consequence: A new user can end up with duplicate default practice items, which then changes timers, item limits, and review evidence for that account.
- Fix: Make seeding idempotent at the database boundary: add a uniqueness key for per-user default labels or seed marker, then use a transaction or `createMany` with duplicate skipping so concurrent calls converge on one default set.

FINDING:
- Title: Vertex review generation has no timeout or cancellation
- File: server/routers/guitar-practice.ts:640
- Principle: Resource management; long-running external operations need cancellation support so request lifetimes are bounded.
- Severity: P2
- What's wrong: `generateReview` awaits `fetch` to Vertex without an `AbortSignal`, timeout, or request cancellation path. If Vertex or the network stalls without closing the connection, the tRPC mutation can stay open until the platform or client eventually gives up.
- Consequence: Review generation can hang with no controlled `BAD_GATEWAY` response, tying up server work and leaving the user without a predictable failure state.
- Fix: Wrap the Vertex request in an `AbortController` with a bounded timeout, pass the signal to `fetch`, clear the timer in a `finally`, and translate aborts into the same operational `BAD_GATEWAY` path used for failed generation.
