import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const maxActiveItems = 20;
const maxRecentDays = 120;
const maxCommentChars = 1_000;
const maxLabelChars = 80;
const maxPlannedSeconds = 4 * 60 * 60;
const maxElapsedSeconds = 8 * 60 * 60;
const previousContextDays = 7;
const reviewCooldownMs = 60_000;
const vertexTimeoutMs = 30_000;
const model = process.env.VERTEX_MODEL ?? "gemini-3.1-pro-preview";

const defaultPracticeItems = [
  { seedKey: "warm-up", label: "Warm-up", defaultPlannedSeconds: 300, sortOrder: 0 },
  { seedKey: "bends", label: "Bends", defaultPlannedSeconds: 300, sortOrder: 1 },
  { seedKey: "scales", label: "Scales", defaultPlannedSeconds: 600, sortOrder: 2 },
  { seedKey: "chord-changes", label: "Chord changes", defaultPlannedSeconds: 600, sortOrder: 3 },
  { seedKey: "song", label: "Song", defaultPlannedSeconds: 1200, sortOrder: 4 }
] as const;

const reviewLabels = ["Overview", "Practice Evidence", "Pattern Read", "Main Observation", "Tomorrow Focus", "Standard"] as const;
const reviewCooldowns = new Map<string, number>();

const practiceItemSelect = {
  id: true,
  label: true,
  defaultPlannedSeconds: true,
  sortOrder: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

const practiceDaySelect = {
  id: true,
  practiceDate: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  itemLogs: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      practiceItemId: true,
      itemLabelSnapshot: true,
      plannedSeconds: true,
      elapsedSeconds: true,
      completed: true,
      createdAt: true,
      updatedAt: true
    }
  }
} as const;

const reviewSelect = {
  id: true,
  dayStart: true,
  text: true,
  generatedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

const practiceReviewDaySelect = {
  id: true,
  practiceDate: true,
  comment: true,
  itemLogs: {
    orderBy: { createdAt: "asc" },
    select: {
      itemLabelSnapshot: true,
      plannedSeconds: true,
      elapsedSeconds: true,
      completed: true,
      practiceItem: {
        select: {
          archivedAt: true
        }
      }
    }
  }
} as const;

type VertexResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message?: string;
  };
};

type GuitarLogEvidence = {
  itemLabelSnapshot: string;
  plannedSeconds: number;
  elapsedSeconds: number;
  completed: boolean;
};

export type PreviousPracticeSummary = {
  dayStart: Date;
  text: string;
};

export type PracticeDayEvidence = {
  practiceDate: Date;
  comment: string;
  itemLogs: GuitarLogEvidence[];
};

const logInput = z.object({
  itemId: z.string().uuid(),
  plannedSeconds: z.number().int().positive().max(maxPlannedSeconds),
  elapsedSeconds: z.number().int().min(0).max(maxElapsedSeconds),
  completed: z.boolean()
});

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function logGuitar(level: "error" | "info" | "warn", requestId: string, event: string, data: Record<string, boolean | number | string | null | undefined> = {}) {
  const line = `[guitarPractice.generateReview] ${JSON.stringify({ requestId, event, ...data })}`;

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

function errorDetails(error: unknown) {
  if (error instanceof TRPCError) {
    return { code: error.code, message: error.message, name: "TRPCError" };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack?.split("\n").slice(0, 6).join("\n")
    };
  }

  return { message: String(error), name: "UnknownError" };
}

export function dayKeyToDate(dayKey: string) {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export function previousPracticeWindowStart(dayStart: Date) {
  const start = new Date(dayStart);
  start.setUTCDate(start.getUTCDate() - previousContextDays);
  return start;
}

export function getGuitarReviewText(result: VertexResponse) {
  return (
    result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

export function validateGuitarReviewText(text: string) {
  const trimmed = text.trim();
  let previousIndex = -1;

  for (const label of reviewLabels) {
    const marker = `${label}:`;
    const index = trimmed.indexOf(marker);

    if (index <= previousIndex) return false;

    const contentStart = index + marker.length;
    const nextLabel = reviewLabels[reviewLabels.indexOf(label) + 1];
    const end = nextLabel ? trimmed.indexOf(`${nextLabel}:`, contentStart) : trimmed.length;
    const content = trimmed.slice(contentStart, end === -1 ? trimmed.length : end).trim();

    if (!content) return false;
    previousIndex = index;
  }

  return true;
}

function claimReviewGeneration(userId: string, dayKey: string) {
  const now = Date.now();
  const key = `${userId}:${dayKey}`;
  const expiresAt = reviewCooldowns.get(key);

  for (const [entryKey, entryExpiresAt] of reviewCooldowns) {
    if (entryExpiresAt <= now) reviewCooldowns.delete(entryKey);
  }

  if (expiresAt && expiresAt > now) return false;

  reviewCooldowns.set(key, now + reviewCooldownMs);
  return true;
}

function releaseReviewGeneration(userId: string, dayKey: string) {
  reviewCooldowns.delete(`${userId}:${dayKey}`);
}

export function buildPreviousPracticeContext(summaries: PreviousPracticeSummary[]) {
  if (summaries.length === 0) return "None available.";

  return summaries
    .map((summary, index) => `${index + 1}. ${summary.dayStart.toISOString().slice(0, 10)}\n${summary.text.trim()}`)
    .join("\n\n");
}

export function buildPracticeEvidenceSummary(day: PracticeDayEvidence) {
  const lines = day.itemLogs.map((log, index) => {
    const planned = formatDuration(log.plannedSeconds);
    const elapsed = formatDuration(log.elapsedSeconds);
    const status = log.completed ? "completed" : log.elapsedSeconds > 0 ? "started" : "not completed";
    return `${index + 1}. ${log.itemLabelSnapshot}: planned ${planned}, actual ${elapsed}, ${status}`;
  });

  if (day.comment.trim()) {
    lines.push(`Comment: ${day.comment.trim()}`);
  }

  return lines.join("\n");
}

export function hasPracticeEvidence(day: PracticeDayEvidence) {
  return day.comment.trim().length > 0 || day.itemLogs.some((log) => log.completed || log.elapsedSeconds > 0);
}

export function buildGuitarCoachPrompt(dayLabel: string, evidenceSummary: string, previousPracticeContext = "None available.") {
  return `<system_role>
You are a direct guitar practice coach reviewing one day of practice evidence and recent practice history.
Your job is to identify the bottleneck in consistency, time allocation, avoided work, or practice quality.
Be practical, specific, and concise. Do not motivate. Diagnose.
</system_role>

<core_constraints>
1. Evidence first. Use the practice items, planned time, actual time, completion state, comments, and previous 7 days.
2. Do not invent musical skill level, songs, genres, injuries, or goals that are not in the evidence.
3. Compare planned time versus actual time.
4. Notice avoided or repeatedly skipped practice items, including customized item names.
5. Pick exactly one next practice focus for tomorrow.
6. Keep the output plain text with the exact labels requested below.
</core_constraints>

<analysis_priorities>
1. Consistency across recent days.
2. Avoided practice items.
3. Planned time versus actual time.
4. Time allocation across practice categories.
5. Weak spots and repeated friction.
6. Useful patterns in comments.
7. One current bottleneck.
8. Exactly one next practice focus for tomorrow.
</analysis_priorities>

<formatting_rules>
Return EXACTLY this plain-text structure.
No markdown.
No headings beyond the required labels.

Overview: [1-2 sentences summarizing the day and how it relates to recent practice.]
Practice Evidence: [Specific evidence from planned time, actual time, completed items, skipped items, and comments.]
Pattern Read: [Compare with previous 7 days. Say whether today confirms, improves, breaks, or changes a previous pattern.]
Main Observation: [2-4 direct sentences naming the bottleneck and mechanism.]
Tomorrow Focus: [Exactly one specific practice focus for tomorrow.]
Standard: [One short operational standard.]
</formatting_rules>

Day: ${dayLabel}

Previous 7 Practice Reviews:
${previousPracticeContext}

Practice Evidence:
${evidenceSummary}
`;
}

async function getOrCreateUser(ctx: { prisma: any; userId: string }) {
  return ctx.prisma.user.upsert({
    where: { clerkUserId: ctx.userId },
    update: { clerkUserId: ctx.userId },
    create: { clerkUserId: ctx.userId },
    select: { id: true }
  });
}

async function seedDefaultItemsIfNeeded(ctx: { prisma: any }, userId: string) {
  const existingCount = await ctx.prisma.guitarPracticeItem.count({
    where: { userId }
  });

  if (existingCount > 0) return;

  for (const item of defaultPracticeItems) {
    await ctx.prisma.guitarPracticeItem.upsert({
      where: {
        userId_defaultSeedKey: {
          userId,
          defaultSeedKey: item.seedKey
        }
      },
      update: {
        label: item.label,
        defaultPlannedSeconds: item.defaultPlannedSeconds,
        sortOrder: item.sortOrder
      },
      create: {
        userId,
        defaultSeedKey: item.seedKey,
        label: item.label,
        defaultPlannedSeconds: item.defaultPlannedSeconds,
        sortOrder: item.sortOrder
      },
      select: { id: true }
    });
  }
}

async function upsertPracticeDaySnapshot({
  ctx,
  userId,
  practiceDate,
  comment,
  itemLogs,
  itemLabels
}: {
  ctx: { prisma: any };
  userId: string;
  practiceDate: Date;
  comment: string;
  itemLogs: Array<z.infer<typeof logInput>>;
  itemLabels: Map<string, string>;
}) {
  return ctx.prisma.$transaction(async (tx: any) => {
    const day = await tx.guitarPracticeDay.upsert({
      where: {
        userId_practiceDate: {
          userId,
          practiceDate
        }
      },
      update: { comment },
      create: {
        userId,
        practiceDate,
        comment
      },
      select: { id: true }
    });

    for (const log of itemLogs) {
      const label = itemLabels.get(log.itemId);
      if (typeof label !== "string") throw new TRPCError({ code: "BAD_REQUEST", message: "Practice item does not belong to this user." });

      await tx.guitarPracticeItemLog.upsert({
        where: {
          practiceDayId_practiceItemId: {
            practiceDayId: day.id,
            practiceItemId: log.itemId
          }
        },
        update: {
          itemLabelSnapshot: label,
          plannedSeconds: log.plannedSeconds,
          elapsedSeconds: log.elapsedSeconds,
          completed: log.completed
        },
        create: {
          practiceDayId: day.id,
          practiceItemId: log.itemId,
          itemLabelSnapshot: label,
          plannedSeconds: log.plannedSeconds,
          elapsedSeconds: log.elapsedSeconds,
          completed: log.completed
        },
        select: { id: true }
      });
    }

    return tx.guitarPracticeDay.findFirst({
      where: { id: day.id, userId },
      select: practiceDaySelect
    });
  });
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes === 0) return `${remainder}s`;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}

async function validateUserItems(ctx: { prisma: any }, userId: string, logs: Array<z.infer<typeof logInput>>) {
  const itemIds = [...new Set(logs.map((log) => log.itemId))];
  const items = await ctx.prisma.guitarPracticeItem.findMany({
    where: {
      userId,
      id: { in: itemIds }
    },
    take: maxActiveItems,
    select: {
      id: true,
      label: true
    }
  });

  if (items.length !== itemIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Practice item does not belong to this user." });
  }

  return new Map<string, string>(items.map((item: { id: string; label: string }) => [item.id, item.label]));
}

export const guitarPracticeRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await getOrCreateUser(ctx);
    await seedDefaultItemsIfNeeded(ctx, user.id);

    const [items, days, reviews] = await Promise.all([
      ctx.prisma.guitarPracticeItem.findMany({
        where: { userId: user.id, archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: maxActiveItems,
        select: practiceItemSelect
      }),
      ctx.prisma.guitarPracticeDay.findMany({
        where: { userId: user.id },
        orderBy: { practiceDate: "desc" },
        take: maxRecentDays,
        select: practiceDaySelect
      }),
      ctx.prisma.guitarPracticeReview.findMany({
        where: { userId: user.id },
        orderBy: { dayStart: "desc" },
        take: maxRecentDays,
        select: reviewSelect
      })
    ]);

    return { items, days, reviews };
  }),

  createItem: protectedProcedure
    .input(
      z.object({
        label: z.string().trim().min(1).max(maxLabelChars),
        defaultPlannedSeconds: z.number().int().positive().max(maxPlannedSeconds),
        sortOrder: z.number().int().min(0).max(1_000).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getOrCreateUser(ctx);
      const activeCount = await ctx.prisma.guitarPracticeItem.count({
        where: { userId: user.id, archivedAt: null }
      });

      if (activeCount >= maxActiveItems) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Archive a practice item before adding another." });
      }

      return ctx.prisma.guitarPracticeItem.create({
        data: {
          userId: user.id,
          label: input.label,
          defaultPlannedSeconds: input.defaultPlannedSeconds,
          sortOrder: input.sortOrder ?? activeCount
        },
        select: practiceItemSelect
      });
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        label: z.string().trim().min(1).max(maxLabelChars),
        defaultPlannedSeconds: z.number().int().positive().max(maxPlannedSeconds),
        sortOrder: z.number().int().min(0).max(1_000)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getOrCreateUser(ctx);
      const item = await ctx.prisma.guitarPracticeItem.findFirst({
        where: { id: input.id, userId: user.id },
        select: { id: true }
      });

      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.guitarPracticeItem.update({
        where: { id: item.id },
        data: {
          label: input.label,
          defaultPlannedSeconds: input.defaultPlannedSeconds,
          sortOrder: input.sortOrder
        },
        select: practiceItemSelect
      });
    }),

  archiveItem: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const user = await getOrCreateUser(ctx);
    const item = await ctx.prisma.guitarPracticeItem.findFirst({
      where: { id: input.id, userId: user.id },
      select: { id: true }
    });

    if (!item) throw new TRPCError({ code: "NOT_FOUND" });

    return ctx.prisma.guitarPracticeItem.update({
      where: { id: item.id },
      data: { archivedAt: new Date() },
      select: practiceItemSelect
    });
  }),

  upsertDay: protectedProcedure
    .input(
      z.object({
        dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        comment: z.string().max(maxCommentChars).optional().default(""),
        itemLogs: z.array(logInput).max(maxActiveItems)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getOrCreateUser(ctx);
      const itemLabels = await validateUserItems(ctx, user.id, input.itemLogs);
      const practiceDate = dayKeyToDate(input.dayKey);

      return upsertPracticeDaySnapshot({
        ctx,
        userId: user.id,
        practiceDate,
        comment: input.comment.trim(),
        itemLogs: input.itemLogs,
        itemLabels
      });
    }),

  saveItemTime: protectedProcedure
    .input(
      z.object({
        dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        comment: z.string().max(maxCommentChars).optional(),
        itemId: z.string().uuid(),
        plannedSeconds: z.number().int().positive().max(maxPlannedSeconds),
        elapsedSeconds: z.number().int().min(0).max(maxElapsedSeconds),
        completed: z.boolean()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getOrCreateUser(ctx);
      const item = await ctx.prisma.guitarPracticeItem.findFirst({
        where: { id: input.itemId, userId: user.id },
        select: { id: true, label: true }
      });

      if (!item) throw new TRPCError({ code: "BAD_REQUEST", message: "Practice item does not belong to this user." });

      const practiceDate = dayKeyToDate(input.dayKey);
      const day = await ctx.prisma.guitarPracticeDay.upsert({
        where: {
          userId_practiceDate: {
            userId: user.id,
            practiceDate
          }
        },
        update: input.comment === undefined ? { practiceDate } : { comment: input.comment.trim() },
        create: {
          userId: user.id,
          practiceDate,
          comment: input.comment?.trim() ?? ""
        },
        select: { id: true }
      });

      await ctx.prisma.guitarPracticeItemLog.upsert({
        where: {
          practiceDayId_practiceItemId: {
            practiceDayId: day.id,
            practiceItemId: item.id
          }
        },
        update: {
          itemLabelSnapshot: item.label,
          plannedSeconds: input.plannedSeconds,
          elapsedSeconds: input.elapsedSeconds,
          completed: input.completed
        },
        create: {
          practiceDayId: day.id,
          practiceItemId: item.id,
          itemLabelSnapshot: item.label,
          plannedSeconds: input.plannedSeconds,
          elapsedSeconds: input.elapsedSeconds,
          completed: input.completed
        },
        select: { id: true }
      });

      return ctx.prisma.guitarPracticeDay.findFirst({
        where: { id: day.id, userId: user.id },
        select: practiceDaySelect
      });
    }),

  clearDay: protectedProcedure.input(z.object({ dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).mutation(async ({ ctx, input }) => {
    const user = await getOrCreateUser(ctx);
    const day = await ctx.prisma.guitarPracticeDay.findFirst({
      where: { userId: user.id, practiceDate: dayKeyToDate(input.dayKey) },
      select: { id: true }
    });

    if (!day) return { cleared: true };

    await ctx.prisma.guitarPracticeDay.delete({ where: { id: day.id } });
    return { cleared: true };
  }),

  generateReview: protectedProcedure
    .input(
      z.object({
        dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        label: z.string().max(80)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const requestId = randomUUID();
      const startedAt = Date.now();
      logGuitar("info", requestId, "started", {
        dayKey: input.dayKey,
        label: input.label,
        model,
        user: fingerprint(ctx.userId)
      });

      try {
        const apiKey = process.env.VERTEX_API_KEY;

        if (!apiKey) {
          logGuitar("error", requestId, "missing_vertex_api_key");
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Vertex AI is not configured." });
        }

        const user = await ctx.prisma.user.findUnique({
          where: { clerkUserId: ctx.userId },
          select: { id: true }
        });

        if (!user) throw new TRPCError({ code: "NOT_FOUND" });

        const targetDayStart = dayKeyToDate(input.dayKey);
        const day = await ctx.prisma.guitarPracticeDay.findFirst({
          where: {
            userId: user.id,
            practiceDate: targetDayStart
          },
          select: practiceReviewDaySelect
        });

        if (!day) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Log practice before generating a review." });
        }

        const evidence = {
          practiceDate: day.practiceDate,
          comment: day.comment,
          itemLogs: day.itemLogs
            .filter((log) => log.practiceItem.archivedAt === null)
            .map(({ practiceItem, ...log }) => log)
        };

        if (!hasPracticeEvidence(evidence)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Add practice time or a comment before generating a review." });
        }

        const existingReview = await ctx.prisma.guitarPracticeReview.findFirst({
          where: {
            userId: user.id,
            dayStart: targetDayStart
          },
          select: reviewSelect
        });

        if (existingReview && Date.now() - existingReview.generatedAt.getTime() < reviewCooldownMs) {
          logGuitar("info", requestId, "recent_review_returned", {
            generatedAt: existingReview.generatedAt.toISOString()
          });
          return existingReview;
        }

        if (!claimReviewGeneration(user.id, input.dayKey)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Practice review was generated recently. Try again in a minute." });
        }

        try {
          const previousReviews = await ctx.prisma.guitarPracticeReview.findMany({
            where: {
              userId: user.id,
              dayStart: {
                gte: previousPracticeWindowStart(targetDayStart),
                lt: targetDayStart
              }
            },
            orderBy: { dayStart: "asc" },
            take: previousContextDays,
            select: {
              dayStart: true,
              text: true
            }
          });

          const evidenceSummary = buildPracticeEvidenceSummary(evidence);
          const previousContext = buildPreviousPracticeContext(previousReviews);
          const prompt = buildGuitarCoachPrompt(input.label, evidenceSummary, previousContext);

          logGuitar("info", requestId, "prompt_built", {
            evidenceChars: evidenceSummary.length,
            previousReviewCount: previousReviews.length,
            previousReviewChars: previousContext.length
          });

          const vertexStartedAt = Date.now();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), vertexTimeoutMs);
          let response: Response;

          try {
            response = await fetch(
              `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                signal: controller.signal,
                body: JSON.stringify({
                  contents: [
                    {
                      role: "user",
                      parts: [{ text: prompt }]
                    }
                  ],
                  generationConfig: {
                    temperature: 0.45,
                    thinkingConfig: {
                      thinkingLevel: "LOW"
                    }
                  }
                })
              }
            );
          } catch (error) {
            if (controller.signal.aborted) {
              throw new TRPCError({ code: "BAD_GATEWAY", message: "Guitar practice review could not be generated." });
            }

            throw error;
          } finally {
            clearTimeout(timeout);
          }

          const result = (await response.json()) as VertexResponse;
          const finishReason = result.candidates?.[0]?.finishReason ?? null;

          logGuitar(response.ok ? "info" : "error", requestId, "vertex_response_received", {
            durationMs: Date.now() - vertexStartedAt,
            finishReason,
            status: response.status
          });

          if (!response.ok) {
            throw new TRPCError({
              code: "BAD_GATEWAY",
              message: "Guitar practice review could not be generated."
            });
          }

          const text = getGuitarReviewText(result);

          if (!text || finishReason !== "STOP" || !validateGuitarReviewText(text)) {
            throw new TRPCError({ code: "BAD_GATEWAY", message: "Guitar practice review could not be generated." });
          }

          const review = await ctx.prisma.guitarPracticeReview.upsert({
            where: {
              userId_dayStart: {
                userId: user.id,
                dayStart: targetDayStart
              }
            },
            update: {
              text,
              generatedAt: new Date()
            },
            create: {
              userId: user.id,
              dayStart: targetDayStart,
              text
            },
            select: reviewSelect
          });

          logGuitar("info", requestId, "completed", {
            durationMs: Date.now() - startedAt,
            textChars: text.length
          });

          return review;
        } finally {
          releaseReviewGeneration(user.id, input.dayKey);
        }
      } catch (error) {
        logGuitar("error", requestId, "failed", {
          durationMs: Date.now() - startedAt,
          ...errorDetails(error)
        });
        throw error;
      }
    })
});
