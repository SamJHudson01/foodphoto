export type DayGroup<T extends { timestamp: number }> = {
  dayTimestamp: number;
  items: T[];
};

export function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

export function dayLabel(dayTimestamp: number) {
  const today = startOfDay(Date.now());
  const diff = Math.round((today - dayTimestamp) / 86_400_000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";

  return new Date(dayTimestamp).toLocaleDateString("en-GB", { weekday: "long" });
}

export function dateChip(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });
}

export function dayKey(dayTimestamp: number) {
  const date = new Date(dayTimestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dayRange(dayTimestamp: number) {
  const start = new Date(dayTimestamp);
  const end = new Date(dayTimestamp);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export function groupEntriesByDay<T extends { timestamp: number }>(entries: T[]): DayGroup<T>[] {
  const grouped = new Map<number, T[]>();

  for (const entry of entries) {
    const key = startOfDay(entry.timestamp);
    const items = grouped.get(key) ?? [];
    items.push(entry);
    grouped.set(key, items);
  }

  return [...grouped.entries()].map(([dayTimestamp, items]) => ({
    dayTimestamp,
    items
  }));
}
