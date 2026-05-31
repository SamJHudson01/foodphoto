import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCoachPrompt,
  buildRoundupTextSummary,
  dayKeyToDate,
  getRoundupText,
  imagePartFromEntry,
  roundupsRouter,
  type RoundupFoodEntry
} from "./roundups";

type UserRow = {
  id: string;
  clerkUserId: string;
};

type RoundupRow = {
  id: string;
  userId: string;
  dayStart: Date;
  text: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

class RoundupMemoryPrisma {
  users: UserRow[] = [{ id: "user-1", clerkUserId: "clerk-user-1" }];
  entries: RoundupFoodEntry[] = [];
  roundups: RoundupRow[] = [];

  user = {
    findUnique: vi.fn(async ({ where }: { where: { clerkUserId: string } }) => {
      return this.users.find((user) => user.clerkUserId === where.clerkUserId) ?? null;
    })
  };

  foodEntry = {
    findMany: vi.fn(
      async ({
        where,
        orderBy,
        take
      }: {
        where: {
          userId: string;
          capturedAt: { gte: Date; lt: Date };
        };
        orderBy: { capturedAt: "asc" | "desc" };
        take: number;
      }) => {
        return this.entries
          .filter(
            (entry) =>
              where.userId === "user-1" && entry.capturedAt >= where.capturedAt.gte && entry.capturedAt < where.capturedAt.lt
          )
          .sort((a, b) =>
            orderBy.capturedAt === "asc"
              ? a.capturedAt.getTime() - b.capturedAt.getTime()
              : b.capturedAt.getTime() - a.capturedAt.getTime()
          )
          .slice(0, take);
      }
    )
  };

  dailyRoundup = {
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
      return this.roundups
        .filter((roundup) => roundup.userId === where.userId)
        .sort((a, b) => b.dayStart.getTime() - a.dayStart.getTime())
        .slice(0, 120);
    }),
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
        const existing = this.roundups.find(
          (roundup) =>
            roundup.userId === where.userId_dayStart.userId &&
            roundup.dayStart.getTime() === where.userId_dayStart.dayStart.getTime()
        );

        if (existing) {
          existing.text = update.text;
          existing.generatedAt = update.generatedAt;
          existing.updatedAt = new Date("2026-05-31T12:00:00.000Z");
          return existing;
        }

        const now = new Date("2026-05-31T11:00:00.000Z");
        const row = {
          id: `roundup-${this.roundups.length + 1}`,
          userId: create.userId,
          dayStart: create.dayStart,
          text: create.text,
          generatedAt: now,
          createdAt: now,
          updatedAt: now
        };
        this.roundups.push(row);
        return row;
      }
    )
  };
}

function callerFor(prisma: RoundupMemoryPrisma, clerkUserId = "clerk-user-1") {
  return roundupsRouter.createCaller({
    auth: { userId: clerkUserId },
    prisma
  } as never);
}

function entry(input: Partial<RoundupFoodEntry>): RoundupFoodEntry {
  return {
    capturedAt: new Date("2026-05-31T08:15:00.000Z"),
    contentType: "image/jpeg",
    note: "",
    publicUrl: "https://pub.test/food.jpg",
    ...input
  };
}

beforeEach(() => {
  process.env.VERTEX_API_KEY = "test-vertex-key";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("roundup deterministic boundaries", () => {
  it("formats entry times in the browser timezone sent by the app", () => {
    const summary = buildRoundupTextSummary(
      [
        entry({ capturedAt: new Date("2026-05-31T08:15:00.000Z"), note: "breakfast" }),
        entry({ capturedAt: new Date("2026-05-31T20:05:00.000Z"), note: "dinner" })
      ],
      "Europe/London"
    );

    expect(summary).toBe("1. 9:15 am - note: breakfast\n2. 9:05 pm - note: dinner");
  });

  it("builds a prompt that forces meal bullets, comprehensive rundown, and one micro-adjustment", () => {
    const prompt = buildCoachPrompt("Today 31 May", "1. 9:15 am - note: eggs after gym");

    expect(prompt).toContain("Overview:");
    expect(prompt).toContain("Meals:");
    expect(prompt).toContain("Rundown:");
    expect(prompt).toContain("Observations:");
    expect(prompt).toContain("Experiment:");
    expect(prompt).toContain("Identity:");
    expect(prompt).toContain("Day: Today 31 May");
    expect(prompt).toContain("1. 9:15 am - note: eggs after gym");
    expect(prompt).toContain("You may only propose ONE micro-adjustment per review.");
    expect(prompt).toContain("Name and briefly describe each visible meal or eating occasion.");
    expect(prompt).toContain("Give a comprehensive day-quality read.");
    expect(prompt).toContain("You are strictly forbidden from estimating calories, macros in grams, or predicting weight loss.");
  });

  it("extracts Vertex text from all candidate text parts without keeping transport whitespace", () => {
    expect(
      getRoundupText({
        candidates: [
          {
            content: {
              parts: [{ text: "  Overview: Solid start." }, { text: "\nIdentity: Consistent logging matters.  " }]
            },
            finishReason: "STOP"
          }
        ]
      })
    ).toBe("Overview: Solid start.\nIdentity: Consistent logging matters.");

    expect(getRoundupText({ candidates: [{ content: { parts: [{}, { text: "   " }] } }] })).toBe("");
  });

  it("turns a stored R2 photo into a Vertex inline image part", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      imagePartFromEntry(entry({ contentType: "image/png", publicUrl: "https://pub.test/photo.png" }), 0, "request-1")
    ).resolves.toEqual({
      inlineData: {
        mimeType: "image/png",
        data: Buffer.from([1, 2, 3, 4]).toString("base64")
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://pub.test/photo.png");
  });

  it("rejects photos that R2 cannot serve and photos that exceed the model payload guardrail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));

    await expect(imagePartFromEntry(entry({ publicUrl: "https://pub.test/missing.jpg" }), 0, "request-1")).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: "Stored food photo could not be fetched for the AI roundup."
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(7_000_001), { status: 200 }))
    );

    await expect(imagePartFromEntry(entry({ publicUrl: "https://pub.test/huge.jpg" }), 0, "request-2")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "One food photo is too large for the AI roundup."
    });
  });

  it("converts day keys to stable UTC date starts for the database uniqueness key", () => {
    expect(dayKeyToDate("2026-05-31").toISOString()).toBe("2026-05-31T00:00:00.000Z");
  });
});

describe("roundup generation behavior", () => {
  it("fetches the day's images, sends them with the prompt to Vertex, and saves the returned roundup", async () => {
    const prisma = new RoundupMemoryPrisma();
    prisma.entries = [
      entry({
        capturedAt: new Date("2026-05-31T08:15:00.000Z"),
        note: "eggs after gym",
        publicUrl: "https://pub.test/breakfast.jpg"
      }),
      entry({
        capturedAt: new Date("2026-05-31T12:30:00.000Z"),
        note: "chicken salad",
        publicUrl: "https://pub.test/lunch.jpg"
      })
    ];
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const href = String(url);
      if (href === "https://pub.test/breakfast.jpg") {
        return new Response(new Uint8Array([10, 11]), { status: 200 });
      }
      if (href === "https://pub.test/lunch.jpg") {
        return new Response(new Uint8Array([20, 21]), { status: 200 });
      }
      if (href.startsWith("https://aiplatform.googleapis.com/")) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text:
                        "Overview: You captured a useful spread of meals.\nMeals:\n- Breakfast: Eggs after gym.\nRundown:\n- Strength: Protein anchor is visible.\nObservations: I noticed consistent protein.\nExperiment: Would you be open to adding berries after breakfast?\nIdentity: Small repeats build the performance routine."
                    }
                  ]
                },
                finishReason: "STOP"
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`unexpected fetch ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const saved = await callerFor(prisma).generate({
      dayKey: "2026-05-31",
      start: new Date("2026-05-31T00:00:00.000Z"),
      end: new Date("2026-06-01T00:00:00.000Z"),
      label: "Today 31 May",
      timeZone: "Europe/London"
    });

    expect(saved).toMatchObject({
      id: "roundup-1",
      dayStart: new Date("2026-05-31T00:00:00.000Z"),
      text: expect.stringContaining("Overview: You captured a useful spread of meals.")
    });
    expect(prisma.roundups).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const vertexCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith("https://aiplatform.googleapis.com/"));
    if (!vertexCall) throw new Error("Vertex request was not sent.");
    const requestBody = JSON.parse((vertexCall[1] as RequestInit).body as string);
    const parts = requestBody.contents[0].parts;
    expect(parts).toHaveLength(3);
    expect(parts[0].text).toContain("1. 9:15 am - note: eggs after gym");
    expect(parts[0].text).toContain("2. 1:30 pm - note: chicken salad");
    expect(parts[1]).toEqual({ inlineData: { mimeType: "image/jpeg", data: Buffer.from([10, 11]).toString("base64") } });
    expect(parts[2]).toEqual({ inlineData: { mimeType: "image/jpeg", data: Buffer.from([20, 21]).toString("base64") } });
  });

  it("rejects empty days before calling R2 or Vertex", async () => {
    const prisma = new RoundupMemoryPrisma();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callerFor(prisma).generate({
        dayKey: "2026-05-31",
        start: new Date("2026-05-31T00:00:00.000Z"),
        end: new Date("2026-06-01T00:00:00.000Z"),
        label: "Today 31 May",
        timeZone: "Europe/London"
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Add at least one food photo first."
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.roundups).toEqual([]);
  });
});
