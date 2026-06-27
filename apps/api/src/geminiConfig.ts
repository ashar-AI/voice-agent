export const DEFAULT_GEMINI_REASONING_MODEL = "gemini-3.5-flash";

export type AgentMode = "fallback" | "gemini";

export type GeminiAgentConfig = {
  agentMode: AgentMode;
  apiKey?: string;
  reasoningModel: string;
};

export function readGeminiAgentConfig(
  env: NodeJS.ProcessEnv = process.env
): GeminiAgentConfig {
  return {
    agentMode: readAgentMode(env.AGENT_MODE),
    apiKey: readOptionalEnv(env.GEMINI_API_KEY),
    reasoningModel:
      readOptionalEnv(env.GEMINI_REASONING_MODEL) ?? DEFAULT_GEMINI_REASONING_MODEL
  };
}

export function isGeminiDecisionEnabled(config: GeminiAgentConfig): boolean {
  return config.agentMode === "gemini" && Boolean(config.apiKey);
}

function readAgentMode(value: string | undefined): AgentMode {
  if (!value) {
    return "fallback";
  }

  if (value === "fallback" || value === "gemini") {
    return value;
  }

  throw new Error(`Invalid AGENT_MODE: ${value}`);
}

function readOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
