import { describe, expect, it } from "vitest";
import { parseRoundupText, roundupPreview } from "./roundup-text";

const fullRoundup = `Overview: You logged a coherent day with several useful anchors.
Meals:
- Breakfast: Eggs and oats, a clear protein anchor.
- Lunch: Chicken salad, a colourful produce footprint.
Rundown:
- Strength: Protein appeared early.
- Produce Footprint: Lunch carried the strongest colour.
Observations: I noticed breakfast and lunch carried most of the structure.
Experiment: Would you be open to adding fruit after dinner?
Identity: Repeating the small anchor builds consistency.`;

describe("roundup text parsing", () => {
  it("extracts the six coach sections without losing bullet content", () => {
    const sections = parseRoundupText(fullRoundup);

    expect(sections).toEqual([
      { label: "Overview", text: "You logged a coherent day with several useful anchors." },
      {
        label: "Meals",
        text: "- Breakfast: Eggs and oats, a clear protein anchor.\n- Lunch: Chicken salad, a colourful produce footprint."
      },
      {
        label: "Rundown",
        text: "- Strength: Protein appeared early.\n- Produce Footprint: Lunch carried the strongest colour."
      },
      { label: "Observations", text: "I noticed breakfast and lunch carried most of the structure." },
      { label: "Experiment", text: "Would you be open to adding fruit after dinner?" },
      { label: "Identity", text: "Repeating the small anchor builds consistency." }
    ]);
  });

  it("uses the Overview section as the compact preview", () => {
    const sections = parseRoundupText(fullRoundup);

    expect(roundupPreview(fullRoundup, sections)).toBe("You logged a coherent day with several useful anchors.");
  });

  it("truncates long previews at a stable readable boundary", () => {
    const text = `Overview: ${"A".repeat(130)}
Meals:
- Breakfast: Test.`;
    const preview = roundupPreview(text, parseRoundupText(text));

    expect(preview).toHaveLength(120);
    expect(preview.endsWith("...")).toBe(true);
  });

  it("falls back to raw text when the model ignores the requested section shape", () => {
    const raw = "A useful but malformed coach response.";

    expect(parseRoundupText(raw)).toEqual([]);
    expect(roundupPreview(raw, [])).toBe(raw);
  });
});
