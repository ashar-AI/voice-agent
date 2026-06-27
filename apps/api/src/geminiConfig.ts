export const DEFAULT_GEMINI_REASONING_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_VERTEX_LOCATION = "global";

export type AgentMode = "fallback" | "gemini";
export type GeminiBackend = "developer" | "vertex";

export type GeminiAgentConfig = {
  agentMode: AgentMode;
  backend: GeminiBackend;
  apiKey?: string;
  reasoningModel: string;
  vertexProject?: string;
  vertexLocation: string;
};

export function readGeminiAgentConfig(
  env: NodeJS.ProcessEnv = process.env
): GeminiAgentConfig {
  return {
    agentMode: readAgentMode(env.AGENT_MODE),
    backend: readGeminiBackend(env.GEMINI_BACKEND, env.GOOGLE_GENAI_USE_VERTEXAI),
    apiKey: readOptionalEnv(env.GEMINI_API_KEY),
    reasoningModel:
      readOptionalEnv(env.GEMINI_REASONING_MODEL) ?? DEFAULT_GEMINI_REASONING_MODEL,
    vertexProject: readOptionalEnv(env.GOOGLE_CLOUD_PROJECT),
    vertexLocation:
      readOptionalEnv(env.GOOGLE_CLOUD_LOCATION) ?? DEFAULT_GEMINI_VERTEX_LOCATION
  };
}

export function isGeminiDecisionEnabled(config: GeminiAgentConfig): boolean {
  if (config.agentMode !== "gemini") {
    return false;
  }

  if (config.backend === "vertex") {
    return Boolean(config.vertexProject);
  }

  return Boolean(config.apiKey);
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

function readGeminiBackend(
  value: string | undefined,
  useVertexAi: string | undefined
): GeminiBackend {
  if (value === "developer" || value === "vertex") {
    return value;
  }

  if (value) {
    throw new Error(`Invalid GEMINI_BACKEND: ${value}`);
  }

  return useVertexAi === "true" ? "vertex" : "developer";
}

function readOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
