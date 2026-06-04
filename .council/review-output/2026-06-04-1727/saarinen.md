FINDING:
- Title: Practice settings sheet can overflow past the viewport
- File: app/page.module.css:903
- Principle: Component consistency and spacing must preserve usable controls
- Severity: P2
- What's wrong: The settings sheet is fixed to full viewport height with large top and bottom padding, but the practice-item rows have no scroll container or overflow rule. With the allowed number of active practice items, the row list can push the Save/Cancel actions below the reachable viewport.
- Consequence: Users may be unable to save or cancel practice-list edits on smaller screens or with many items.
- Fix: Make the settings sheet body a constrained scrolling region and keep the actions pinned inside the visible sheet.
