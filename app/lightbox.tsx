"use client";

import { useRef, useState } from "react";
import { dateChip, dayLabel, formatTime, startOfDay } from "./date-format";
import styles from "./page.module.css";

export type FoodEntry = {
  id: string;
  timestamp: number;
  note: string;
  photoUrl: string;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function Lightbox({
  entry,
  onClose,
  onDelete,
  onSaveNote
}: {
  entry: FoodEntry;
  onClose: () => void;
  onDelete: (id: string) => Promise<void> | void;
  onSaveNote: (id: string, note: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [note, setNote] = useState(entry.note);
  const deleteInFlight = useRef(false);

  async function save() {
    await onSaveNote(entry.id, note);
    setIsEditing(false);
  }

  async function deleteEntry() {
    if (deleteInFlight.current) return;

    deleteInFlight.current = true;
    setIsDeleting(true);

    try {
      await onDelete(entry.id);
    } catch {
      deleteInFlight.current = false;
      setIsDeleting(false);
    }
  }

  return (
    <div className={styles.lightbox} onClick={isDeleting ? undefined : onClose}>
      <button className={styles.lightboxClose} type="button" aria-label="Close" onClick={onClose} disabled={isDeleting}>
        <CloseIcon />
      </button>
      <div className={styles.lightboxStage} onClick={(event) => event.stopPropagation()}>
        <img src={entry.photoUrl} alt={entry.note || "Food photo"} />
        <div className={styles.lightboxMeta}>
          {isEditing ? (
            <>
              <label className={styles.noteLabel} htmlFor="edit-note">
                Note
              </label>
              <textarea
                id="edit-note"
                className={styles.noteInput}
                rows={3}
                maxLength={140}
                value={note}
                disabled={isDeleting}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className={styles.lightboxActions}>
                <button className={styles.ghostButton} type="button" onClick={() => setIsEditing(false)} disabled={isDeleting}>
                  Cancel
                </button>
                <button className={styles.primaryButton} type="button" onClick={() => void save()} disabled={isDeleting}>
                  Save note
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={`${styles.lightboxNote} ${entry.note ? "" : styles.lightboxNoteEmpty}`}>
                {entry.note || "No note added"}
              </p>
              <p className={styles.lightboxTime}>
                {dayLabel(startOfDay(entry.timestamp))} | {dateChip(entry.timestamp)} | {formatTime(entry.timestamp)}
              </p>
              <div className={styles.lightboxActions}>
                <button
                  className={styles.ghostButton}
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={isDeleting}
                >
                  Edit note
                </button>
                <button
                  className={styles.deleteButton}
                  type="button"
                  onClick={() => void deleteEntry()}
                  disabled={isDeleting}
                  aria-busy={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
