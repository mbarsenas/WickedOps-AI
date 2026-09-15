import { getChatGPTUser } from "../../chatgpt-auth";
import { ask, askAll, chain, discuss, getProviders, synthesize } from "llm-bridge";

export const dynamic = "force-dynamic";

const CLOUD_RUNTIME = true;
const VALID_MODES = new Set(["ask", "all", "chain", "synth", "discuss"]);

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Sign in to use Sable." }, 401);

  return json({
    providers: getProviders({ includeLocal: !CLOUD_RUNTIME }),
    modes: [...VALID_MODES],
    localProvider: {
      available: false,
      reason: "Ollama runs on the local Sable host and is not reachable from the cloud runtime.",
    },
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Sign in to use Sable." }, 401);

  let body: {
    mode?: string;
    prompt?: string;
    provider?: string;
    providers?: string[];
    order?: string[];
    synthesizer?: string;
    rounds?: number;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const mode = body.mode ?? "ask";
  const prompt = body.prompt?.trim();
  if (!VALID_MODES.has(mode)) return json({ error: `Unsupported mode: ${mode}` }, 400);
  if (!prompt) return json({ error: "prompt is required" }, 400);
  if (prompt.length > 50_000) return json({ error: "prompt is too large" }, 413);

  const requested = [body.provider, ...(body.providers ?? []), ...(body.order ?? []), body.synthesizer]
    .filter(Boolean);
  if (requested.includes("local")) {
    return json(
      { error: "The local Ollama provider must be invoked by Sable's local host, not the cloud API." },
      400,
    );
  }

  try {
    if (mode === "ask") {
      return json(await ask({ provider: body.provider ?? "gpt", prompt, includeLocal: false }));
    }
    if (mode === "all") {
      return json(await askAll({ prompt, providers: body.providers, includeLocal: false }));
    }
    if (mode === "chain") {
      return json(await chain({ prompt, order: body.order, includeLocal: false }));
    }
    if (mode === "synth") {
      return json(
        await synthesize({
          prompt,
          providers: body.providers,
          synthesizer: body.synthesizer ?? "claude",
          includeLocal: false,
        }),
      );
    }
    return json(
      await discuss({
        prompt,
        order: body.order,
        rounds: body.rounds ?? 2,
        includeLocal: false,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Multi-model request failed.";
    return json({ error: message }, 502);
  }
}
