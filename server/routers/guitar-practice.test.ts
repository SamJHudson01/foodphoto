import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGuitarCoachPrompt,
  buildPracticeEvidenceSummary,
  buildPreviousPracticeContext,
  dayKeyToDate,
  getGuitarReviewText,
  guitarPracticeRouter,
  hasPracticeEvidence,
  previousPracticeWindowStart,
  validateGuitarReviewText
} from "./guitar-practice";

const ids = {
  warmup: "00000000-0000-4000-8000-000000000101",
  technique: "00000000-0000-4000-8000-000000000102",
  chords: "00000000-0000-4000-8000-000000000103",
  scales: "00000000-0000-4000-8000-000000000104",
  song: "00000000-0000-4000-8000-000000000105",
  other: "00000000-0000-4000-8000-000000000201"
};

type UserRow = {
  id: string;
  clerkUserId: string;
};

type ItemRow = {
  id: string;
  userId: string;
  label: string;
  defaultSeedKey: string | null;
  defaultPlannedSeconds: number;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DayRow = {
  id: string;
  userId: string;
  practiceDate: Date;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
};

type LogRow = {
  id: string;
  practiceDayId: string;
  practiceItemId: string;
  itemLabelSnapshot: string;
  plannedSeconds: number;
  elapsedSeconds: number;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ReviewRow = {
  id: string;
  userId: string;
  dayStart: Date;
  text: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

class GuitarMemoryPrisma {
  users: UserRow[] = [];
  items: ItemRow[] = [];
  days: DayRow[] = [];
  logs: LogRow[] = [];
  reviews: ReviewRow[] = [];

  $transaction = vi.fn(async <T>(callback: (tx: GuitarMemoryPrisma) => Promise<T>) => {
    return callback(this);
  });

  user = {
    findUnique: vi.fn(async ({ where }: { where: { clerkUserId: string } }) => {
      return this.users.find((user) => user.clerkUserId === where.clerkUserId) ?? null;
    }),
    upsert: vi.fn(
      async ({
        where,
        create
      }: {
        where: { clerkUserId: string };
        create: { clerkUserId: string };
      }) => {
        const existing = this.users.find((user) => user.clerkUserId === where.clerkUserId);
        if (existing) return { id: existing.id };

        const user = { id: `user-${this.users.length + 1}`, clerkUserId: create.clerkUserId };
        this.users.push(user);
        return { id: user.id };
      }
    )
  };

  guitarPracticeItem = {
    count: vi.fn(async ({ where }: { where: { userId: string; archivedAt?: null } }) => {
      return this.items.filter((item) => item.userId === where.userId && (!("archivedAt" in where) || item.archivedAt === null))
        .length;
    }),
    create: vi.fn(async ({ data }: { data: Omit<ItemRow, "id" | "createdAt" | "updatedAt" | "archivedAt" | "defaultSeedKey"> & { defaultSeedKey?: string | null } }) => {
      const now = new Date("2026-06-03T09:00:00.000Z");
      const id = Object.values(ids)[this.items.length] ?? `00000000-0000-4000-8000-${String(this.items.length + 1).padStart(12, "0")}`;
      const row = {
        id,
        ...data,
        defaultSeedKey: data.defaultSeedKey ?? null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now
      };
      this.items.push(row);
      return selectItem(row);
    }),
    upsert: vi.fn(
      async ({
        where,
        update,
        create
      }: {
        where: { userId_defaultSeedKey: { userId: string; defaultSeedKey: string } };
        update: Partial<Pick<ItemRow, "defaultPlannedSeconds" | "label" | "sortOrder">>;
        create: Omit<ItemRow, "id" | "createdAt" | "updatedAt" | "archivedAt">;
      }) => {
        const existing = this.items.find(
          (item) =>
            item.userId === where.userId_defaultSeedKey.userId &&
            item.defaultSeedKey === where.userId_defaultSeedKey.defaultSeedKey
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date("2026-06-03T09:05:00.000Z") });
          return selectItem(existing);
        }

        return this.guitarPracticeItem.create({ data: create });
      }
    ),
    findMany: vi.fn(
      async ({
        where,
        take
      }: {
        where: { userId: string; archivedAt?: null; id?: { in: string[] } };
        take?: number;
      }) => {
        const rows = this.items
          .filter((item) => {
            if (item.userId !== where.userId) return false;
            if ("archivedAt" in where && item.archivedAt !== null) return false;
            if (where.id && !where.id.in.includes(item.id)) return false;
            return true;
          })
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());

        return rows.slice(0, take ?? rows.length).map(selectItem);
      }
    ),
    findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
      const item = this.items.find((row) => row.id === where.id && row.userId === where.userId);
      return item ? selectItem(item) : null;
    }),
    update: vi.fn(
      async ({
        where,
        data
      }: {
        where: { id: string };
        data: Partial<Pick<ItemRow, "archivedAt" | "defaultPlannedSeconds" | "label" | "sortOrder">>;
      }) => {
        const item = this.items.find((row) => row.id === where.id);
        if (!item) throw new Error("missing item");

        Object.assign(item, data, { updatedAt: new Date("2026-06-03T09:05:00.000Z") });
        return selectItem(item);
      }
    )
  };

  guitarPracticeDay = {
    findMany: vi.fn(
      async ({
        where,
        take
      }: {
        where: { userId: string };
        take: number;
      }) => {
        return this.days
          .filter((day) => day.userId === where.userId)
          .sort((a, b) => b.practiceDate.getTime() - a.practiceDate.getTime())
          .slice(0, take)
          .map((day) => this.selectDay(day));
      }
    ),
    findFirst: vi.fn(async ({ where }: { where: { id?: string; userId: string; practiceDate?: Date } }) => {
      const day = this.days.find((row) => {
        if (row.userId !== where.userId) return false;
        if (where.id && row.id !== where.id) return false;
        if (where.practiceDate && row.practiceDate.getTime() !== where.practiceDate.getTime()) return false;
        return true;
      });

      return day ? this.selectDay(day) : null;
    }),
    upsert: vi.fn(
      async ({
        where,
        update,
        create
      }: {
        where: { userId_practiceDate: { userId: string; practiceDate: Date } };
        update: Partial<Pick<DayRow, "comment" | "practiceDate">>;
        create: Pick<DayRow, "comment" | "practiceDate" | "userId">;
      }) => {
        const existing = this.days.find(
          (day) =>
            day.userId === where.userId_practiceDate.userId &&
            day.practiceDate.getTime() === where.userId_practiceDate.practiceDate.getTime()
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date("2026-06-03T10:00:00.000Z") });
          return { id: existing.id };
        }

        const now = new Date("2026-06-03T09:00:00.000Z");
        const day = {
          id: `00000000-0000-4000-8000-${String(this.days.length + 301).padStart(12, "0")}`,
          ...create,
          createdAt: now,
          updatedAt: now
        };
        this.days.push(day);
        return { id: day.id };
      }
    ),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.logs = this.logs.filter((log) => log.practiceDayId !== where.id);
      this.days = this.days.filter((day) => day.id !== where.id);
      return { id: where.id };
    })
  };

  guitarPracticeItemLog = {
    upsert: vi.fn(
      async ({
        where,
        update,
        create
      }: {
        where: { practiceDayId_practiceItemId: { practiceDayId: string; practiceItemId: string } };
        update: Omit<LogRow, "createdAt" | "id" | "practiceDayId" | "practiceItemId" | "updatedAt">;
        create: Omit<LogRow, "createdAt" | "id" | "updatedAt">;
      }) => {
        const existing = this.logs.find(
          (log) =>
            log.practiceDayId === where.practiceDayId_practiceItemId.practiceDayId &&
            log.practiceItemId === where.practiceDayId_practiceItemId.practiceItemId
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date("2026-06-03T10:00:00.000Z") });
          return { id: existing.id };
        }

        const now = new Date("2026-06-03T09:00:00.000Z");
        const row = {
          id: `00000000-0000-4000-8000-${String(this.logs.length + 401).padStart(12, "0")}`,
          ...create,
          createdAt: now,
          updatedAt: now
        };
        this.logs.push(row);
        return { id: row.id };
      }
    )
  };

  guitarPracticeReview = {
    findFirst: vi.fn(async ({ where }: { where: { userId: string; dayStart: Date } }) => {
      const review = this.reviews.find((row) => row.userId === where.userId && row.dayStart.getTime() === where.dayStart.getTime());
      return review ? selectReview(review) : null;
    }),
    findMany: vi.fn(
      async ({
        where,
        take
      }: {
        where: { userId: string; dayStart?: { gte?: Date; lt?: Date } };
        take: number;
      }) => {
        return this.reviews
          .filter((review) => {
            if (review.userId !== where.userId) return false;
            if (where.dayStart?.gte && review.dayStart < where.dayStart.gte) return false;
            if (where.dayStart?.lt && review.dayStart >= where.dayStart.lt) return false;
            return true;
          })
          .sort((a, b) => a.dayStart.getTime() - b.dayStart.getTime())
          .slice(0, take)
          .map(selectReview);
      }
    ),
    upsert: vi.fn(
      async ({
        where,
        update,
        create
      }: {
        where: { userId_dayStart: { userId: string; dayStart: Date } };
        update: { text: string; generatedAt: Date };
        create: { userId: string; dayStart: Date; text: string };
      }) => {
        const existing = this.reviews.find(
          (review) =>
            review.userId === where.userId_dayStart.userId &&
            review.dayStart.getTime() === where.userId_dayStart.dayStart.getTime()
        );

        if (existing) {
          existing.text = update.text;
          existing.generatedAt = update.generatedAt;
          existing.updatedAt = new Date("2026-06-03T11:00:00.000Z");
          return selectReview(existing);
        }

        const now = new Date("2026-06-03T11:00:00.000Z");
        const row = {
          id: `00000000-0000-4000-8000-${String(this.reviews.length + 501).padStart(12, "0")}`,
          ...create,
          generatedAt: now,
          createdAt: now,
          updatedAt: now
        };
        this.reviews.push(row);
        return selectReview(row);
      }
    )
  };

  selectDay(day: DayRow) {
    return {
      id: day.id,
      practiceDate: day.practiceDate,
      comment: day.comment,
      createdAt: day.createdAt,
      updatedAt: day.updatedAt,
      itemLogs: this.logs
        .filter((log) => log.practiceDayId === day.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((log) => {
          const item = this.items.find((row) => row.id === log.practiceItemId);
          return {
            id: log.id,
            practiceItemId: log.practiceItemId,
            itemLabelSnapshot: log.itemLabelSnapshot,
            plannedSeconds: log.plannedSeconds,
            elapsedSeconds: log.elapsedSeconds,
            completed: log.completed,
            createdAt: log.createdAt,
            updatedAt: log.updatedAt,
            practiceItem: {
              archivedAt: item?.archivedAt ?? null
            }
          };
        })
    };
  }
}

function selectItem(item: ItemRow) {
  return {
    id: item.id,
    label: item.label,
    defaultPlannedSeconds: item.defaultPlannedSeconds,
    sortOrder: item.sortOrder,
    archivedAt: item.archivedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function selectReview(review: ReviewRow) {
  return {
    id: review.id,
    dayStart: review.dayStart,
    text: review.text,
    generatedAt: review.generatedAt,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
}

function callerFor(prisma: GuitarMemoryPrisma, clerkUserId = "clerk-user-1") {
  return guitarPracticeRouter.createCaller({
    auth: { userId: clerkUserId },
    prisma
  } as never);
}

beforeEach(() => {
  process.env.VERTEX_API_KEY = "test-vertex-key";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("guitar practice pure boundaries", () => {
  it("builds bounded practice evidence, previous context, and required review labels", () => {
    const evidence = buildPracticeEvidenceSummary({
      practiceDate: dayKeyToDate("2026-06-03"),
      comment: "Avoided scales again.",
      itemLogs: [
        { itemLabelSnapshot: "Warm-up", plannedSeconds: 300, elapsedSeconds: 320, completed: true },
        { itemLabelSnapshot: "Scales", plannedSeconds: 600, elapsedSeconds: 0, completed: false }
      ]
    });
    const previous = buildPreviousPracticeContext([
      { dayStart: dayKeyToDate("2026-06-01"), text: "Overview: Technique was skipped." }
    ]);
    const prompt = buildGuitarCoachPrompt("Today 3 Jun", evidence, previous);

    expect(evidence).toContain("Warm-up: planned 5m, actual 5m 20s, completed");
    expect(evidence).toContain("Scales: planned 10m, actual 0s, not completed");
    expect(evidence).toContain("Comment: Avoided scales again.");
    expect(previous).toBe("1. 2026-06-01\nOverview: Technique was skipped.");
    expect(previousPracticeWindowStart(dayKeyToDate("2026-06-03")).toISOString()).toBe("2026-05-27T00:00:00.000Z");
    expect(prompt).toContain("Overview:");
    expect(prompt).toContain("Practice Evidence:");
    expect(prompt).toContain("Pattern Read:");
    expect(prompt).toContain("Main Observation:");
    expect(prompt).toContain("Tomorrow Focus:");
    expect(prompt).toContain("Standard:");
    expect(prompt).toContain("Previous 7 Practice Reviews:");
    expect(prompt).toContain("Technique was skipped.");
    expect(hasPracticeEvidence({ practiceDate: dayKeyToDate("2026-06-03"), comment: "", itemLogs: [] })).toBe(false);
    expect(getGuitarReviewText({ candidates: [{ content: { parts: [{ text: " Overview: Done." }] } }] })).toBe("Overview: Done.");
    expect(validateGuitarReviewText(fullReviewText("Done."))).toBe(true);
    expect(validateGuitarReviewText("Overview: Missing the rest.")).toBe(false);
  });
});

describe("guitar practice router behavior", () => {
  it("seeds active practice items lazily for the signed-in user only", async () => {
    const prisma = new GuitarMemoryPrisma();

    const result = await callerFor(prisma).list();

    expect(result.items.map((item: { label: string }) => item.label)).toEqual(["Warm-up", "Bends", "Scales", "Chord changes", "Song"]);
    expect(prisma.users).toEqual([{ id: "user-1", clerkUserId: "clerk-user-1" }]);
    expect(prisma.items.every((item) => item.userId === "user-1")).toBe(true);
  });

  it("creates, updates, and archives only owner-scoped practice items", async () => {
    const prisma = new GuitarMemoryPrisma();
    const caller = callerFor(prisma);
    await caller.list();

    const updated = await caller.updateItem({
      id: ids.technique,
      label: "Right-hand bends",
      defaultPlannedSeconds: 720,
      sortOrder: 1
    });
    const archived = await caller.archiveItem({ id: ids.chords });
    const listed = await caller.list();

    expect(updated.label).toBe("Right-hand bends");
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(listed.items.map((item: { label: string }) => item.label)).not.toContain("Scales");
    await expect(callerFor(prisma, "other-clerk").updateItem({
      id: ids.technique,
      label: "Stolen",
      defaultPlannedSeconds: 600,
      sortOrder: 1
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("upserts duplicate day saves idempotently and rejects cross-user item ids", async () => {
    const prisma = new GuitarMemoryPrisma();
    const caller = callerFor(prisma);
    await caller.list();
    await callerFor(prisma, "other-clerk").createItem({
      label: "Other user item",
      defaultPlannedSeconds: 300,
      sortOrder: 0
    });

    const first = await caller.upsertDay({
      dayKey: "2026-06-03",
      comment: "  Clean run  ",
      itemLogs: [{ itemId: ids.warmup, plannedSeconds: 300, elapsedSeconds: 300, completed: true }]
    });
    const second = await caller.upsertDay({
      dayKey: "2026-06-03",
      comment: "Updated comment",
      itemLogs: [{ itemId: ids.warmup, plannedSeconds: 300, elapsedSeconds: 360, completed: true }]
    });

    expect(prisma.days).toHaveLength(1);
    expect(prisma.logs).toHaveLength(1);
    expect(first?.comment).toBe("Clean run");
    expect(second?.comment).toBe("Updated comment");
    expect(second?.itemLogs[0]).toMatchObject({ elapsedSeconds: 360, itemLabelSnapshot: "Warm-up" });
    await expect(
      caller.upsertDay({
        dayKey: "2026-06-03",
        itemLogs: [{ itemId: ids.other, plannedSeconds: 300, elapsedSeconds: 60, completed: false }]
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("saving one timed item does not overwrite another item on the same day", async () => {
    const prisma = new GuitarMemoryPrisma();
    const caller = callerFor(prisma);
    await caller.list();

    await caller.saveItemTime({
      dayKey: "2026-06-03",
      itemId: ids.warmup,
      plannedSeconds: 300,
      elapsedSeconds: 300,
      completed: true
    });
    const day = await caller.saveItemTime({
      dayKey: "2026-06-03",
      itemId: ids.technique,
      plannedSeconds: 900,
      elapsedSeconds: 120,
      completed: false
    });

    expect(prisma.days).toHaveLength(1);
    expect(day?.itemLogs).toHaveLength(2);
    expect(day?.itemLogs.map((log: { itemLabelSnapshot: string }) => log.itemLabelSnapshot)).toEqual(["Warm-up", "Bends"]);
  });

  it("clears only the requested user's practice day and logs", async () => {
    const prisma = new GuitarMemoryPrisma();
    const caller = callerFor(prisma);
    const otherCaller = callerFor(prisma, "other-clerk");
    await caller.list();
    await otherCaller.list();

    await caller.upsertDay({
      dayKey: "2026-06-03",
      itemLogs: [{ itemId: ids.warmup, plannedSeconds: 300, elapsedSeconds: 300, completed: true }]
    });
    await caller.upsertDay({
      dayKey: "2026-06-04",
      itemLogs: [{ itemId: ids.warmup, plannedSeconds: 300, elapsedSeconds: 60, completed: false }]
    });
    await otherCaller.upsertDay({
      dayKey: "2026-06-03",
      itemLogs: [{ itemId: ids.other, plannedSeconds: 300, elapsedSeconds: 120, completed: false }]
    });

    await expect(caller.clearDay({ dayKey: "2026-06-03" })).resolves.toEqual({ cleared: true });
    await expect(caller.clearDay({ dayKey: "2026-06-03" })).resolves.toEqual({ cleared: true });

    const listed = await caller.list();
    const otherListed = await otherCaller.list();

    expect(listed.days.map((day: { practiceDate: Date }) => day.practiceDate.toISOString().slice(0, 10))).toEqual(["2026-06-04"]);
    expect(otherListed.days.map((day: { practiceDate: Date }) => day.practiceDate.toISOString().slice(0, 10))).toEqual(["2026-06-03"]);
    expect(prisma.logs).toHaveLength(2);
  });

  it("rejects empty review generation before Vertex and includes only previous seven owner reviews", async () => {
    const prisma = new GuitarMemoryPrisma();
    const caller = callerFor(prisma);
    await caller.list();
    await caller.upsertDay({
      dayKey: "2026-06-03",
      itemLogs: [{ itemId: ids.warmup, plannedSeconds: 300, elapsedSeconds: 0, completed: false }]
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(caller.generateReview({ dayKey: "2026-06-03", label: "Today 3 Jun" })).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await caller.saveItemTime({
      dayKey: "2026-06-03",
      itemId: ids.warmup,
      plannedSeconds: 300,
      elapsedSeconds: 300,
      completed: true
    });
    await caller.saveItemTime({
      dayKey: "2026-06-03",
      itemId: ids.chords,
      plannedSeconds: 600,
      elapsedSeconds: 3,
      completed: true
    });
    await caller.archiveItem({ id: ids.chords });
    const currentReview = review("user-1", "2026-06-03", fullReviewText("Current day existing review."));
    currentReview.generatedAt = new Date("2026-06-03T10:00:00.000Z");
    prisma.reviews.push(
      review("user-1", "2026-05-24", fullReviewText("Too old.")),
      review("user-1", "2026-05-31", fullReviewText("Warm-up was consistent.")),
      review("user-2", "2026-06-01", fullReviewText("Other user context.")),
      currentReview
    );
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: fullReviewText("Done.") }] }, finishReason: "STOP" }]
        }),
        { status: 200 }
      )
    );

    const generated = await caller.generateReview({ dayKey: "2026-06-03", label: "Today 3 Jun" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.contents[0].parts[0].text;

    expect(generated.text).toContain("Overview: Done.");
    expect(prisma.reviews).toHaveLength(4);
    expect(prisma.reviews.find((row) => row.dayStart.getTime() === dayKeyToDate("2026-06-03").getTime())?.text).toContain("Overview: Done.");
    expect(body.generationConfig).not.toHaveProperty("maxOutputTokens");
    expect(prompt).toContain("Warm-up: planned 5m, actual 5m, completed");
    expect(prompt).not.toContain("Chord changes");
    expect(prompt).toContain("Warm-up was consistent.");
    expect(prompt).not.toContain("Too old.");
    expect(prompt).not.toContain("Other user context.");
    expect(prompt).not.toContain("Current day existing review.");
  });

  it("rejects malformed or truncated review output before persistence", async () => {
    const prisma = new GuitarMemoryPrisma();
    const caller = callerFor(prisma, "malformed-review-user");
    await caller.list();
    await caller.saveItemTime({
      dayKey: "2026-06-03",
      itemId: ids.warmup,
      plannedSeconds: 300,
      elapsedSeconds: 300,
      completed: true
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Overview: Missing required sections." }] }, finishReason: "STOP" }]
        }),
        { status: 200 }
      )
    );

    await expect(caller.generateReview({ dayKey: "2026-06-03", label: "Today 3 Jun" })).rejects.toMatchObject({
      code: "BAD_GATEWAY"
    });
    expect(prisma.reviews).toHaveLength(0);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: fullReviewText("Truncated.") }] }, finishReason: "MAX_TOKENS" }]
        }),
        { status: 200 }
      )
    );

    await expect(caller.generateReview({ dayKey: "2026-06-03", label: "Today 3 Jun" })).rejects.toMatchObject({
      code: "BAD_GATEWAY"
    });
    expect(prisma.reviews).toHaveLength(0);
  });

  it("returns a recent saved review instead of calling Vertex again", async () => {
    const prisma = new GuitarMemoryPrisma();
    const caller = callerFor(prisma, "cooldown-user");
    await caller.list();
    await caller.saveItemTime({
      dayKey: "2026-06-03",
      itemId: ids.warmup,
      plannedSeconds: 300,
      elapsedSeconds: 300,
      completed: true
    });
    const recentReview = review("user-1", "2026-06-03", fullReviewText("Recently generated."));
    recentReview.generatedAt = new Date();
    prisma.reviews.push(recentReview);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await caller.generateReview({ dayKey: "2026-06-03", label: "Today 3 Jun" });

    expect(result.text).toContain("Recently generated.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function fullReviewText(overview: string) {
  return `Overview: ${overview}
Practice Evidence: Warm-up was completed.
Pattern Read: This matches the recent pattern.
Main Observation: The bottleneck is consistent work on the hard item.
Tomorrow Focus: Start with five minutes of focused technique.
Standard: Touch the hard thing first.`;
}

function review(userId: string, dayKey: string, text: string): ReviewRow {
  const now = new Date("2026-06-03T11:00:00.000Z");
  return {
    id: `review-${dayKey}`,
    userId,
    dayStart: dayKeyToDate(dayKey),
    text,
    generatedAt: now,
    createdAt: now,
    updatedAt: now
  };
}
