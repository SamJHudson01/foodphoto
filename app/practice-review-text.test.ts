import { describe, expect, it } from "vitest";
import { parsePracticeReviewText, practiceReviewPreview } from "./practice-review-text";

describe("practice review text parsing", () => {
  it("extracts guitar review labels and builds an overview preview", () => {
    const text = `Overview: Today confirms the technique avoidance pattern.
Practice Evidence: Warm-up was completed. Technique was skipped.
Pattern Read: Previous days show the same split.
Main Observation: The bottleneck is the avoided item.
Tomorrow Focus: Start with five minutes of technique.
Standard: Touch the hard thing first.`;

    const sections = parsePracticeReviewText(text);

    expect(sections).toEqual([
      { label: "Overview", text: "Today confirms the technique avoidance pattern." },
      { label: "Practice Evidence", text: "Warm-up was completed. Technique was skipped." },
      { label: "Pattern Read", text: "Previous days show the same split." },
      { label: "Main Observation", text: "The bottleneck is the avoided item." },
      { label: "Tomorrow Focus", text: "Start with five minutes of technique." },
      { label: "Standard", text: "Touch the hard thing first." }
    ]);
    expect(practiceReviewPreview(text, sections)).toBe("Today confirms the technique avoidance pattern.");
  });
});
