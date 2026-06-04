"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dateChip, dayKey, dayLabel, startOfDay } from "./date-format";
import styles from "./page.module.css";
import { PracticeReviewCard } from "./practice-review-card";
import { trpc } from "./trpc";

type PracticeItem = {
  id: string;
  label: string;
  defaultPlannedSeconds: number;
  sortOrder: number;
  archivedAt: Date | null;
};

type PracticeLog = {
  id: string;
  practiceItemId: string;
  itemLabelSnapshot: string;
  plannedSeconds: number;
  elapsedSeconds: number;
  completed: boolean;
};

type PracticeDay = {
  id: string;
  practiceDate: Date;
  comment: string;
  updatedAt: Date;
  itemLogs: PracticeLog[];
};

type PracticeReview = {
  dayStart: Date;
  generatedAt: Date;
  text: string;
};

type PracticeDraft = {
  plannedSeconds: number;
  elapsedSeconds: number;
  completed: boolean;
};

type SettingsDraft = {
  label: string;
  plannedMinutes: string;
};

type PendingSettingsItem = SettingsDraft & {
  id: string;
};

function todayDayKey() {
  return dayKey(startOfDay(Date.now()));
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;

  if (minutes === 0) return `${remainder}s`;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}

function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function secondsFromMinutes(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(60, Math.min(4 * 60 * 60, Math.round(parsed * 60)));
}

function practiceDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDraft(items: PracticeItem[], today: PracticeDay | undefined) {
  const logs = new Map((today?.itemLogs ?? []).map((log) => [log.practiceItemId, log]));

  return Object.fromEntries(
    items.map((item) => {
      const log = logs.get(item.id);
      return [
        item.id,
        {
          plannedSeconds: log?.plannedSeconds ?? item.defaultPlannedSeconds,
          elapsedSeconds: log?.elapsedSeconds ?? 0,
          completed: log?.completed ?? false
        }
      ];
    })
  ) as Record<string, PracticeDraft>;
}

function buildSettingsDrafts(items: PracticeItem[]) {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        label: item.label === "New item" ? "" : item.label,
        plannedMinutes: String(Math.round(item.defaultPlannedSeconds / 60))
      }
    ])
  ) as Record<string, SettingsDraft>;
}

function GuitarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7c0-2.5 3-4 7-4s7 1.5 7 4c0 5-5 14-7 14S5 12 5 7Z" />
      <path d="M12 8.5v9" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87.81 1.7 1.7 0 0 0-1.18 1.56V22a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.5 20.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0-.34-2.87 1.7 1.7 0 0 0-1.56-1.18H2a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 3.7 8.5a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H8a1.7 1.7 0 0 0 1-1.56V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8a1.7 1.7 0 0 0 1.56 1h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
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

export default function GuitarPracticeApp() {
  const utils = trpc.useUtils();
  const listQuery = trpc.guitarPractice.list.useQuery(undefined, {
    retry: false
  });
  const saveItemTimeMutation = trpc.guitarPractice.saveItemTime.useMutation({
    onSuccess: async () => {
      await utils.guitarPractice.list.invalidate();
    }
  });
  const saveDayMutation = trpc.guitarPractice.upsertDay.useMutation({
    onSuccess: async () => {
      await utils.guitarPractice.list.invalidate();
    }
  });
  const clearDayMutation = trpc.guitarPractice.clearDay.useMutation({
    onSuccess: async () => {
      await utils.guitarPractice.list.invalidate();
    }
  });
  const generateReviewMutation = trpc.guitarPractice.generateReview.useMutation({
    onSuccess: async () => {
      await utils.guitarPractice.list.invalidate();
    }
  });
  const createItemMutation = trpc.guitarPractice.createItem.useMutation({
    onSuccess: async () => {
      await utils.guitarPractice.list.invalidate();
    }
  });
  const updateItemMutation = trpc.guitarPractice.updateItem.useMutation({
    onSuccess: async () => {
      await utils.guitarPractice.list.invalidate();
    }
  });
  const archiveItemMutation = trpc.guitarPractice.archiveItem.useMutation({
    onSuccess: async () => {
      await utils.guitarPractice.list.invalidate();
    }
  });

  const data = listQuery.data as
    | {
        items: PracticeItem[];
        days: PracticeDay[];
        reviews: PracticeReview[];
      }
    | undefined;
  const items = data?.items ?? [];
  const days = data?.days ?? [];
  const reviews = data?.reviews ?? [];
  const todayKey = todayDayKey();
  const todayTimestamp = startOfDay(Date.now());
  const today = days.find((day) => practiceDateKey(day.practiceDate) === todayKey);
  const todayReview = reviews.find((review) => practiceDateKey(review.dayStart) === todayKey);
  const reviewByDay = useMemo(() => new Map(reviews.map((review) => [practiceDateKey(review.dayStart), review])), [reviews]);

  const [draft, setDraft] = useState<Record<string, PracticeDraft>>({});
  const [comment, setComment] = useState("");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeStartedAt, setActiveStartedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDrafts, setSettingsDrafts] = useState<Record<string, SettingsDraft>>({});
  const [pendingSettingsItems, setPendingSettingsItems] = useState<PendingSettingsItem[]>([]);
  const [commentDirty, setCommentDirty] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const hydratedKey = useRef<string | null>(null);
  const itemSaveQueues = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    if (!data || activeItemId) return;

    const key = `${todayKey}:${items.map((item) => item.id).join(",")}:${today?.id ?? "none"}`;
    if (hydratedKey.current === key) return;

    setDraft(buildDraft(items, today));
    if (!commentDirty) setComment(today?.comment ?? "");
    if (!settingsOpen && !settingsDirty) setSettingsDrafts(buildSettingsDrafts(items));
    hydratedKey.current = key;
  }, [activeItemId, commentDirty, data, items, settingsDirty, settingsOpen, today, todayKey]);

  useEffect(() => {
    if (!activeItemId) return;

    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeItemId]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && activeItemId) {
        void pauseTimer(activeItemId);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  function displayElapsed(itemId: string) {
    const current = draft[itemId]?.elapsedSeconds ?? 0;
    if (itemId !== activeItemId || !activeStartedAt) return current;
    return current + Math.floor((tick - activeStartedAt) / 1000);
  }

  async function persistItem(itemId: string, nextDraft: PracticeDraft) {
    const previousSave = itemSaveQueues.current.get(itemId) ?? Promise.resolve();
    const nextSave = previousSave
      .catch(() => undefined)
      .then(async () => {
        setSaveError(null);
      await saveItemTimeMutation.mutateAsync({
        dayKey: todayKey,
        itemId,
        plannedSeconds: nextDraft.plannedSeconds,
        elapsedSeconds: nextDraft.elapsedSeconds,
        completed: nextDraft.completed
      });
      });

    itemSaveQueues.current.set(itemId, nextSave);

    try {
      await nextSave;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Practice time could not be saved.");
    } finally {
      if (itemSaveQueues.current.get(itemId) === nextSave) {
        itemSaveQueues.current.delete(itemId);
      }
    }
  }

  async function startTimer(itemId: string) {
    if (activeItemId && activeItemId !== itemId) {
      await logTimer(activeItemId);
    }

    setActiveItemId(itemId);
    setActiveStartedAt(Date.now());
    setTick(Date.now());
  }

  async function pauseTimer(itemId: string) {
    const elapsed = displayElapsed(itemId);
    const nextDraft = {
      ...(draft[itemId] ?? { plannedSeconds: 600, elapsedSeconds: 0, completed: false }),
      elapsedSeconds: elapsed
    };

    setDraft((current) => ({ ...current, [itemId]: nextDraft }));
    setActiveItemId(null);
    setActiveStartedAt(null);
    await persistItem(itemId, nextDraft);
  }

  function toggleTimerPause() {
    if (!activeItemId) return;

    if (!activeStartedAt) {
      setActiveStartedAt(Date.now());
      setTick(Date.now());
      return;
    }

    const elapsed = displayElapsed(activeItemId);
    setDraft((current) => ({
      ...current,
      [activeItemId]: {
        ...(current[activeItemId] ?? { plannedSeconds: 600, elapsedSeconds: 0, completed: false }),
        elapsedSeconds: elapsed
      }
    }));
    setActiveStartedAt(null);
  }

  async function logTimer(itemId: string) {
    const elapsed = displayElapsed(itemId);
    const current = draft[itemId] ?? { plannedSeconds: 600, elapsedSeconds: 0, completed: false };
    const nextDraft = {
      ...current,
      elapsedSeconds: elapsed,
      completed: elapsed >= current.plannedSeconds
    };

    setDraft((items) => ({ ...items, [itemId]: nextDraft }));
    setActiveItemId(null);
    setActiveStartedAt(null);
    await persistItem(itemId, nextDraft);
  }

  function cancelTimer() {
    setActiveItemId(null);
    setActiveStartedAt(null);
  }

  async function resetItem(itemId: string) {
    const nextDraft = {
      ...(draft[itemId] ?? { plannedSeconds: 600, elapsedSeconds: 0, completed: false }),
      elapsedSeconds: 0,
      completed: false
    };

    setDraft((current) => ({ ...current, [itemId]: nextDraft }));
    if (activeItemId === itemId) {
      setActiveItemId(null);
      setActiveStartedAt(null);
    }
    await persistItem(itemId, nextDraft);
  }

  async function updateElapsed(itemId: string, minutes: string) {
    const nextDraft = {
      ...(draft[itemId] ?? { plannedSeconds: 600, elapsedSeconds: 0, completed: false }),
      elapsedSeconds: secondsFromMinutes(minutes, draft[itemId]?.elapsedSeconds ?? 0)
    };

    setDraft((current) => ({ ...current, [itemId]: nextDraft }));
    await persistItem(itemId, nextDraft);
  }

  async function toggleComplete(itemId: string, completed: boolean) {
    const elapsed = displayElapsed(itemId);
    const nextDraft = {
      ...(draft[itemId] ?? { plannedSeconds: 600, elapsedSeconds: 0, completed: false }),
      elapsedSeconds: elapsed,
      completed
    };

    setDraft((current) => ({ ...current, [itemId]: nextDraft }));
    await persistItem(itemId, nextDraft);
  }

  async function saveDay() {
    setSaveError(null);

    try {
      await saveDayMutation.mutateAsync({
        dayKey: todayKey,
        comment,
        itemLogs: items.map((item) => ({
          itemId: item.id,
          plannedSeconds: draft[item.id]?.plannedSeconds ?? item.defaultPlannedSeconds,
          elapsedSeconds: displayElapsed(item.id),
          completed: draft[item.id]?.completed ?? false
        }))
      });
      setCommentDirty(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Practice day could not be saved.");
    }
  }

  async function generateReview() {
    setReviewError(null);

    try {
      await generateReviewMutation.mutateAsync({
        dayKey: todayKey,
        label: `${dayLabel(todayTimestamp)} ${dateChip(todayTimestamp)}`
      });
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Practice review could not be generated.");
    }
  }

  function addItemDraft() {
    setSettingsDirty(true);
    setPendingSettingsItems((current) => [
      ...current,
      {
        id: `new-${Date.now()}-${current.length}`,
        label: "",
        plannedMinutes: "5"
      }
    ]);
  }

  async function saveItemSettings(item: PracticeItem, sortOrder = item.sortOrder) {
    const settings = settingsDrafts[item.id];
    if (!settings) return;

    await updateItemMutation.mutateAsync({
      id: item.id,
      label: settings.label.trim(),
      defaultPlannedSeconds: secondsFromMinutes(settings.plannedMinutes, item.defaultPlannedSeconds),
      sortOrder
    });
  }

  async function saveSettings() {
    setSettingsError(null);
    setSettingsSaving(true);

    try {
      for (const item of items) {
        const settings = settingsDrafts[item.id];
        if (!settings) continue;
        if (!settings.label.trim()) {
          throw new Error("Practice item labels cannot be blank.");
        }
        await saveItemSettings(item);
      }

      for (const item of pendingSettingsItems) {
        const label = item.label.trim();
        if (!label) continue;

        await createItemMutation.mutateAsync({
          label,
          defaultPlannedSeconds: secondsFromMinutes(item.plannedMinutes, 300),
          sortOrder: items.length + pendingSettingsItems.indexOf(item)
        });
      }
      setPendingSettingsItems([]);
      setSettingsDirty(false);
      setSettingsOpen(false);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Practice list could not be saved.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function archiveSettingsItem(itemId: string) {
    setSettingsError(null);
    setSettingsSaving(true);

    try {
      await archiveItemMutation.mutateAsync({ id: itemId });
      setSettingsDrafts((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Practice item could not be removed.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function openSettings() {
    setSettingsDrafts(buildSettingsDrafts(items));
    setPendingSettingsItems([]);
    setSettingsError(null);
    setSettingsDirty(false);
    setSettingsOpen(true);
  }

  function closeSettings() {
    if (settingsSaving) return;
    setPendingSettingsItems([]);
    setSettingsError(null);
    setSettingsDirty(false);
    setSettingsOpen(false);
  }

  const totalElapsed = items.reduce((sum, item) => sum + displayElapsed(item.id), 0);
  const activeItem = activeItemId ? items.find((item) => item.id === activeItemId) ?? null : null;
  const activeElapsed = activeItemId ? displayElapsed(activeItemId) : 0;
  const activePlanned = activeItem ? draft[activeItem.id]?.plannedSeconds ?? activeItem.defaultPlannedSeconds : 0;
  const historyDays = days.filter((day) => practiceDateKey(day.practiceDate) !== todayKey);

  return (
    <main className={styles.appShell}>
      <section className={styles.appSurface} aria-label="Guitar Practice">
        <header className={`${styles.header} ${styles.guitarHeader}`}>
          <div className={styles.brand}>
            <span className={styles.guitarMark}>
              <GuitarIcon />
            </span>
            <span className={styles.brandName}>
              Guitar<span>Practice</span>
            </span>
          </div>
          <button className={styles.iconButton} type="button" aria-label="Edit practice list" onClick={openSettings}>
            <GearIcon />
          </button>
        </header>

        <div className={styles.galleryScroll}>
          {listQuery.error ? <p className={styles.inlineError}>{listQuery.error.message}</p> : null}

          {listQuery.isLoading ? (
            <section className={styles.emptyState}>
              <h1>Loading practice</h1>
              <p>Getting today&apos;s checklist ready.</p>
            </section>
          ) : (
            <>
              <section className={styles.practiceDaySection}>
                <div className={styles.dayHeader}>
                  <span className={styles.dayLabel}>{dayLabel(todayTimestamp)}</span>
                  <span className={styles.dayDate}>{dateChip(todayTimestamp)}</span>
                  <span className={styles.dayCount}>{formatDuration(totalElapsed)}</span>
                </div>

                <div className={`${styles.practiceCard} ${styles.practiceCardToday}`}>
                  {items.map((item) => {
                    const itemDraft = draft[item.id] ?? {
                      plannedSeconds: item.defaultPlannedSeconds,
                      elapsedSeconds: 0,
                      completed: false
                    };
                    const elapsed = displayElapsed(item.id);
                    const planned = itemDraft.plannedSeconds;
                    const percent = planned > 0 ? Math.min(100, Math.round((elapsed / planned) * 100)) : 0;

                    return (
                      <div className={styles.practiceItemRow} key={item.id}>
                        <button className={styles.practicePlay} type="button" aria-label={`Practice ${item.label}`} onClick={() => void startTimer(item.id)}>
                          {itemDraft.completed ? <span className={styles.practiceCheckmark}>✓</span> : <PlayIcon />}
                        </button>
                        <div className={styles.practiceItemMain}>
                          <div className={styles.practiceItemLine}>
                            <span className={styles.practiceItemName}>{item.label}</span>
                            <span className={styles.practiceItemTime}>
                              {elapsed > 0 ? formatClock(elapsed) : "-"} <span>/ {formatClock(planned)}</span>
                            </span>
                          </div>
                          <div className={styles.practiceProgress}>
                            <span style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <label className={styles.practiceNote}>
                    <span>{comment ? "Note" : "+ Add note"}</span>
                    <textarea
                      value={comment}
                      maxLength={1000}
                      rows={comment ? 2 : 1}
                      onBlur={() => void saveDay()}
                      onChange={(event) => {
                        setCommentDirty(true);
                        setComment(event.currentTarget.value);
                      }}
                      placeholder="Add a note"
                    />
                  </label>
                </div>

                {saveError ? <p className={styles.roundupError}>{saveError}</p> : null}

                <PracticeReviewCard
                  dateLabel={`${dayLabel(todayTimestamp)} ${dateChip(todayTimestamp)}`}
                  isLoading={generateReviewMutation.isPending}
                  error={reviewError}
                  review={todayReview}
                  onGenerate={() => void generateReview()}
                />
              </section>

              {historyDays.length === 0 ? null : (
                <section className={styles.practiceHistory}>
                  {historyDays.map((day) => {
                    const timestamp = day.practiceDate.getTime();
                    const key = practiceDateKey(day.practiceDate);
                    const elapsed = day.itemLogs.reduce((sum, log) => sum + log.elapsedSeconds, 0);
                    const review = reviewByDay.get(key);

                    return (
                      <section className={styles.practiceDaySection} key={day.id}>
                        <div className={styles.dayHeader}>
                          <span className={styles.dayLabel}>{dayLabel(timestamp)}</span>
                          <span className={styles.dayDate}>{dateChip(timestamp)}</span>
                          <span className={styles.dayCount}>{formatDuration(elapsed)}</span>
                        </div>
                        <div className={styles.practiceCard}>
                          {day.itemLogs.map((log) => (
                            <div className={styles.practiceItemRow} key={log.id}>
                              <span className={`${styles.practiceDot} ${log.elapsedSeconds > 0 ? styles.practiceDotOn : ""}`} />
                              <div className={styles.practiceItemMain}>
                                <div className={styles.practiceItemLine}>
                                  <span className={styles.practiceItemName}>{log.itemLabelSnapshot}</span>
                                  <span className={styles.practiceItemTime}>
                                    {formatClock(log.elapsedSeconds)} <span>/ {formatClock(log.plannedSeconds)}</span>
                                  </span>
                                </div>
                                <div className={styles.practiceProgress}>
                                  <span style={{ width: `${Math.min(100, Math.round((log.elapsedSeconds / log.plannedSeconds) * 100))}%` }} />
                                </div>
                              </div>
                            </div>
                          ))}
                          {day.comment ? <p className={styles.practiceSavedNote}>{day.comment}</p> : null}
                        </div>
                        {review ? <p className={styles.practiceReviewHint}>Review saved: {practiceDateKey(review.generatedAt)}</p> : null}
                      </section>
                    );
                  })}
                </section>
              )}
            </>
          )}
          <div className={styles.scrollPad} />
        </div>

        {activeItem ? (
          <div className={styles.timerOverlay}>
            <button className={styles.timerCancel} type="button" onClick={cancelTimer}>
              Cancel
            </button>
            <div className={styles.timerName}>{activeItem.label}</div>
            <div className={styles.timerSub}>Target {formatClock(activePlanned)}</div>
            <div className={styles.timerRing}>
              <svg viewBox="0 0 300 300" aria-hidden="true">
                <circle cx="150" cy="150" r="132" />
                <circle
                  className={styles.timerRingProgress}
                  cx="150"
                  cy="150"
                  r="132"
                  style={{
                    strokeDashoffset: `${829.38 * (1 - Math.min(1, activeElapsed / Math.max(activePlanned, 1)))}`
                  }}
                />
              </svg>
              <div className={styles.timerDigits}>
                <span>{formatClock(Math.max(0, activePlanned - activeElapsed))}</span>
                <small>{formatClock(activeElapsed)} done</small>
              </div>
            </div>
            <div className={styles.timerControls}>
              <button className={styles.timerToggle} type="button" onClick={toggleTimerPause}>
                {activeStartedAt ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button className={styles.timerDone} type="button" onClick={() => void logTimer(activeItem.id)} disabled={activeElapsed === 0}>
                Log {formatClock(activeElapsed)}
              </button>
            </div>
          </div>
        ) : null}

        {settingsOpen ? (
          <div className={styles.settingsOverlay} onClick={closeSettings}>
            <section className={styles.settingsSheet} onClick={(event) => event.stopPropagation()}>
              <div className={styles.settingsHead}>
                <h2>Practice list</h2>
                <p>Each item has a target time you&apos;ll practice toward</p>
              </div>

              <div className={styles.settingsBody}>
                <div className={styles.settingsRows}>
                  {items.map((item) => {
                    const settings = settingsDrafts[item.id] ?? {
                      label: item.label === "New item" ? "" : item.label,
                      plannedMinutes: String(Math.round(item.defaultPlannedSeconds / 60))
                    };

                    return (
                      <div className={styles.settingsRow} key={item.id}>
                        <input
                          aria-label={`${item.label} label`}
                          disabled={settingsSaving}
                          value={settings.label}
                          onChange={(event) => {
                            const label = event.currentTarget.value;
                            setSettingsDirty(true);
                            setSettingsDrafts((current) => ({
                              ...current,
                              [item.id]: { ...settings, label }
                            }));
                          }}
                        />
                        <input
                          className={styles.settingsMinutes}
                          aria-label={`${item.label} planned minutes`}
                          type="number"
                          min="1"
                          disabled={settingsSaving}
                          value={settings.plannedMinutes}
                          onChange={(event) => {
                            const plannedMinutes = event.currentTarget.value;
                            setSettingsDirty(true);
                            setSettingsDrafts((current) => ({
                              ...current,
                              [item.id]: { ...settings, plannedMinutes }
                            }));
                          }}
                        />
                        <span className={styles.settingsMinLabel}>min</span>
                        <button
                          className={styles.settingsTrash}
                          type="button"
                          aria-label={`Remove ${item.label}`}
                          disabled={settingsSaving}
                          onClick={() => void archiveSettingsItem(item.id)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    );
                  })}
                  {pendingSettingsItems.map((item) => (
                    <div className={styles.settingsRow} key={item.id}>
                      <input
                        aria-label="New practice item label"
                        disabled={settingsSaving}
                        value={item.label}
                        onChange={(event) => {
                          const label = event.currentTarget.value;
                          setSettingsDirty(true);
                          setPendingSettingsItems((current) =>
                            current.map((draft) => (draft.id === item.id ? { ...draft, label } : draft))
                          );
                        }}
                        placeholder="New item"
                      />
                      <input
                        className={styles.settingsMinutes}
                        aria-label="New practice item planned minutes"
                        type="number"
                        min="1"
                        disabled={settingsSaving}
                        value={item.plannedMinutes}
                        onChange={(event) => {
                          const plannedMinutes = event.currentTarget.value;
                          setSettingsDirty(true);
                          setPendingSettingsItems((current) =>
                            current.map((draft) => (draft.id === item.id ? { ...draft, plannedMinutes } : draft))
                          );
                        }}
                      />
                      <span className={styles.settingsMinLabel}>min</span>
                      <button
                        className={styles.settingsTrash}
                        type="button"
                        aria-label="Remove new practice item"
                        disabled={settingsSaving}
                        onClick={() => {
                          setSettingsDirty(true);
                          setPendingSettingsItems((current) => current.filter((draft) => draft.id !== item.id));
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>

                <div className={styles.settingsAdd}>
                  <button className={styles.settingsAddButton} type="button" onClick={addItemDraft} disabled={settingsSaving}>
                    <PlusIcon /> Add item
                  </button>
                </div>
              </div>

              {settingsError ? <p className={styles.roundupError}>{settingsError}</p> : null}

              <div className={styles.settingsActions}>
                <button type="button" onClick={closeSettings} disabled={settingsSaving}>
                  Cancel
                </button>
                <button type="button" onClick={() => void saveSettings()} disabled={settingsSaving}>
                  {settingsSaving ? "Saving" : "Save list"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
