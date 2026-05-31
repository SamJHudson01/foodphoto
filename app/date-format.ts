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
