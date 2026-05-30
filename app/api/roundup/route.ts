import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RoundupEntry = {
  timestamp: number;
  note: string;
  photoDataUrl: string;
};

type RoundupRequest = {
  dayLabel?: string;
  date?: string;
  entries?: RoundupEntry[];
};

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

const model = process.env.OPENROUTER_MODEL ?? "google/gemini-3.5-flash";

function isValidDataUrl(value: string) {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/.test(value) && value.length < 7_000_000;
}

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

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OpenRouter is not configured locally." }, { status: 500 });
  }

  let body: RoundupRequest;

  try {
    body = (await request.json()) as RoundupRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const entries = body.entries ?? [];

  if (entries.length === 0) {
    return NextResponse.json({ error: "Add at least one food photo before generating a roundup." }, { status: 400 });
  }

  if (entries.length > 8 || entries.some((entry) => !isValidDataUrl(entry.photoDataUrl))) {
    return NextResponse.json({ error: "Too many photos, or one photo is too large for this experiment." }, { status: 400 });
  }

  const textSummary = entries
    .map((entry, index) => {
      const time = new Date(entry.timestamp).toLocaleTimeString("en-GB", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
      return `${index + 1}. ${time}${entry.note ? ` - note: ${entry.note}` : ""}`;
    })
    .join("\n");

  const content = [
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
        `Day: ${body.dayLabel ?? "Selected day"} ${body.date ?? ""}`,
        "Entries:",
        textSummary
      ].join("\n")
    },
    ...entries.map((entry) => ({
      type: "image_url",
      image_url: {
        url: entry.photoDataUrl
      }
    }))
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "FoodPhoto"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content
        }
      ],
      temperature: 0.55,
      max_tokens: 420
    })
  });

  const result = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    return NextResponse.json(
      { error: result.error?.message ?? "OpenRouter request failed." },
      { status: response.status }
    );
  }

  const roundup = getRoundupText(result.choices?.[0]?.message?.content);

  if (!roundup) {
    return NextResponse.json({ error: "OpenRouter returned an empty roundup." }, { status: 502 });
  }

  return NextResponse.json({ roundup });
}
