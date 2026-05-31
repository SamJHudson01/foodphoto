"use client";

import { useRef, useState } from "react";
import { formatTime } from "./date-format";
import styles from "./page.module.css";

export type DraftEntry = {
  timestamp: number;
  photo: Blob;
  photoUrl: string;
};

export function ConfirmOverlay({
  draft,
  onRetake,
  onSave
}: {
  draft: DraftEntry;
  onRetake: () => void;
  onSave: (note: string) => Promise<void> | void;
}) {
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlight = useRef(false);

  async function handleSave() {
    if (saveInFlight.current) return;

    saveInFlight.current = true;
    setIsSaving(true);

    try {
      await onSave(note);
    } catch {
      // The parent owns the visible save error; the confirm view owns retry state.
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.confirm}>
      <div className={styles.confirmScroll}>
        <img className={styles.confirmPhoto} src={draft.photoUrl} alt="Captured meal" />
        <div className={styles.confirmWhen}>
          <span>Today</span>
          <span>{formatTime(draft.timestamp)}</span>
        </div>
        <label className={styles.noteLabel} htmlFor="entry-note">
          Note <span>optional</span>
        </label>
        <textarea
          id="entry-note"
          className={styles.noteInput}
          rows={3}
          maxLength={140}
          placeholder="What is it? How was it?"
          value={note}
          disabled={isSaving}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className={styles.confirmActions}>
        <button className={styles.ghostButton} type="button" onClick={onRetake} disabled={isSaving}>
          Retake
        </button>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          aria-busy={isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
