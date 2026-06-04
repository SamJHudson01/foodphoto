FINDING:
- Title: Production CSP allows inline scripts on private user data pages
- File: next.config.ts:22
- Principle: Principle 6: Make code transparent to analysis
- Severity: P1
- What's wrong: The production `script-src` includes `'unsafe-inline'` for every route. If any stored practice comment, item label, AI review text, Clerk-controlled markup, or future rendering regression creates an HTML injection path, the browser will execute attacker-supplied inline JavaScript instead of using CSP as the last line of defense.
- Consequence: A single XSS bug could read or mutate private food and guitar practice data through the signed-in user's session.
- Fix: Remove production `'unsafe-inline'` from `script-src` and migrate required inline scripts to nonces or hashes; if rollout risk is high, start with report-only CSP and then enforce once legitimate violations are fixed.

FINDING:
- Title: Expensive AI review mutation has no per-user rate limit
- File: server/routers/guitar-practice.ts:556
- Principle: Principle 7: Deploy assertions as tripwires
- Severity: P2
- What's wrong: `generateReview` is authenticated, but any signed-in user can repeatedly invoke it and force a Vertex `generateContent` request on every call. The day-level upsert only overwrites the saved review; it does not throttle the external API call.
- Consequence: A compromised account or automated client can burn API quota and create a denial-of-wallet path without needing access to another user's data.
- Fix: Add a server-side per-user rate limit or cooldown before the Vertex call, ideally keyed by `user.id` and `dayKey`, and return the existing recent review instead of regenerating when the limit is hit.
