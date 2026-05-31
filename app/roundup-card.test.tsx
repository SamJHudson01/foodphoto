import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoundupCard } from "./roundup-card";

const roundupText = `Overview: You logged a coherent day with several useful anchors.
Meals:
- Breakfast: Eggs and oats, a clear protein anchor.
- Lunch: Chicken salad, a colourful produce footprint.
Rundown:
- Strength: Protein appeared early.
- Produce Footprint: Lunch carried the strongest colour.
Observations: I noticed breakfast and lunch carried most of the structure.
Experiment: Would you be open to adding fruit after dinner?
Identity: Repeating the small anchor builds consistency.`;

describe("AI coach roundup card behavior", () => {
  it("shows an empty state and calls generate from the button", () => {
    const onGenerate = vi.fn();

    render(<RoundupCard dateLabel="Today 31 May" isLoading={false} error={null} roundup={undefined} onGenerate={onGenerate} />);

    expect(screen.queryByText(/photos are sent to vertex ai only when you tap the button/i)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("disables generation and shows the in-flight label while the coach is thinking", () => {
    render(<RoundupCard dateLabel="Today 31 May" isLoading={true} error={null} roundup={undefined} onGenerate={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Thinking..." }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("keeps the roundup compact until the preview is opened like a photo", () => {
    render(
      <RoundupCard
        dateLabel="Today 31 May"
        isLoading={false}
        error={null}
        roundup={{ generatedAt: new Date("2026-05-31T11:00:00.000Z").getTime(), text: roundupText }}
        onGenerate={vi.fn()}
      />
    );

    expect(screen.queryByText("You logged a coherent day with several useful anchors.")).not.toBeNull();
    expect(screen.queryByText("Meals")).toBeNull();
    expect(screen.queryByText(/Breakfast: Eggs and oats/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /you logged a coherent day/i }));

    const dialog = screen.getByRole("article");
    expect(within(dialog).queryByRole("heading", { name: "Meals" })).not.toBeNull();
    expect(within(dialog).queryByText(/Breakfast: Eggs and oats, a clear protein anchor/)).not.toBeNull();
    expect(within(dialog).queryByRole("heading", { name: "Rundown" })).not.toBeNull();
    expect(within(dialog).queryByText(/Would you be open to adding fruit after dinner/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText(/Breakfast: Eggs and oats/)).toBeNull();
  });

  it("shows the raw coach text in the overlay if the model returns an unexpected shape", () => {
    render(
      <RoundupCard
        dateLabel="Today 31 May"
        isLoading={false}
        error={null}
        roundup={{
          generatedAt: new Date("2026-05-31T11:00:00.000Z").getTime(),
          text: "Malformed but still useful coach response."
        }}
        onGenerate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /malformed but still useful/i }));

    expect(screen.getAllByText("Malformed but still useful coach response.")).toHaveLength(2);
  });

  it("surfaces generation errors without hiding the retry action", () => {
    render(
      <RoundupCard
        dateLabel="Today 31 May"
        isLoading={false}
        error="Vertex AI request failed."
        roundup={undefined}
        onGenerate={vi.fn()}
      />
    );

    expect(screen.queryByText("Vertex AI request failed.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeNull();
  });
});
