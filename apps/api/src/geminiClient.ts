import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import type { GeminiAgentConfig } from "./geminiConfig.js";

export function createGoogleGenAI(config: GeminiAgentConfig): GoogleGenAI {
  if (config.backend === "vertex") {
    return new GoogleGenAI({
      vertexai: true,
      project: config.vertexProject,
      location: config.vertexLocation
    });
  }

  return new GoogleGenAI({
    apiKey: config.apiKey
  });
}

export function createStructuredJsonConfig(
  agentConfig: GeminiAgentConfig,
  requestConfig: GenerateContentConfig
): GenerateContentConfig {
  if (!supportsThinkingConfig(agentConfig.reasoningModel)) {
    return requestConfig;
  }

  return {
    ...requestConfig,
    thinkingConfig: {
      thinkingBudget: 0
    }
  };
}

function supportsThinkingConfig(model: string): boolean {
  return /^gemini-(?:2\.5|3(?:\.|$|-))/i.test(model);
}
