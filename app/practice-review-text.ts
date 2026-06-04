export type PracticeReviewSection = {
  label: "Overview" | "Practice Evidence" | "Pattern Read" | "Main Observation" | "Tomorrow Focus" | "Standard";
  text: string;
};

const labels: PracticeReviewSection["label"][] = [
  "Overview",
  "Practice Evidence",
  "Pattern Read",
  "Main Observation",
  "Tomorrow Focus",
  "Standard"
];

export function parsePracticeReviewText(text: string): PracticeReviewSection[] {
  const sections: PracticeReviewSection[] = [];

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    const nextLabel = labels[index + 1];
    const start = text.indexOf(`${label}:`);

    if (start === -1) continue;

    const contentStart = start + label.length + 1;
    const end = nextLabel ? text.indexOf(`${nextLabel}:`, contentStart) : text.length;
    const sectionText = text.slice(contentStart, end === -1 ? text.length : end).trim();

    if (sectionText) {
      sections.push({ label, text: sectionText });
    }
  }

  return sections;
}

export function practiceReviewPreview(text: string, sections: PracticeReviewSection[]) {
  const overview = sections.find((section) => section.label === "Overview")?.text ?? text;
  const clean = overview.replace(/\s+/g, " ").trim();

  if (clean.length <= 120) return clean;

  return `${clean.slice(0, 117).trim()}...`;
}
