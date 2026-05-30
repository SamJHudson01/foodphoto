"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import { trpc } from "./trpc";

type StoredEntry = {
  id: string;
  timestamp: number;
  note: string;
  photo: Blob;
  migratedAt?: number;
};

type StoredRoundup = {
  dayTimestamp: number;
  generatedAt: number;
  text: string;
};

type FoodEntry = {
  id: string;
  timestamp: number;
  note: string;
  photoUrl: string;
};

type HostedEntry = {
  id: string;
  capturedAt: Date;
  note: string;
  publicUrl: string;
};

type HostedRoundup = {
  dayStart: Date;
  generatedAt: Date;
  text: string;
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
  roundups: {
    key: number;
    value: StoredRoundup;
  };
}

let dbPromise: Promise<IDBPDatabase<FoodPhotosDb>> | null = null;

function getDb() {
  dbPromise ??= openDB<FoodPhotosDb>("foodphotos-local", 3, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains("entries")) {
        const store = db.createObjectStore("entries", { keyPath: "id" });
        store.createIndex("by-timestamp", "timestamp");
      }

      if (oldVersion < 2 && !db.objectStoreNames.contains("roundups")) {
        db.createObjectStore("roundups", { keyPath: "dayTimestamp" });
      }
    }
  });

  return dbPromise;
}

async function listStoredEntries() {
  const db = await getDb();
  const entries = await db.getAllFromIndex("entries", "by-timestamp");
  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

async function markStoredEntryMigrated(id: string) {
  const db = await getDb();
  const entry = await db.get("entries", id);
  if (!entry) return;

  await db.put("entries", { ...entry, migratedAt: Date.now() });
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

function dayKey(dayTimestamp: number) {
  const date = new Date(dayTimestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayRange(dayTimestamp: number) {
  const start = new Date(dayTimestamp);
  const end = new Date(dayTimestamp);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read photo"));
      }
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Could not read photo")));
    reader.readAsDataURL(blob);
  });
}

async function getImageDimensions(blob: Blob) {
  if (!("createImageBitmap" in window)) return {};

  const bitmap = await createImageBitmap(blob);
  const dimensions = {
    width: bitmap.width,
    height: bitmap.height
  };
  bitmap.close();

  return dimensions;
}

function createSamplePhotoBlob(label: string, hue: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available.");

  const gradient = context.createLinearGradient(0, 0, 1000, 1000);
  gradient.addColorStop(0, `hsl(${hue} 54% 34%)`);
  gradient.addColorStop(1, `hsl(${(hue + 42) % 360} 42% 16%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1000, 1000);

  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.beginPath();
  context.ellipse(500, 540, 330, 260, -0.08, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = `hsl(${(hue + 120) % 360} 52% 48%)`;
  context.beginPath();
  context.arc(390, 510, 108, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = `hsl(${(hue + 210) % 360} 62% 58%)`;
  context.beginPath();
  context.arc(545, 470, 128, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = `hsl(${(hue + 25) % 360} 72% 55%)`;
  context.beginPath();
  context.arc(600, 625, 90, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(13, 15, 14, 0.78)";
  context.fillRect(0, 790, 1000, 210);

  context.fillStyle = "#f0ede8";
  context.font = "700 68px system-ui, -apple-system, sans-serif";
  context.textAlign = "center";
  context.fillText(label, 500, 910);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not create sample photo."));
      }
    }, "image/png");
  });
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
  const utils = trpc.useUtils();
  const entriesQuery = trpc.entries.list.useQuery(undefined, {
    retry: false
  });
  const roundupsQuery = trpc.roundups.list.useQuery(undefined, {
    retry: false
  });
  const createEntry = trpc.entries.create.useMutation({
    onSuccess: async () => {
      await utils.entries.list.invalidate();
    }
  });
  const updateNote = trpc.entries.updateNote.useMutation({
    onSuccess: async () => {
      await utils.entries.list.invalidate();
    }
  });
  const deleteEntryMutation = trpc.entries.delete.useMutation({
    onSuccess: async () => {
      await utils.entries.list.invalidate();
    }
  });
  const generateRoundupMutation = trpc.roundups.generate.useMutation({
    onSuccess: async () => {
      await utils.roundups.list.invalidate();
    }
  });

  const [screen, setScreen] = useState<"gallery" | "camera" | "confirm">("gallery");
  const [draft, setDraft] = useState<DraftEntry | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [roundupLoadingDay, setRoundupLoadingDay] = useState<number | null>(null);
  const [roundupError, setRoundupError] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState<StoredEntry[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const draftUrl = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(
    () =>
      ((entriesQuery.data ?? []) as HostedEntry[]).map((entry) => ({
        id: entry.id,
        timestamp: entry.capturedAt.getTime(),
        note: entry.note,
        photoUrl: entry.publicUrl
      })),
    [entriesQuery.data]
  );
  const groups = useMemo(() => groupByDay(entries), [entries]);
  const roundups = useMemo(
    () =>
      new Map(
        ((roundupsQuery.data ?? []) as HostedRoundup[]).map((roundup) => [
          roundup.dayStart.toISOString().slice(0, 10),
          {
            dayTimestamp: roundup.dayStart.getTime(),
            generatedAt: roundup.generatedAt.getTime(),
            text: roundup.text
          }
        ])
      ),
    [roundupsQuery.data]
  );
  const selected = useMemo(
    () => (selectedId ? entries.find((entry) => entry.id === selectedId) ?? null : null),
    [entries, selectedId]
  );
  const showSampleData = process.env.NODE_ENV !== "production";

  useEffect(() => {
    void refreshLocalMigrationCandidates();

    return () => {
      if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
    };
  }, []);

  async function refreshLocalMigrationCandidates() {
    try {
      const stored = await listStoredEntries();
      setLocalEntries(stored.filter((entry) => !entry.migratedAt));
    } catch {
      setLocalEntries([]);
    }
  }

  function openCamera() {
    setStorageError(null);
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

    try {
      const photoDataUrl = await blobToDataUrl(draft.photo);
      const dimensions = await getImageDimensions(draft.photo);
      const created = await createEntry.mutateAsync({
        capturedAt: new Date(draft.timestamp),
        note: note.trim(),
        photoDataUrl,
        ...dimensions
      });

      if (draftUrl.current) {
        URL.revokeObjectURL(draftUrl.current);
        draftUrl.current = null;
      }

      setDraft(null);
      setScreen("gallery");
      setJustAdded(created.id);
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      window.setTimeout(() => setJustAdded(null), 1200);
    } catch {
      setStorageError("That photo could not be saved.");
    }
  }

  async function saveNote(id: string, note: string) {
    await updateNote.mutateAsync({ id, note: note.trim() });
  }

  async function deleteEntry(id: string) {
    await deleteEntryMutation.mutateAsync({ id });
    setSelectedId(null);
  }

  async function generateRoundup(dayTimestamp: number) {
    const range = dayRange(dayTimestamp);

    setRoundupLoadingDay(dayTimestamp);
    setRoundupError(null);

    try {
      await generateRoundupMutation.mutateAsync({
        dayKey: dayKey(dayTimestamp),
        start: range.start,
        end: range.end,
        label: `${dayLabel(dayTimestamp)} ${dateChip(dayTimestamp)}`
      });
    } catch (error) {
      setRoundupError(error instanceof Error ? error.message : "The roundup could not be generated.");
    } finally {
      setRoundupLoadingDay(null);
    }
  }

  async function addSamplePhotos() {
    const samples = [
      { label: "Yogurt bowl", note: "Greek yogurt, berries & granola", hour: 8, minute: 12, dayOffset: 0, hue: 24 },
      { label: "Lunch bowl", note: "Chicken katsu salad bowl", hour: 13, minute: 25, dayOffset: 0, hue: 92 },
      { label: "Flat white", note: "Afternoon coffee", hour: 16, minute: 5, dayOffset: 0, hue: 205 },
      { label: "Avo toast", note: "Avo toast + poached egg", hour: 9, minute: 10, dayOffset: 1, hue: 142 }
    ];

    const created = await Promise.all(
      samples.map(async (sample, index) => {
        const timestamp = new Date();
        timestamp.setDate(timestamp.getDate() - sample.dayOffset);
        timestamp.setHours(sample.hour, sample.minute, 0, 0);
        const photo = await createSamplePhotoBlob(sample.label, sample.hue);
        const photoDataUrl = await blobToDataUrl(photo);
        const dimensions = await getImageDimensions(photo);

        return createEntry.mutateAsync({
          capturedAt: timestamp,
          note: sample.note,
          photoDataUrl,
          migrationKey: `sample-${sample.label}-${index}`,
          ...dimensions
        });
      })
    );

    setJustAdded(created[0]?.id ?? null);
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    window.setTimeout(() => setJustAdded(null), 1200);
  }

  async function migrateLocalPhotos() {
    setIsMigrating(true);
    setMigrationError(null);

    try {
      for (const entry of localEntries) {
        const photoDataUrl = await blobToDataUrl(entry.photo);
        const dimensions = await getImageDimensions(entry.photo);

        await createEntry.mutateAsync({
          capturedAt: new Date(entry.timestamp),
          note: entry.note,
          photoDataUrl,
          migrationKey: entry.id,
          ...dimensions
        });
        await markStoredEntryMigrated(entry.id);
      }

      await refreshLocalMigrationCandidates();
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : "Local photos could not be migrated.");
    } finally {
      setIsMigrating(false);
    }
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

        <div
          className={`${styles.galleryScroll} ${groups.length === 0 ? styles.galleryScrollEmpty : ""}`}
          ref={scrollRef}
        >
          {storageError || entriesQuery.error ? (
            <p className={styles.inlineError}>{storageError ?? entriesQuery.error?.message}</p>
          ) : null}

          {localEntries.length > 0 ? (
            <section className={styles.migrationBanner}>
              <div>
                <h2>{localEntries.length} local photo{localEntries.length === 1 ? "" : "s"} found</h2>
                <p>Move them into your hosted FoodPhoto account. The local copies stay untouched after upload.</p>
                {migrationError ? <span>{migrationError}</span> : null}
              </div>
              <button type="button" onClick={() => void migrateLocalPhotos()} disabled={isMigrating}>
                {isMigrating ? "Migrating..." : "Migrate"}
              </button>
            </section>
          ) : null}

          {entriesQuery.isLoading ? (
            <section className={styles.emptyState}>
              <CameraIcon />
              <h1>Loading photos</h1>
              <p>Getting your gallery ready.</p>
            </section>
          ) : groups.length === 0 ? (
            <section className={styles.emptyState}>
              <CameraIcon />
              <h1>No food photos yet</h1>
              <p>Take a photo when you eat. It saves to your FoodPhoto account.</p>
              {showSampleData ? (
                <button className={styles.sampleButton} type="button" onClick={() => void addSamplePhotos()}>
                  Add sample photos
                </button>
              ) : null}
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
                <RoundupCard
                  dateLabel={`${dayLabel(group.dayTimestamp)} ${dateChip(group.dayTimestamp)}`}
                  isLoading={roundupLoadingDay === group.dayTimestamp}
                  error={roundupError}
                  roundup={roundups.get(dayKey(group.dayTimestamp))}
                  onGenerate={() => void generateRoundup(group.dayTimestamp)}
                />
                <div className={styles.grid}>
                  {group.items.map((entry) => (
                    <button
                      className={`${styles.tile} ${entry.id === justAdded ? styles.tileNew : ""}`}
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedId(entry.id)}
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
          <Lightbox entry={selected} onClose={() => setSelectedId(null)} onDelete={deleteEntry} onSaveNote={saveNote} />
        ) : null}
      </section>
    </main>
  );
}

function RoundupCard({
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
          <p className={styles.roundupText}>{roundup.text}</p>
          <p className={styles.roundupMeta}>Saved for {dateLabel}</p>
        </>
      ) : (
        <p className={styles.roundupEmpty}>
          Generate a short reflection from this day&apos;s photos and notes. Photos are sent to OpenRouter only when
          you tap the button.
        </p>
      )}

      {error ? <p className={styles.roundupError}>{error}</p> : null}
    </div>
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
