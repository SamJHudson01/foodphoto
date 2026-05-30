"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

type StoredEntry = {
  id: string;
  timestamp: number;
  note: string;
  photo: Blob;
};

type FoodEntry = {
  id: string;
  timestamp: number;
  note: string;
  photoUrl: string;
};

type DraftEntry = {
  timestamp: number;
  photo: Blob;
  photoUrl: string;
};

interface FoodPhotosDb extends DBSchema {
  entries: {
    key: string;
    value: StoredEntry;
    indexes: {
      "by-timestamp": number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<FoodPhotosDb>> | null = null;

function getDb() {
  dbPromise ??= openDB<FoodPhotosDb>("foodphotos-local", 1, {
    upgrade(db) {
      const store = db.createObjectStore("entries", { keyPath: "id" });
      store.createIndex("by-timestamp", "timestamp");
    }
  });

  return dbPromise;
}

async function listStoredEntries() {
  const db = await getDb();
  const entries = await db.getAllFromIndex("entries", "by-timestamp");
  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

async function addStoredEntry(entry: StoredEntry) {
  const db = await getDb();
  await db.put("entries", entry);
}

async function updateStoredNote(id: string, note: string) {
  const db = await getDb();
  const entry = await db.get("entries", id);
  if (!entry) return;

  await db.put("entries", { ...entry, note });
}

async function deleteStoredEntry(id: string) {
  const db = await getDb();
  await db.delete("entries", id);
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function dayLabel(dayTimestamp: number) {
  const today = startOfDay(Date.now());
  const diff = Math.round((today - dayTimestamp) / 86_400_000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";

  return new Date(dayTimestamp).toLocaleDateString("en-GB", { weekday: "long" });
}

function dateChip(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });
}

function groupByDay(entries: FoodEntry[]) {
  const grouped = new Map<number, FoodEntry[]>();

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

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 4 16 6.5h3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3L9.5 4h5Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export default function FoodPhotoApp() {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [screen, setScreen] = useState<"gallery" | "camera" | "confirm">("gallery");
  const [draft, setDraft] = useState<DraftEntry | null>(null);
  const [selected, setSelected] = useState<FoodEntry | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const entryUrls = useRef<string[]>([]);
  const draftUrl = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupByDay(entries), [entries]);

  useEffect(() => {
    void refreshEntries();

    return () => {
      revokeEntryUrls();
      if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function revokeEntryUrls() {
    for (const url of entryUrls.current) URL.revokeObjectURL(url);
    entryUrls.current = [];
  }

  async function refreshEntries() {
    try {
      const stored = await listStoredEntries();
      const urls: string[] = [];
      const nextEntries = stored.map((entry) => {
        const photoUrl = URL.createObjectURL(entry.photo);
        urls.push(photoUrl);

        return {
          id: entry.id,
          timestamp: entry.timestamp,
          note: entry.note,
          photoUrl
        };
      });

      revokeEntryUrls();
      entryUrls.current = urls;
      setEntries(nextEntries);
      setStorageError(null);
    } catch {
      setStorageError("Local photo storage is not available in this browser.");
    }
  }

  function openCamera() {
    setScreen("camera");
  }

  function handleCapturedPhoto(photo: Blob) {
    const photoUrl = URL.createObjectURL(photo);
    if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
    draftUrl.current = photoUrl;

    setDraft({
      timestamp: Date.now(),
      photo,
      photoUrl
    });
    setScreen("confirm");
  }

  async function saveDraft(note: string) {
    if (!draft) return;

    const id = createId();

    try {
      await addStoredEntry({
        id,
        timestamp: draft.timestamp,
        note: note.trim(),
        photo: draft.photo
      });

      if (draftUrl.current) {
        URL.revokeObjectURL(draftUrl.current);
        draftUrl.current = null;
      }

      setDraft(null);
      setScreen("gallery");
      setJustAdded(id);
      await refreshEntries();
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      window.setTimeout(() => setJustAdded(null), 1200);
    } catch {
      setStorageError("That photo could not be saved locally.");
    }
  }

  async function saveNote(id: string, note: string) {
    const cleanNote = note.trim();
    await updateStoredNote(id, cleanNote);
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, note: cleanNote } : entry))
    );
    setSelected((current) => (current && current.id === id ? { ...current, note: cleanNote } : current));
  }

  async function deleteEntry(id: string) {
    await deleteStoredEntry(id);
    setSelected(null);
    await refreshEntries();
  }

  return (
    <main className={styles.appShell}>
      <section className={styles.appSurface} aria-label="FoodPhoto">
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark} />
            <span className={styles.brandName}>
              Food<span>Photo</span>
            </span>
          </div>
          <p className={styles.loggedCount}>{entries.length} logged</p>
        </header>

        <div className={styles.galleryScroll} ref={scrollRef}>
          {storageError ? <p className={styles.inlineError}>{storageError}</p> : null}

          {groups.length === 0 ? (
            <section className={styles.emptyState}>
              <CameraIcon />
              <h1>No food photos yet</h1>
              <p>Take a photo when you eat. It stays on this device.</p>
            </section>
          ) : (
            groups.map((group) => (
              <section className={styles.daySection} key={group.dayTimestamp}>
                <div className={styles.dayHeader}>
                  <span className={styles.dayLabel}>{dayLabel(group.dayTimestamp)}</span>
                  <span className={styles.dayDate}>{dateChip(group.dayTimestamp)}</span>
                  <span className={styles.dayCount}>
                    {group.items.length} {group.items.length === 1 ? "photo" : "photos"}
                  </span>
                </div>
                <div className={styles.grid}>
                  {group.items.map((entry) => (
                    <button
                      className={`${styles.tile} ${entry.id === justAdded ? styles.tileNew : ""}`}
                      key={entry.id}
                      type="button"
                      onClick={() => setSelected(entry)}
                    >
                      <img src={entry.photoUrl} alt={entry.note || "Food photo"} />
                      <span className={styles.tileTime}>{formatTime(entry.timestamp)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
          {groups.length > 0 ? <div className={styles.scrollPad} /> : null}
        </div>

        <button className={styles.fab} type="button" aria-label="Take a photo" onClick={openCamera}>
          <CameraIcon />
        </button>

        {screen === "camera" ? (
          <CameraOverlay onCancel={() => setScreen("gallery")} onCapture={handleCapturedPhoto} />
        ) : null}

        {screen === "confirm" && draft ? (
          <ConfirmOverlay draft={draft} onRetake={() => setScreen("camera")} onSave={saveDraft} />
        ) : null}

        {selected ? (
          <Lightbox entry={selected} onClose={() => setSelected(null)} onDelete={deleteEntry} onSaveNote={saveNote} />
        ) : null}
      </section>
    </main>
  );
}

function CameraOverlay({
  onCancel,
  onCapture
}: {
  onCancel: () => void;
  onCapture: (photo: Blob) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [message, setMessage] = useState("Starting camera...");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setMessage("Camera capture is not available in this browser.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" }
          },
          audio: false
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStatus("ready");
        setMessage("");
      } catch {
        setStatus("error");
        setMessage("Camera permission was denied or no camera is available.");
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setStatus("error");
      setMessage("The camera is not ready yet.");
      return;
    }

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.86);
    });

    if (!blob) {
      setStatus("error");
      setMessage("The photo could not be captured.");
      return;
    }

    window.setTimeout(() => onCapture(blob), 180);
  }

  return (
    <div className={styles.camera}>
      <div className={styles.cameraView}>
        <video ref={videoRef} className={styles.cameraVideo} playsInline muted autoPlay />
        {status !== "ready" ? <p className={styles.cameraMessage}>{message}</p> : null}
        <div className={styles.cameraGrid} />
        <div className={`${styles.cameraBracket} ${styles.cameraBracketTl}`} />
        <div className={`${styles.cameraBracket} ${styles.cameraBracketTr}`} />
        <div className={`${styles.cameraBracket} ${styles.cameraBracketBl}`} />
        <div className={`${styles.cameraBracket} ${styles.cameraBracketBr}`} />
        <p className={styles.cameraHint}>Point at your meal</p>
        {flash ? <div className={styles.cameraFlash} /> : null}
      </div>
      <canvas ref={canvasRef} className={styles.captureCanvas} />
      <div className={styles.cameraBar}>
        <button className={styles.cameraCancel} type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={styles.shutter}
          type="button"
          aria-label="Take photo"
          onClick={captureFrame}
          disabled={status !== "ready"}
        >
          <span />
        </button>
        <span className={styles.cameraSpacer} />
      </div>
    </div>
  );
}

function ConfirmOverlay({
  draft,
  onRetake,
  onSave
}: {
  draft: DraftEntry;
  onRetake: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState("");

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
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className={styles.confirmActions}>
        <button className={styles.ghostButton} type="button" onClick={onRetake}>
          Retake
        </button>
        <button className={styles.primaryButton} type="button" onClick={() => onSave(note)}>
          Save
        </button>
      </div>
    </div>
  );
}

function Lightbox({
  entry,
  onClose,
  onDelete,
  onSaveNote
}: {
  entry: FoodEntry;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSaveNote: (id: string, note: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [note, setNote] = useState(entry.note);

  async function save() {
    await onSaveNote(entry.id, note);
    setIsEditing(false);
  }

  return (
    <div className={styles.lightbox} onClick={onClose}>
      <button className={styles.lightboxClose} type="button" aria-label="Close" onClick={onClose}>
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
                onChange={(event) => setNote(event.target.value)}
              />
              <div className={styles.lightboxActions}>
                <button className={styles.ghostButton} type="button" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button className={styles.primaryButton} type="button" onClick={save}>
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
                <button className={styles.ghostButton} type="button" onClick={() => setIsEditing(true)}>
                  Edit note
                </button>
                <button className={styles.deleteButton} type="button" onClick={() => onDelete(entry.id)}>
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
