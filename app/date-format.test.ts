import { afterEach, describe, expect, it, vi } from "vitest";
import { dateChip, dayKey, dayLabel, dayRange, formatTime, groupEntriesByDay, startOfDay } from "./date-format";

afterEach(() => {
  vi.useRealTimers();
});

describe("local date and grouping behavior", () => {
  it("labels today, yesterday, and older days from local day starts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 31, 12, 0, 0));

    expect(dayLabel(startOfDay(new Date(2026, 4, 31, 8, 15).getTime()))).toBe("Today");
    expect(dayLabel(startOfDay(new Date(2026, 4, 30, 22, 45).getTime()))).toBe("Yesterday");
    expect(dayLabel(startOfDay(new Date(2026, 4, 29, 9, 30).getTime()))).toBe("Friday");
  });

  it("formats display time and date chips with the app's UK-style presentation", () => {
    const timestamp = new Date(2026, 4, 31, 20, 5).getTime();

    expect(formatTime(timestamp)).toBe("8:05 pm");
    expect(dateChip(timestamp)).toBe("31 May");
  });

  it("creates local day keys and ranges for the roundup request", () => {
    const dayTimestamp = startOfDay(new Date(2026, 4, 31, 8, 15).getTime());
    const range = dayRange(dayTimestamp);

    expect(dayKey(dayTimestamp)).toBe("2026-05-31");
    expect(range.start.getTime()).toBe(new Date(2026, 4, 31, 0, 0, 0, 0).getTime());
    expect(range.end.getTime()).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).getTime());
  });

  it("groups entries by local calendar day without reordering entries inside a day", () => {
    const breakfast = { id: "breakfast", timestamp: new Date(2026, 4, 31, 8, 15).getTime() };
    const dinner = { id: "dinner", timestamp: new Date(2026, 4, 31, 20, 5).getTime() };
    const yesterday = { id: "yesterday", timestamp: new Date(2026, 4, 30, 22, 45).getTime() };

    const groups = groupEntriesByDay([dinner, breakfast, yesterday]);

    expect(groups).toEqual([
      {
        dayTimestamp: startOfDay(dinner.timestamp),
        items: [dinner, breakfast]
      },
      {
        dayTimestamp: startOfDay(yesterday.timestamp),
        items: [yesterday]
      }
    ]);
  });
});
