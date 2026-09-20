import { headers } from "next/headers";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = `
You are Sable, Mark's personal voice-controlled AI assistant.
Be calm, capable, warm, and concise. Speak naturally in one or two short paragraphs.
You can answer general questions and help the user think, plan, write, research, and troubleshoot.
You have a tool named ask_model for getting a second opinion or delegating a question to GPT, Claude,
Grok, all three models, or a collaboration between them. Use it when Mark explicitly says things like
"ask Claude", "ask Grok", "ask GPT", "ask all models", "get a second opinion", or "have the AIs work together".
For "get a second opinion", choose a model other than yourself; Claude is the default if none is named.
For "ask all models", use mode all. For "have the AIs work together" or "collaborate", use mode collaborate.
After the tool returns, summarize or read the result naturally and identify which model or mode was used.
Never claim that you opened an app, changed a file, sent a message, made a purchase, or controlled
the computer. Computer-action tools are not connected yet. Explain that clearly when asked.
Before any future write, send, purchase, delete, install, account, or administrative action,
Sable must present the exact action and receive explicit confirmation.
`.trim();

const TOOLS = [
  {
    type: "function",
    name: "ask_model",
    description: "Ask GPT, Claude, Grok, all models, or a collaborating group of models for an answer or second opinion.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["gpt", "claude", "grok", "all", "collaborate"],
          description: "Which model or multi-model strategy to use.",
        },
        prompt: {
          type: "string",
          description: "The complete question or task to send to the selected model or models.",
        },
      },
      required: ["mode", "prompt"],
      additionalProperties: false,
    },
  },
];

async function privacySafeIdentifier(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Sign in to use Sable.", { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("Sable's voice is built but its OpenAI API key has not been configured yet.", { status: 503 });
  }

  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id") ?? requestHeaders.get("oai-authenticated-user-email") ?? "sable-founder";
  const safetyId = await privacySafeIdentifier(userId);
  const sdp = await request.text();

  if (!sdp || sdp.length > 100_000) return new Response("Invalid session request.", { status: 400 });

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify({
    type: "realtime",
    model: "gpt-realtime-2.1",
    instructions: INSTRUCTIONS,
    tools: TOOLS,
    tool_choice: "auto",
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
  }));

  const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Safety-Identifier": safetyId },
    body: form,
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/sdp" },
  });
}
