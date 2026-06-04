"use client";

import { useState } from "react";
import { parsePracticeReviewText, practiceReviewPreview, type PracticeReviewSection } from "./practice-review-text";
import styles from "./page.module.css";

type PracticeReview = {
  generatedAt: Date;
  text: string;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5l1.7 5.1a4 4 0 0 0 2.5 2.5L21.5 12l-5.1 1.7a4 4 0 0 0-2.5 2.5L12 21.5l-1.7-5.1a4 4 0 0 0-2.5-2.5L2.5 12l5.1-1.7a4 4 0 0 0 2.5-2.5L12 2.5Z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" />
    </svg>
  );
}

export function PracticeReviewCard({
  dateLabel,
  isLoading,
  error,
  review,
  onGenerate
}: {
  dateLabel: string;
  isLoading: boolean;
  error: string | null;
  review: PracticeReview | undefined;
  onGenerate: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const sections = review ? parsePracticeReviewText(review.text) : [];
  const overview = sections.find((section) => section.label === "Overview")?.text ?? (review ? practiceReviewPreview(review.text, sections) : "");
  const evidence = sections.find((section) => section.label === "Practice Evidence")?.text;
  const pattern = sections.find((section) => section.label === "Pattern Read")?.text;
  const bottleneck = sections.find((section) => section.label === "Main Observation")?.text;
  const focus = sections.find((section) => section.label === "Tomorrow Focus")?.text;

  if (isLoading) {
    return (
      <div className={styles.practiceReviewCard}>
        <div className={styles.practiceReviewHead}>
          <span className={styles.practiceReviewMark}>
            <SparkIcon />
          </span>
          <span>Practice review</span>
          <span className={styles.practiceReviewDots}>•••</span>
        </div>
        <p className={styles.practiceReviewLoading}>Looking over your practice...</p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className={styles.practiceReviewTucked}>
        <button type="button" onClick={onGenerate}>
          <SparkIcon /> Generate practice review
        </button>
        {error ? <p className={styles.roundupError}>{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={styles.practiceReviewCard}>
      <div className={styles.practiceReviewHead}>
        <span className={styles.practiceReviewMark}>
          <SparkIcon />
        </span>
        <span>Practice review</span>
      </div>

      <p className={styles.practiceReviewOverview}>{overview}</p>
      {evidence || pattern ? (
        <>
          <h3 className={styles.practiceReviewSubhead}>Compared to recent days</h3>
          <ul className={styles.practiceReviewList}>
            {[evidence, pattern].filter(Boolean).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {bottleneck ? (
        <div className={styles.practiceBottleneck}>
          <TargetIcon />
          <div>
            <span>Current bottleneck</span>
            <p>{bottleneck}</p>
          </div>
        </div>
      ) : null}
      {focus ? (
        <div className={styles.practiceTomorrow}>
          <span>Tomorrow&apos;s focus</span>
          <p>{focus}</p>
        </div>
      ) : null}
      <div className={styles.practiceReviewFoot}>
        <span>Saved for {dateLabel}</span>
        <button type="button" onClick={() => setIsOpen(true)}>
          Open
        </button>
        <button type="button" onClick={onGenerate}>
          Regenerate
        </button>
      </div>
      {error ? <p className={styles.roundupError}>{error}</p> : null}
      {isOpen ? <PracticeReviewOverlay dateLabel={dateLabel} sections={sections} text={review.text} onClose={() => setIsOpen(false)} /> : null}
    </div>
  );
}

function PracticeReviewOverlay({
  dateLabel,
  sections,
  text,
  onClose
}: {
  dateLabel: string;
  sections: PracticeReviewSection[];
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
          <h2>Practice review</h2>
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
