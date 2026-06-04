FINDING:
- Title: Practice settings sheet can trap controls below the viewport
- File: app/page.module.css:903
- Principle: Design all screen states and keep actions accessible
- Severity: P2
- What's wrong: The settings overlay opens a full-height sheet but does not provide a visible scrolling region for the item list. The product supports up to 20 active items, so the list can exceed the available sheet height.
- Consequence: On mobile or smaller desktop windows, Save list and Cancel can become hard or impossible to reach, blocking the settings workflow.
- Fix: Add a scrollable middle section for rows and keep the bottom actions fixed or sticky within the sheet.
