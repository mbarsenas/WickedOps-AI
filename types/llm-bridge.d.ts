declare module "llm-bridge" {
  export type ProviderKey = "gpt" | "claude" | "grok" | "local";

  export function getProviders(options?: { includeLocal?: boolean }): Array<{
    key: ProviderKey;
    label: string;
    model?: string;
    apiKey?: string;
    workspaceId?: string;
    baseUrl?: string;
    local: boolean;
    enabled: boolean;
  }>;

  export function ask(options: {
    provider: string;
    prompt: string;
    system?: string;
    includeLocal?: boolean;
  }): Promise<{ provider: string; label: string; text: string }>;

  export function askAll(options: {
    prompt: string;
    providers?: string[];
    system?: string;
    includeLocal?: boolean;
  }): Promise<Array<{ provider: string; label: string; ok: boolean; text?: string; error?: string }>>;

  export function chain(options: {
    prompt: string;
    order?: string[];
    includeLocal?: boolean;
  }): Promise<{ text: string; steps: unknown[] }>;

  export function synthesize(options: {
    prompt: string;
    providers?: string[];
    synthesizer?: string;
    includeLocal?: boolean;
  }): Promise<{ text: string; synthesizer: string; label: string; results: unknown[] }>;

  export function discuss(options: {
    prompt: string;
    order?: string[];
    rounds?: number;
    includeLocal?: boolean;
  }): Promise<{ topic: string; rounds: number; transcript: unknown[] }>;
}
