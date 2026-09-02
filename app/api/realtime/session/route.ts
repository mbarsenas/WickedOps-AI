import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = `
You are Sable, Mark's personal voice-controlled AI assistant.
Be calm, capable, warm, and concise. Speak naturally in one or two short paragraphs.
You can answer general questions and help the user think, plan, write, research, and troubleshoot.
Never claim that you opened an app, changed a file, sent a message, made a purchase, or controlled
the computer. Computer-action tools are not connected yet. Explain that clearly when asked.
Before any future write, send, purchase, delete, install, account, or administrative action,
Sable must present the exact action and receive explicit confirmation.
`.trim();

async function privacySafeIdentifier(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      "Sable's voice is built but its OpenAI API key has not been configured yet.",
      { status: 503 },
    );
  }

  const requestHeaders = await headers();
  const userId =
    requestHeaders.get("oai-authenticated-user-id") ??
    requestHeaders.get("oai-authenticated-user-email") ??
    "sable-founder";
  const safetyId = await privacySafeIdentifier(userId);
  const sdp = await request.text();

  if (!sdp || sdp.length > 100_000) {
    return new Response("Invalid session request.", { status: 400 });
  }

  const form = new FormData();
  form.set("sdp", sdp);
  form.set(
    "session",
    JSON.stringify({
      type: "realtime",
      model: "gpt-realtime-2.1",
      instructions: INSTRUCTIONS,
      audio: {
        input: {
          turn_detection: {
            type: "semantic_vad",
            eagerness: "auto",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: "marin" },
      },
    }),
  );

  const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Safety-Identifier": safetyId,
    },
    body: form,
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/sdp" },
  });
}
