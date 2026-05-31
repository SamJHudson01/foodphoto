import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Lightbox, type FoodEntry } from "./lightbox";

function entry(): FoodEntry {
  return {
    id: "entry-1",
    timestamp: new Date("2026-05-31T08:15:00.000Z").getTime(),
    note: "eggs after gym",
    photoUrl: "https://example.test/photo.jpg"
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe("Lightbox delete behavior", () => {
  it("moves into a deleting state immediately and disables controls that could race the deletion", async () => {
    const deletion = deferred();
    const onDelete = vi.fn(() => deletion.promise);
    const onClose = vi.fn();

    render(<Lightbox entry={entry()} onClose={onClose} onDelete={onDelete} onSaveNote={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("entry-1");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Deleting..." }).getAttribute("aria-busy")).toBe("true")
    );

    expect((screen.getByRole("button", { name: "Deleting..." }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Edit note" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);

    deletion.resolve();
  });

  it("does not call onDelete more than once under rapid repeated clicks while the first delete is unresolved", () => {
    const deletion = deferred();
    const onDelete = vi.fn(() => deletion.promise);

    render(<Lightbox entry={entry()} onClose={vi.fn()} onDelete={onDelete} onSaveNote={vi.fn()} />);

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledTimes(1);

    deletion.resolve();
  });

  it("re-enables delete after a failed deletion so the same photo can be retried once the error path settles", async () => {
    const onDelete = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("delete failed"))
      .mockResolvedValueOnce(undefined);

    render(<Lightbox entry={entry()} onClose={vi.fn()} onDelete={onDelete} onSaveNote={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy());
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledTimes(2);
  });
});
