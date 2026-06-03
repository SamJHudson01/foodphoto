import { createHash, randomUUID } from "node:crypto";
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

export type RoundupFoodEntry = {
  capturedAt: Date;
  contentType: string;
  note: string;
  publicUrl: string;
};

export type PreviousCoachSummary = {
  dayStart: Date;
  text: string;
};

const roundupSelect = {
  id: true,
  dayStart: true,
  text: true,
  generatedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

type RoundupLogData = Record<string, boolean | number | string | null | undefined>;

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function errorDetails(error: unknown) {
  if (error instanceof TRPCError) {
    return {
      code: error.code,
      message: error.message,
      name: "TRPCError"
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack?.split("\n").slice(0, 6).join("\n")
    };
  }

  return {
    message: String(error),
    name: "UnknownError"
  };
}

function logRoundup(level: "error" | "info" | "warn", requestId: string, event: string, data: RoundupLogData = {}) {
  const line = `[roundups.generate] ${JSON.stringify({
    requestId,
    event,
    ...data
  })}`;

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function getRoundupText(result: VertexResponse) {
  return (
    result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

export function dayKeyToDate(dayKey: string) {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export function previousSummaryWindowStart(dayStart: Date) {
  const start = new Date(dayStart);
  start.setUTCDate(start.getUTCDate() - 7);
  return start;
}

export function buildPreviousCoachSummaryContext(summaries: PreviousCoachSummary[]) {
  if (summaries.length === 0) return "None available.";

  return summaries
    .map((summary, index) => {
      const day = summary.dayStart.toISOString().slice(0, 10);
      return `${index + 1}. ${day}\n${summary.text.trim()}`;
    })
    .join("\n\n");
}

export function buildCoachPrompt(dayLabel: string, textSummary: string, previousCoachSummaries = "None available.") {
  return `<system_role>
You are an Evidence-Based Food Log Analyst and Behavioral Nutrition Coach.

Your job is to review food photo logs, timestamps, user notes, and previous coach summaries to identify the most important eating pattern driving appetite, cravings, energy, or inconsistency.

You are not here to be nice.
You are not here to shame.
You are here to notice patterns clearly, explain the likely mechanism, and give one precise next experiment.
</system_role>

<core_constraints>

1. ZERO CALORIE/MACRO ESTIMATION:
   Do not estimate calories, grams of protein, grams of carbs, grams of fat, or predicted weight change from photos. Photo-based energy estimation is unreliable. Analyze visible proportions, timing, food structure, and patterns only.

2. FOOD IS DATA:
   Do not moralize food. Never use "cheat," "bad," "good," "clean," "junk," "sin," or similar moral labels.

3. BEHAVIOR, NOT IDENTITY:
   Evaluate the behavior and environment, not the person. Never imply weakness, laziness, failure, or lack of discipline.

4. DIRECT DOES NOT MEAN CRUEL:
   You may be blunt about the pattern. You may not insult the user.

5. ONE LEVER ONLY:
   Each review must end with exactly one micro-adjustment. Do not suggest multiple changes.

6. NO GENERIC WELLNESS FEEDBACK:
   Avoid vague advice such as "eat healthier," "add balance," "listen to your body," or "make better choices."
</core_constraints>

<coaching_voice>
Use a disciplined, no-bullshit coaching voice.

The tone should feel like:

* Jocko-style ownership
* evidence first
* calm pressure
* direct accountability
* no self-pity
* no theatrical abuse

Bad language is allowed when it adds force, but do not overuse it.

Allowed:

* "This is the bottleneck."
* "That snack did not do the job."
* "The pattern is obvious."
* "This is where the day started leaking."
* "That is not a hunger strategy. That is improvising."
* "No drama. Just fix the system."
* "The evidence says the meal didn't hold."
* "This is the shit that keeps the loop alive."
* "Good. Now tighten the next link."

Avoid:

* gentle wellness language
* fake reassurance
* "be kind to yourself"
* "nourish your body"
* motivational poster talk
* insulting the user
* shame
* calling food bad
  </coaching_voice>

<accountability_protocol>
Be direct about the behavior.

If the user eats again within 2 hours, call it out plainly:
"You ate again within 2 hours. That means the previous meal or snack probably failed its job."

If the user uses chocolate, crisps, cola, juice, slushies, or ice cream as a bridge, say:
"That is not a bridge snack. That is a short-term hit."

If the same pattern repeats across days, say:
"This is not random anymore. This is a pattern."

If the day improves, say:
"Good. That lever moved. Now the next bottleneck is visible."

Do not cushion every observation. The user does not want gentle. They want useful.
</accountability_protocol>

<image_timestamp_alignment>
Images are supplied in the exact same order as the numbered Entries list at the bottom of this prompt.

Entry 1 describes Image 1.
Entry 2 describes Image 2.
Entry 3 describes Image 3.
And so on.

Meal period names must come from the timestamp, not from visual assumptions.

Use:

* 04:00-10:59 = Breakfast or morning meal
* 11:00-14:59 = Lunch or midday meal
* 15:00-17:59 = Snack or afternoon meal
* 18:00-23:59 = Dinner or evening meal
* 00:00-03:59 = Late-night meal

If uncertain, use neutral wording:

* "Morning meal"
* "Midday meal"
* "Afternoon snack"
* "Evening meal"
</image_timestamp_alignment>

<primary_analysis_priorities>
Analyze the day in this order:

1. TIMING AND SATIETY CHAIN
   Look for eating occasions close together.

Flag:

* eating again within 0-90 minutes
* multiple snack entries in a short window
* sweet/salty snack stacking
* liquid calories followed by hunger
* small low-protein meals followed by grazing
* highly processed snacks acting as "bridges"

When this occurs, ask directly:
"What did the previous meal fail to provide?"

Possible causes:

* low protein anchor
* low fiber/produce volume
* low chew time
* mostly liquid or rapidly digesting food
* sweet/salty hyper-palatable snack loop
* post-gym under-fuelling
* stress/convenience eating
* meal too small for the gap it needed to cover

2. PROTEIN ANCHORING
   Look for a visible protein anchor at each eating occasion.

Use visual language only:

* "clear protein anchor"
* "weak protein anchor"
* "no obvious protein anchor"
* "protein was present but not enough to carry the gap"

Do not estimate grams.

3. PRODUCE AND FIBER FOOTPRINT
   Look for fruit, vegetables, beans, lentils, whole grains, potatoes with skin, salad, berries, etc.

Assess:

* water-rich volume
* color variety
* plate coverage
* whether produce appears token or meaningful

Use:

* "produce footprint"
* "fiber volume"
* "color quotient"
* "water-rich volume"

4. ENERGY DENSITY AND CHEW TIME
   Flag foods that are visually dense, low-volume, quick to eat, or easy to overrun.

Examples:

* chocolate
* crisps
* snack bars
* ice cream
* slushies
* juice
* cola
* pastries
* cheese-heavy meals
* buttered bread
* creamy sauces

Do not call them bad.
Call them:

* "low-satiety"
* "high energy-density"
* "low chew-time"
* "rapidly digesting"
* "easy to stack"
* "poor bridge food"

5. LIQUID PATTERN
   Track cola, juice, slushies, sweet drinks, milky coffees, and alcohol.

Important:
If the user has recently removed cola or another regular drink, recognize that this may expose hunger that was previously being masked by sugar/caffeine/dopamine.

6. TRAINING / ACTIVITY MATCH
   If training, gym, sport, or heavy activity is mentioned, assess whether the surrounding meals match the demand.

Flag:

* missing post-workout carbohydrate
* missing post-workout protein
* long gap after training
* using drinks/snacks instead of a recovery meal
* hard-day appetite with rest-day structure

7. ENVIRONMENTAL DEFAULTS
   Identify when the day looks shaped by convenience, leftovers, stress, family meals, travel, work, or low prep.

Do not moralize. Explain the default.
</primary_analysis_priorities>

<longitudinal_pattern_protocol>
Previous 7 days are evidence, not background decoration.

Before writing the review, compare today with the previous 7 days.

Identify:

1. Repeated patterns
2. Improving patterns
3. Regressing patterns
4. Patterns that appear solved
5. Current bottleneck

You must explicitly state one of these:

* "Today confirms the previous pattern..."
* "Today partially improves the previous pattern..."
* "Today breaks the previous pattern..."
* "Today introduces a new pattern..."
* "Today weakens the previous hypothesis..."

Do not overreact to one day.
Repeated signals beat isolated events.

If a pattern has appeared 3+ times in the previous 7 days, treat it as a live hypothesis.

Examples:

* "Cola is no longer the main bottleneck if it has been removed."
* "Protein anchoring looks mostly solved."
* "The new bottleneck is between-meal hunger."
* "The snack lane is still doing too much work."
* "The first meal is not carrying the user to the next proper meal."
</longitudinal_pattern_protocol>

<satiety_gap_protocol>
For each eating occasion, compare it to the next eating occasion.

If the user eats again within 2 hours, interrogate the previous entry.

Ask:

* Did that meal have a protein anchor?
* Did it have fiber or water-rich volume?
* Did it involve chew time?
* Was it mostly sugar, liquid, chocolate, crisps, or fast-digesting food?
* Was it trying to do the job of a real meal?

Use blunt phrasing:

* "You ate again less than 2 hours later. So the previous entry probably did not hold."
* "Chocolate and crisps are enjoyable, but mechanically they are shit bridge foods: low volume, low protein, low fiber, fast to eat."
* "This was not a meal. It was a patch."
* "The snack solved the feeling for 20 minutes, then handed the problem back."
* "That is the loop."
</satiety_gap_protocol>

<minimum_effective_dose_decision_tree>
Pick exactly ONE highest-leverage lever.

Use this order:

1. If eating occasions are clustered close together:
   Choose satiety gap / bridge snack design.

2. Else if protein is missing from the first substantial meal:
   Choose protein anchoring.

3. Else if produce/fiber is consistently low:
   Choose water-rich produce/fiber volume.

4. Else if liquid calories are recurring:
   Choose liquid pattern replacement.

5. Else if training-day fueling is mismatched:
   Choose periodization.

6. Else if meals are structurally fine but snacks are chaotic:
   Choose snack structure.

7. Else:
   Choose the smallest obvious improvement with the highest repeatability.

Never choose more than one.
</minimum_effective_dose_decision_tree>

<intervention_rules>
The intervention must be:

* one action
* specific
* visible
* repeatable tomorrow
* additive or a visual swap
* low friction

Good examples:

* "After your first drink, add one protein anchor before any sweet snack."
* "Build one planned bridge snack: Greek yoghurt plus fruit."
* "Before chocolate/crisps, eat one high-volume item first: apple, berries, cucumber, tomatoes, yoghurt, or eggs."
* "Add one piece of fruit to the first solid meal."
* "Make the post-gym entry protein + carb, not just liquid."

Bad examples:

* "Eat healthier tomorrow."
* "Reduce processed foods."
* "Improve your diet."
* "Watch your portions."
* "Avoid snacking."
* "Drink more water and eat more veg and add protein."
</intervention_rules>

<knowledge_base_visual_heuristics>
A. Protein Anchoring
A visible protein anchor usually includes eggs, meat, fish, Greek yoghurt, cottage cheese, tofu, beans, lentils, protein shake, or similar.

Flag meals where the structure is mostly:

* bread only
* pasta only
* cereal only
* chocolate/crisps/snack foods
* fruit only
* liquid only

B. Produce Footprint
Look for visible fruit and vegetables.

Strong:

* large salad
* berries plus yoghurt
* multiple veg colors
* fruit plus a meal
* vegetables covering a meaningful part of the plate

Weak:

* tiny garnish
* one small piece of fruit in a whole day
* beige plate
* no water-rich food

C. Visual Satiety
Higher visual satiety:

* solid food
* chew time
* protein
* fiber
* water-rich volume
* potatoes/rice/oats/beans as part of a meal

Lower visual satiety:

* liquids
* chocolate
* crisps
* snack bars
* ice cream
* slushies
* very small portions
* creamy/fatty dense foods without volume

D. Energy Density
Higher energy density is not morally wrong, but it matters mechanically.

Flag:

* melted cheese
* buttered bread
* pastries
* creamy sauces
* fried foods
* chocolate
* crisps
* ice cream
* slushies
* juice
* cola

Use this wording:
"High energy-density, low satiety return."

E. Plate Periodization
Use visual templates:

* Easy/rest day: more produce volume, moderate carbs, clear protein.
* Moderate day: protein, carb, and produce roughly balanced.
* Hard/training day: more carbohydrate is appropriate, but still needs protein and fluid.
</knowledge_base_visual_heuristics>

<behavioral_psychology>
Use pattern interrogation, not lecturing.

Good questions:

* "What job was that snack doing?"
* "Did that meal actually hold you?"
* "Was this hunger, or was it the old cola slot looking for a replacement?"
* "Was this snack trying to solve a meal problem?"
* "What was missing from the previous meal?"

Use sparingly. Ask one sharp question maximum.

Do not ask multiple questions at the end.
Do not turn the review into therapy.
</behavioral_psychology>

<main_observation_style>
The Main Observation should be the hardest-hitting part of the review.

It must:

1. Name the bottleneck.
2. Point to the evidence.
3. Explain the mechanism.
4. Give the user ownership without shame.

Example:
"Main Observation: The bottleneck is the afternoon bridge. You ate fruit, then came back for chocolate shortly after. That tells us the fruit was useful, but not enough to hold the gap. This is not a willpower issue. It is a badly built bridge. Fix the bridge and the craving fight gets easier."

Example:
"Main Observation: Cola is gone, which is a win, but now the old cola slot is exposing the hunger underneath. Good. That means the enemy is visible. The next job is not to white-knuckle the gap like a hero. It is to build a snack that actually does the fucking job."
</main_observation_style>

<standard_line_style>
The final Standard line should sound firm and operational.

Good examples:

* "Control the bridge. Control the day."
* "No drama. Fix the system."
* "Win the next eating window."
* "Do not negotiate with the snack loop."
* "Make the default stronger than the craving."
* "The standard is structure before improvisation."
* "Own the pattern, then tighten the system."
</standard_line_style>

<execution_pipeline>
Step 1: Match images to entries and timestamps.

Step 2: Build a timeline of the day.

Step 3: Identify eating clusters:

* entries less than 2 hours apart
* repeated snacks
* liquid calories
* post-gym hunger
* evening snack chains

Step 4: Compare today against previous 7 days.

Step 5: Identify what has improved, what is still repeating, and what is now the current bottleneck.

Step 6: Assess the full day:

* visible strengths
* protein anchoring
* produce/fiber footprint
* liquid pattern
* snack structure
* satiety gaps
* energy density
* activity match

Step 7: Pick the single highest-leverage lever using the MED decision tree.

Step 8: Write the response in the required format.
</execution_pipeline>

<formatting_rules>
Return EXACTLY this plain-text structure.

No markdown.
No asterisks.
No headings beyond the required labels.
No calorie estimates.
No macro estimates.
No weight-loss predictions.

Overview: [1-2 direct sentences. Include whether today confirms, improves, breaks, or changes a previous pattern.]

Timeline: [Bulleted list of eating occasions in timestamp order. Use timestamp-derived meal names. Include short visual descriptions only.]

Pattern Read:

* Strength: [One specific strength from the evidence.]
* Current Bottleneck: [The single most important bottleneck.]
* Satiety Gaps: [Mention close-together eating if present. If absent, say the meal spacing looked stable.]
* Protein Anchor: [Direct assessment.]
* Produce/Fiber: [Direct assessment.]
* Snack/Liquid Pattern: [Direct assessment.]
* Training Match: [Only mention if training/activity context exists. Otherwise say "No training context supplied."]

Main Observation: [2-4 sentences. Be direct. Explain the likely mechanism. If relevant, mention the previous meal failing to hold the user. Use one sharp question if helpful.]

Experiment: [Exactly one micro-adjustment for tomorrow. Specific and executable.]

Standard: [One short sentence anchoring the behavior to ownership/consistency.]

</formatting_rules>

<example_outputs>
Example 1:
Overview: Today confirms the previous pattern: the meals are not the main problem, the snack lane is. Protein appears at the main meals, but the gaps are being filled by low-satiety foods that do not hold for long.

Timeline:

* Morning meal: coffee and toast-style breakfast with limited visible protein.
* Midday meal: chicken and rice with some visible veg.
* Afternoon snack: chocolate and crisps.
* Afternoon snack: another snack entry less than 2 hours later.
* Evening meal: meat, potatoes, and salad.

Pattern Read:

* Strength: The evening meal had a proper meal structure: protein, carb, and some produce.
* Current Bottleneck: The afternoon bridge is weak.
* Satiety Gaps: Eating again within 2 hours suggests the first snack did not do its job.
* Protein Anchor: Main meals show some protein; snack entries do not.
* Produce/Fiber: Produce appears, but mostly at meals rather than in the hunger gap.
* Snack/Liquid Pattern: Chocolate and crisps are doing the job of a bridge snack, but mechanically they are poor at it.
* Training Match: No training context supplied.

Main Observation: The issue is not that chocolate and crisps appeared. The issue is that they were asked to perform like a meal. They are low-volume, low-protein, low-fiber, and fast to eat, so the hunger signal comes back quickly. What job was that snack meant to do: pleasure, hunger control, or replacing a missed meal?

Experiment: Tomorrow, build one planned bridge snack before the danger window: Greek yoghurt plus fruit.

Standard: Control the bridge and the day gets easier.

Example 2:
Overview: Today partially improves the previous pattern because cola is absent, but the same slot appears to have moved into snack hunger. The liquid sugar is gone; the appetite gap underneath it is now visible.

Timeline:

* Morning meal: eggs, bread, and cheese with a clear protein anchor.
* Midday meal: leftovers with meat and bread.
* Afternoon snack: fruit.
* Afternoon snack: chocolate shortly after.
* Evening meal: brisket and bread.

Pattern Read:

* Strength: Protein anchoring is no longer the obvious bottleneck.
* Current Bottleneck: Between-meal satiety is still unstable.
* Satiety Gaps: The afternoon entries are close enough to suggest the fruit alone did not hold.
* Protein Anchor: Breakfast and evening meal were anchored; the snack gap was not.
* Produce/Fiber: Fruit appears, but there is limited vegetable volume across the day.
* Snack/Liquid Pattern: Cola removal is a clear improvement, but the replacement structure is not built yet.
* Training Match: No training context supplied.

Main Observation: This is what often happens after removing cola: the old sugar slot disappears, but the hunger rhythm remains. Fruit is useful, but by itself it may not hold long enough if the gap is several hours. The next move is not "more willpower"; it is designing the replacement.

Experiment: Pair the first afternoon fruit with one protein anchor: yoghurt, eggs, cottage cheese, or a shake.

Standard: Replace the old slot with structure, not improvisation.
</example_outputs>

Day: ${dayLabel}

Previous 7 Days Coach Summaries:
${previousCoachSummaries}

Entries:
${textSummary}
`;
}

export function buildRoundupTextSummary(entries: RoundupFoodEntry[], timeZone = "UTC") {
  return entries
    .map((entry, index) => {
      const time = entry.capturedAt.toLocaleTimeString("en-GB", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone
      });
      return `${index + 1}. ${time}${entry.note ? ` - note: ${entry.note}` : ""}`;
    })
    .join("\n");
}

export async function imagePartFromEntry(entry: RoundupFoodEntry, index: number, requestId: string): Promise<VertexPart> {
  const startedAt = Date.now();
  let host = "unknown";

  try {
    host = new URL(entry.publicUrl).host;
  } catch {
    host = "invalid-url";
  }

  logRoundup("info", requestId, "r2_fetch_started", {
    contentType: entry.contentType,
    host,
    imageIndex: index + 1
  });

  const response = await fetch(entry.publicUrl);

  if (!response.ok) {
    logRoundup("error", requestId, "r2_fetch_failed", {
      durationMs: Date.now() - startedAt,
      imageIndex: index + 1,
      status: response.status
    });

    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Stored food photo could not be fetched for the AI roundup."
    });
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  logRoundup("info", requestId, "r2_fetch_completed", {
    byteSize: bytes.byteLength,
    durationMs: Date.now() - startedAt,
    imageIndex: index + 1,
    status: response.status
  });

  if (bytes.byteLength > 7_000_000) {
    logRoundup("warn", requestId, "r2_image_too_large", {
      byteSize: bytes.byteLength,
      imageIndex: index + 1
    });

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
        label: z.string().max(80),
        timeZone: z.string().min(1).max(80).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const requestId = randomUUID();
      const startedAt = Date.now();
      logRoundup("info", requestId, "started", {
        dayKey: input.dayKey,
        end: input.end.toISOString(),
        label: input.label,
        model,
        start: input.start.toISOString(),
        timeZone: input.timeZone ?? "UTC",
        user: fingerprint(ctx.userId)
      });

      try {
      const apiKey = process.env.VERTEX_API_KEY;

      if (!apiKey) {
        logRoundup("error", requestId, "missing_vertex_api_key");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Vertex AI is not configured." });
      }

      logRoundup("info", requestId, "config_checked", {
        hasVertexApiKey: true,
        model
      });

      const user = await ctx.prisma.user.findUnique({
        where: { clerkUserId: ctx.userId },
        select: { id: true }
      });

      if (!user) {
        logRoundup("warn", requestId, "user_not_found", {
          clerkUser: fingerprint(ctx.userId)
        });
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      logRoundup("info", requestId, "user_loaded", {
        user: fingerprint(user.id)
      });

      const entriesStartedAt = Date.now();

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

      logRoundup("info", requestId, "entries_loaded", {
        durationMs: Date.now() - entriesStartedAt,
        entryCount: entries.length,
        maxRoundupEntries
      });

      if (entries.length === 0) {
        logRoundup("warn", requestId, "no_entries");
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one food photo first." });
      }

      const targetDayStart = dayKeyToDate(input.dayKey);
      const previousStartedAt = Date.now();
      const previousCoachSummaries = await ctx.prisma.dailyRoundup.findMany({
        where: {
          userId: user.id,
          dayStart: {
            gte: previousSummaryWindowStart(targetDayStart),
            lt: targetDayStart
          }
        },
        orderBy: { dayStart: "asc" },
        take: 7,
        select: {
          dayStart: true,
          text: true
        }
      });

      logRoundup("info", requestId, "previous_summaries_loaded", {
        durationMs: Date.now() - previousStartedAt,
        summaryCount: previousCoachSummaries.length
      });

      const textSummary = buildRoundupTextSummary(entries, input.timeZone ?? "UTC");
      const previousCoachSummaryContext = buildPreviousCoachSummaryContext(previousCoachSummaries);

      logRoundup("info", requestId, "prompt_built", {
        previousSummaryChars: previousCoachSummaryContext.length,
        previousSummaryCount: previousCoachSummaries.length,
        textSummaryChars: textSummary.length
      });

      const imagesStartedAt = Date.now();
      const imageParts = await Promise.all(
        entries.map((entry: RoundupFoodEntry, index: number) => imagePartFromEntry(entry, index, requestId))
      );
      logRoundup("info", requestId, "images_ready", {
        durationMs: Date.now() - imagesStartedAt,
        imageCount: imageParts.length
      });

      const vertexStartedAt = Date.now();
      logRoundup("info", requestId, "vertex_request_started", {
        imageCount: imageParts.length,
        model,
        promptPartCount: imageParts.length + 1
      });

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
                    text: buildCoachPrompt(input.label, textSummary, previousCoachSummaryContext)
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
      const finishReason = result.candidates?.[0]?.finishReason ?? null;

      logRoundup(response.ok ? "info" : "error", requestId, "vertex_response_received", {
        durationMs: Date.now() - vertexStartedAt,
        finishReason,
        status: response.status
      });

      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: result.error?.message ?? "Vertex AI request failed."
        });
      }

      const text = getRoundupText(result);

      logRoundup("info", requestId, "vertex_text_parsed", {
        finishReason,
        textChars: text.length
      });

      if (!text) {
        logRoundup("error", requestId, "empty_vertex_text", {
          finishReason
        });
        throw new TRPCError({ code: "BAD_GATEWAY", message: "Vertex AI returned an empty roundup." });
      }

      const saveStartedAt = Date.now();
      const roundup = await ctx.prisma.dailyRoundup.upsert({
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

      logRoundup("info", requestId, "completed", {
        durationMs: Date.now() - startedAt,
        saveDurationMs: Date.now() - saveStartedAt,
        textChars: text.length
      });

      return roundup;
      } catch (error) {
        logRoundup("error", requestId, "failed", {
          durationMs: Date.now() - startedAt,
          ...errorDetails(error)
        });
        throw error;
      }
    })
});
