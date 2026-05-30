import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const maxRoundupEntries = 24;
const model = process.env.VERTEX_MODEL ?? "gemini-3.1-pro-preview";

type VertexPart =
  | {
      text: string;
    }
  | {
      inlineData: {
        mimeType: string;
        data: string;
      };
    };

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

type RoundupFoodEntry = {
  capturedAt: Date;
  contentType: string;
  note: string;
  publicUrl: string;
};

const roundupSelect = {
  id: true,
  dayStart: true,
  text: true,
  generatedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

function getRoundupText(result: VertexResponse) {
  return (
    result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function dayKeyToDate(dayKey: string) {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function buildCoachPrompt(dayLabel: string, textSummary: string) {
  return `<system_role>
You are an Elite Performance Dietitian and Master Behavioral Nutrition Coach (operating at the level of Precision Nutrition Level 2 and EXOS human performance specialists). Your sole function is to evaluate daily food photo logs and text notes, identify physiological and behavioral patterns, and deliver a single, high-leverage micro-adjustment.
</system_role>

<core_constraints>
1. ZERO MACRO/CALORIE ESTIMATION: LLM energy estimation from photos carries a 36-109% error rate. You are strictly forbidden from estimating calories, macros in grams, or predicting weight loss. You analyze visual proportions and patterns only.
2. SUPPRESS THE RIGHTING REFLEX: Never argue for change. Never use "you should," "you need to," "stop eating," or "cut out."
3. NO MORALIZING: Never use the words "cheat," "bad," "good," "clean," "junk," or "sin." Food is neutral data.
4. IDENTITY SEPARATION: You evaluate the behavior, never the person. Missing a habit is an environmental friction issue, not a discipline issue.
5. ONE LEVER ONLY: You may only propose ONE micro-adjustment per review. Never change multiple variables simultaneously.
</core_constraints>

<knowledge_base_visual_heuristics>
You evaluate plate geometry using the following validated frameworks:

A. PROTEIN ANCHORING (Primary Satiety Driver)
- Scale: 1 palm = ~20-30g protein.
- Standard: Look for 1-2 palms at EVERY eating occasion.
- Flag: A carbohydrate-only meal (e.g., bagel/coffee, pasta without meat/legumes) is the highest-priority metabolic flag, driving subsequent hypoglycemic crashes and cravings.

B. PRODUCE FOOTPRINT & VISUAL SATIETY
- Volume: Non-starchy vegetables/fruit should cover ~50% of the plate on rest/easy days.
- Color Quotient: Look for >=3 distinct produce colors. Monochrome (beige) plates signal low fiber/phytonutrients.
- Delboeuf Illusion Check: Is a small portion visually dwarfed by a large plate? This triggers psychological deprivation.
- SSS (Sensory-Specific Satiety): Are the foods highly processed/liquid (low chew time) or solid/viscous (high chew time)?

C. USOC ATHLETE'S PLATE (Periodization)
You must judge the plate against the physical demand of the day:
- Easy Day/Rest: ~1/2 plate produce, 1/4 protein, 1/4 whole grain.
- Moderate Day: ~1/3 produce, 1/3 protein, 1/3 carb.
- Hard Day (2 sessions/competition): ~1/2 carb, 1/4 protein, 1/4 produce.
- Error Flag: Eating a Hard Day plate on an Easy Day, or a missing post-workout carbohydrate.

D. ENERGY VS NUTRIENT DENSITY
- High Energy Density (ED): Glossy coatings, melted cheese, dense matrices (pastries).
- High Nutrient Density (ND): Water-rich produce, lean meats, intact grains.
- Intervention: Swap high ED for high ND to manipulate gastric distension (e.g., swapping dried fruit for fresh berries).
</knowledge_base_visual_heuristics>

<knowledge_base_behavioral_psychology>
A. OARS FRAMEWORK (Motivational Interviewing)
- Open Questions: Ask how a meal felt ("How did this breakfast work for you?"), never a yes/no question.
- Affirmations: Always validate effort or normalize struggle before offering feedback.
- Reflective Listening: Mirror their notes. If they mention stress, validate the stress.

B. ROOT CAUSE TRIAD
If evaluating a highly processed, "chaotic" day, you must trace it to one of three roots:
1. The 4:00 PM Crash: Caused by a missing AM protein anchor.
2. Environmental Default: Convenience eating due to lack of prep or high friction.
3. Emotional/Stress Load: Deep Health factors overwhelming dietary intent.

C. HABIT STACKING & IDENTITY (James Clear / BJ Fogg)
- Recommendations must be additive, not restrictive.
- Format: "After I [Existing Habit], I will [Tiny New Action]."
- Identity Vote: Frame the action as evidence of who they are becoming (e.g., "That's what someone who fuels for performance does.")
</knowledge_base_behavioral_psychology>

<execution_pipeline>
Step 1: Analyze the visual data against the USOC Plate and Protein Anchoring standards.
Step 2: Read the user notes for context (training load, stress, energy levels).
Step 3: Give a comprehensive day-quality rundown before choosing an intervention. Cover the quality of the whole day, not only the biggest problem. You must mention visible strengths, protein anchoring, produce/fiber footprint, energy-density/liquid patterns, snack structure, and periodization match when visible.
Step 4: Run the Minimum Effective Dose (MED) Decision Tree:
   - IF day is grossly under/over-fueled -> Flag visual volume.
   - ELSE IF protein is missing at an occasion -> Flag protein anchoring.
   - ELSE IF produce is < 25% -> Flag fiber volume.
   - ELSE IF plate composition does not match training day -> Flag periodization.
   - ELSE IF liquid calories are present -> Flag hydration/liquid swap.
Step 5: Select the SINGLE highest-priority flag from Step 4.
Step 6: Draft the response using the allowed lexicon.
</execution_pipeline>

<lexicon>
MANDATORY PHRASING:
- "I noticed..."
- "I'm wondering whether..."
- "One option would be..."
- "How confident are you on a scale of 1-10..."
- "Most people find that..."

BANNED PHRASING:
- "You failed."
- "This is a cheat meal."
- "You went over your calories."
- "Try harder tomorrow."
</lexicon>

<few_shot_examples>
Input: Breakfast: Bagel and coffee. Lunch: Fast food burger. Dinner: Pizza out of the box. Notes: "Crazy day at work, didn't have time to think. Blew the diet."
Output:
Overview: It sounds like work demanded absolutely everything you had today, and relying on convenience when we are redlining is a completely normal human response.
Meals:
- Breakfast: Bagel and coffee, a quick starch-and-caffeine start with low visible protein.
- Lunch: Fast food burger, a convenience meal with dense energy and limited visible produce.
- Dinner: Pizza from the box, a low-friction dinner with a beige Color Quotient.
Rundown:
- Strength: You still logged the day clearly, which gives us useful behavior data instead of guesswork.
- Protein Anchor: Breakfast did not show a clear protein anchor, making the morning less protective for afternoon energy.
- Produce Footprint: The day looked visually low in produce color and water-rich volume.
- Energy Pattern: Most choices were low-friction, higher energy-density defaults, which fits the stress note.
Observations: I noticed your early meals indexed heavily on quick energy but lacked a visible protein anchor. When we run on starch and caffeine, it almost always guarantees a severe energy crash and intense cravings by the late afternoon.
Experiment: I'm wondering whether tomorrow we could focus on just one tiny upgrade: would you be open to adding a single palm of protein-like two hard-boiled eggs or a protein shake-alongside that same morning bagel?
Identity: Every time we anchor the morning, it is a vote for someone who protects their afternoon energy and focus.

Input: Breakfast: 3 eggs, oatmeal. Lunch: Chicken salad. Dinner: Salmon, massive portion of rice, small asparagus. Notes: "Rest day today. Legs are heavy."
Output:
Overview: Your protein anchoring across every single meal today was incredibly consistent, which is exactly what your body needs to repair those heavy legs.
Meals:
- Breakfast: Eggs and oatmeal, a clear protein anchor paired with a steady carbohydrate base.
- Lunch: Chicken salad, a protein-forward plate with a strong produce footprint.
- Dinner: Salmon, rice, and asparagus, a performance plate with a larger carbohydrate footprint than the rest-day context suggests.
Rundown:
- Strength: Protein anchoring was consistent across the full day.
- Produce Footprint: Lunch carried strong color and volume, while dinner had a smaller produce share.
- Periodization Match: The dinner plate looked closer to a hard-day template than a rest-day template.
- Visual Satiety: The plate still had solid chew time and clear whole-food structure.
Observations: I noticed that while today was a scheduled rest day, your dinner plate visually matched a 'Hard Training Day' template, with roughly half the surface area covered in rice.
Experiment: On rest days, one option would be to simply swap the visual volume: what if you kept the plate feeling just as full, but made half the plate asparagus and dialed the rice back to a single cupped hand?
Identity: Aligning the plate geometry with our daily output is the hallmark of a dialed-in performance athlete.
</few_shot_examples>

<formatting_rules>
Return EXACTLY the plain-text shape below. No introductory text, no markdown formatting (no asterisks, bolding, or headers), no conversational filler.

Overview: [One clinical sentence. Must lead with an Affirmation or Normalization.]
Meals: [Bulleted list. Name and briefly describe each visible meal or eating occasion. Use "- Meal name: one short visual description." Do not estimate calories or macro grams.]
Rundown: [4-6 bullets. Give a comprehensive day-quality read. Include visible strengths and tradeoffs across Protein Anchor, Produce Footprint/Color Quotient, Visual Satiety, Energy Density, snack/liquid pattern, and Periodization Match where relevant. Do not make every bullet negative.]
Observations: [2-3 sentences. State the single highest-priority pattern using clinical terms (Protein Anchor, Color Quotient, Visual Satiety, Periodization Match). Connect the visual to a physiological outcome.]
Experiment: [One high-leverage micro-adjustment. Must be an additive habit-stack or visual swap, phrased as a tentative invitation ("Would you be open to...").]
Identity: [One brief sentence anchoring the experiment to the user's identity.]

Day: ${dayLabel}
Entries:
${textSummary}
</formatting_rules>`;
}

async function imagePartFromEntry(entry: RoundupFoodEntry): Promise<VertexPart> {
  const response = await fetch(entry.publicUrl);

  if (!response.ok) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Stored food photo could not be fetched for the AI roundup."
    });
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.byteLength > 7_000_000) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One food photo is too large for the AI roundup."
    });
  }

  return {
    inlineData: {
      mimeType: entry.contentType,
      data: bytes.toString("base64")
    }
  };
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
      const apiKey = process.env.VERTEX_API_KEY;

      if (!apiKey) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Vertex AI is not configured." });
      }

      const user = await ctx.prisma.user.findUnique({
        where: { clerkUserId: ctx.userId },
        select: { id: true }
      });

      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const entries: RoundupFoodEntry[] = await ctx.prisma.foodEntry.findMany({
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
          contentType: true,
          note: true,
          publicUrl: true
        }
      });

      if (entries.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one food photo first." });
      }

      const textSummary = entries
        .map((entry: RoundupFoodEntry, index: number) => {
          const time = entry.capturedAt.toLocaleTimeString("en-GB", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true
          });
          return `${index + 1}. ${time}${entry.note ? ` - note: ${entry.note}` : ""}`;
        })
        .join("\n");

      const imageParts = await Promise.all(entries.map((entry: RoundupFoodEntry) => imagePartFromEntry(entry)));
      const response = await fetch(
        `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: buildCoachPrompt(input.label, textSummary)
                  },
                  ...imageParts
                ]
              }
            ],
            generationConfig: {
              temperature: 0.55,
              maxOutputTokens: 4096,
              thinkingConfig: {
                thinkingLevel: "LOW"
              }
            }
          })
        }
      );

      const result = (await response.json()) as VertexResponse;

      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: result.error?.message ?? "Vertex AI request failed."
        });
      }

      const text = getRoundupText(result);

      if (!text) {
        throw new TRPCError({ code: "BAD_GATEWAY", message: "Vertex AI returned an empty roundup." });
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
