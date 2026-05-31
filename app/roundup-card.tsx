"use client";

import { useState } from "react";
import { parseRoundupText, roundupPreview, type RoundupSection } from "./roundup-text";
import styles from "./page.module.css";

type StoredRoundup = {
  generatedAt: number;
  text: string;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function RoundupCard({
  dateLabel,
  isLoading,
  error,
  roundup,
  onGenerate
}: {
  dateLabel: string;
  isLoading: boolean;
  error: string | null;
  roundup: StoredRoundup | undefined;
  onGenerate: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const sections = roundup ? parseRoundupText(roundup.text) : [];
  const preview = roundup ? roundupPreview(roundup.text, sections) : "";

  return (
    <div className={styles.roundupCard}>
      <div className={styles.roundupHeader}>
        <div>
          <p className={styles.roundupEyebrow}>AI coach</p>
          <h2>Daily roundup</h2>
        </div>
        <button className={styles.roundupButton} type="button" onClick={onGenerate} disabled={isLoading}>
          {isLoading ? "Thinking..." : roundup ? "Regenerate" : "Generate"}
        </button>
      </div>

      {roundup ? (
        <>
          <button className={styles.roundupPreview} type="button" onClick={() => setIsOpen(true)}>
            <span>{preview}</span>
            <strong>Open</strong>
          </button>

          <p className={styles.roundupMeta}>Saved for {dateLabel}</p>
          {isOpen ? (
            <RoundupOverlay dateLabel={dateLabel} sections={sections} text={roundup.text} onClose={() => setIsOpen(false)} />
          ) : null}
        </>
      ) : (
        <p className={styles.roundupEmpty}>
          Generate one performance nutrition micro-adjustment from this day&apos;s photos and notes. Photos are sent to
          Vertex AI only when you tap the button.
        </p>
      )}

      {error ? <p className={styles.roundupError}>{error}</p> : null}
    </div>
  );
}

function RoundupOverlay({
  dateLabel,
  sections,
  text,
  onClose
}: {
  dateLabel: string;
  sections: RoundupSection[];
  text: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.roundupOverlay} onClick={onClose}>
      <button className={styles.lightboxClose} type="button" aria-label="Close" onClick={onClose}>
        <CloseIcon />
      </button>
      <article className={styles.roundupSheet} onClick={(event) => event.stopPropagation()}>
        <div className={styles.roundupSheetHeader}>
          <p className={styles.roundupEyebrow}>AI coach</p>
          <h2>Daily roundup</h2>
          <p>Saved for {dateLabel}</p>
        </div>
        {sections.length > 0 ? (
          <div className={styles.roundupSections}>
            {sections.map((section) => (
              <section className={styles.roundupSection} key={section.label}>
                <h3>{section.label}</h3>
                <p>{section.text}</p>
              </section>
            ))}
          </div>
        ) : (
          <p className={styles.roundupText}>{text}</p>
        )}
      </article>
    </div>
  );
}
