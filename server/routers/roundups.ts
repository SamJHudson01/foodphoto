import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const maxRoundupEntries = 8;
const model = process.env.OPENROUTER_MODEL ?? "google/gemini-3.5-flash";

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

const roundupSelect = {
  id: true,
  dayStart: true,
  text: true,
  generatedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

function getRoundupText(content: unknown) {
  if (typeof content === "string") return content.trim();

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function dayKeyToDate(dayKey: string) {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export const roundupsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { clerkUserId: ctx.userId },
      select: { id: true }
    });

    if (!user) return [];

    return ctx.prisma.dailyRoundup.findMany({
      where: { userId: user.id },
      orderBy: { dayStart: "desc" },
      take: 120,
      select: roundupSelect
    });
  }),

  generate: protectedProcedure
    .input(
      z.object({
        dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start: z.coerce.date(),
        end: z.coerce.date(),
        label: z.string().max(80)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.OPENROUTER_API_KEY;

      if (!apiKey) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OpenRouter is not configured." });
      }

      const user = await ctx.prisma.user.findUnique({
        where: { clerkUserId: ctx.userId },
        select: { id: true }
      });

      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const entries = await ctx.prisma.foodEntry.findMany({
        where: {
          userId: user.id,
          capturedAt: {
            gte: input.start,
            lt: input.end
          }
        },
        orderBy: { capturedAt: "asc" },
        take: maxRoundupEntries,
        select: {
          capturedAt: true,
          note: true,
          publicUrl: true
        }
      });

      if (entries.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one food photo first." });
      }

      const textSummary = entries
        .map((entry, index) => {
          const time = entry.capturedAt.toLocaleTimeString("en-GB", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true
          });
          return `${index + 1}. ${time}${entry.note ? ` - note: ${entry.note}` : ""}`;
        })
        .join("\n");

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://foodphoto-alpha.vercel.app",
          "X-Title": "FoodPhoto"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: [
                    "You are a warm, concise personal food reflection coach.",
                    "Create a daily roundup from the user's food photos and optional notes.",
                    "Do not estimate calories, macros, weight loss, or medical advice.",
                    "Do not moralize food choices. Keep it practical and kind.",
                    "Return plain text only in this shape:",
                    "Overview: one sentence.",
                    "Observations: 2-4 short bullets.",
                    "Tomorrow: one gentle suggestion.",
                    "",
                    `Day: ${input.label}`,
                    "Entries:",
                    textSummary
                  ].join("\n")
                },
                ...entries.map((entry) => ({
                  type: "image_url",
                  image_url: {
                    url: entry.publicUrl
                  }
                }))
              ]
            }
          ],
          temperature: 0.55,
          max_tokens: 420
        })
      });

      const result = (await response.json()) as OpenRouterResponse;

      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: result.error?.message ?? "OpenRouter request failed."
        });
      }

      const text = getRoundupText(result.choices?.[0]?.message?.content);

      if (!text) {
        throw new TRPCError({ code: "BAD_GATEWAY", message: "OpenRouter returned an empty roundup." });
      }

      return ctx.prisma.dailyRoundup.upsert({
        where: {
          userId_dayStart: {
            userId: user.id,
            dayStart: dayKeyToDate(input.dayKey)
          }
        },
        update: {
          text,
          generatedAt: new Date()
        },
        create: {
          userId: user.id,
          dayStart: dayKeyToDate(input.dayKey),
          text
        },
        select: roundupSelect
      });
    })
});
