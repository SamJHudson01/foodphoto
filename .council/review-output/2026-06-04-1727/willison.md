FINDING:
- Title: Generated reviews are stored without validating the required structure
- File: server/routers/guitar-practice.ts:681
- Principle: Structured output works until it doesn't — validate after generation
- Severity: P2
- What's wrong: `generateReview` only checks that Vertex returned non-empty text before upserting the review. The prompt requires six labeled sections, but malformed output, missing labels, markdown headings, or a refusal-style response will still be persisted.
- Consequence: A bad model response becomes durable review history and later prompt context, so one malformed review can degrade the current UI and poison future review generation.
- Fix: Validate the generated text against the required labels and minimum section content before `guitarPracticeReview.upsert`; reject or retry responses that do not satisfy the contract.

FINDING:
- Title: Review generation can persist truncated model output
- File: server/routers/guitar-practice.ts:654
- Principle: Treat the chain as a system — validate at every boundary
- Severity: P2
- What's wrong: The Vertex request sets `maxOutputTokens: 2048`, then accepts any non-empty response without rejecting `finishReason` values that indicate truncation or incomplete generation. This also conflicts with the project LLM policy in `quality-llm.md` that output token caps should not be used for this project.
- Consequence: If the provider stops on the token cap, the app can save an incomplete review with missing trailing sections, and the parser will silently omit those sections when displaying it.
- Fix: Remove the artificial output token cap and treat non-successful completion reasons as failed generations before storing the review.

FINDING:
- Title: Tests lock in acceptance of incomplete review output
- File: server/routers/guitar-practice.test.ts:549
- Principle: Build evals or accept that you're guessing
- Severity: P2
- What's wrong: The mocked Vertex response contains only `Overview` and `Standard`, and the test asserts that this partial output is accepted and persisted. There is no regression test for all required sections, malformed labels, or truncated finish reasons.
- Consequence: The suite will pass while the production pipeline stores outputs that violate the prompt contract and break downstream review parsing.
- Fix: Change the happy-path mock to include every required section, then add negative tests proving missing labels and truncation finish reasons are rejected before persistence.
