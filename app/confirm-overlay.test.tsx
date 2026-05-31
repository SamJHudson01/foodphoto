import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmOverlay, type DraftEntry } from "./confirm-overlay";

function draft(): DraftEntry {
  return {
    timestamp: new Date("2026-05-31T08:15:00.000Z").getTime(),
    photo: new Blob(["photo"], { type: "image/jpeg" }),
    photoUrl: "blob:test-photo"
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe("ConfirmOverlay save behavior", () => {
  it("moves into a saving state immediately and disables every escape hatch that could duplicate the upload", async () => {
    const save = deferred();
    const onSave = vi.fn(() => save.promise);
    const onRetake = vi.fn();

    render(<ConfirmOverlay draft={draft()} onRetake={onRetake} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "eggs after gym" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("eggs after gym");

    await waitFor(() => expect(screen.getByRole("button", { name: "Saving..." }).getAttribute("aria-busy")).toBe("true"));

    expect((screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Retake" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/note/i) as HTMLTextAreaElement).disabled).toBe(true);

    save.resolve();
  });

  it("does not call onSave more than once under rapid repeated clicks while the first save is still unresolved", () => {
    const save = deferred();
    const onSave = vi.fn(() => save.promise);

    render(<ConfirmOverlay draft={draft()} onRetake={vi.fn()} onSave={onSave} />);

    const saveButton = screen.getByRole("button", { name: "Save" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);

    save.resolve();
  });

  it("re-enables saving after a failed upload so the same draft can be retried once the error path settles", async () => {
    const onSave = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("upload failed"))
      .mockResolvedValueOnce(undefined);

    render(<ConfirmOverlay draft={draft()} onRetake={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeTruthy());
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(2);
  });
});
