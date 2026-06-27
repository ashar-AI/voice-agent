import {
  GoogleGenAI,
  Type,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Schema
} from "@google/genai";
import {
  AgentDecisionSchema,
  type AgentDecision,
  type AgentTurnRequest
} from "@voice-agent/contracts";
import { type GeminiAgentConfig } from "./geminiConfig.js";

const DEFAULT_GEMINI_TIMEOUT_MS = 8_000;
const RECENT_TRANSCRIPT_LIMIT = 8;
const MEMORY_LIMIT = 8;

export const GEMINI_WELFARE_CHECK_SYSTEM_INSTRUCTION = [
  "You are CareVoice, a non-medical welfare-check conversation agent.",
  "You do not diagnose, prescribe, triage medical care, or claim clinical authority.",
  "Classify welfare risk into exactly one level: stable, watch, concern, high, urgent.",
  "Every risk decision must cite concrete evidence from the transcript, profile, memory, or prior risk state.",
  "Do not behave like IVR, a form, or a checklist; ask one natural follow-up at a time.",
  "Optimize for warm, natural Japanese conversation that helps the elder keep talking comfortably.",
  "Return only JSON that matches the provided AgentDecision schema."
].join("\n");

type GeminiGenerateContent = (
  params: GenerateContentParameters
) => Promise<Pick<GenerateContentResponse, "text">>;

export type GeminiDecisionGenerator = (
  request: AgentTurnRequest
) => Promise<AgentDecision | undefined>;

export function createGeminiDecisionGenerator(
  config: GeminiAgentConfig,
  generateContent?: GeminiGenerateContent
): GeminiDecisionGenerator {
  if (!config.apiKey && !generateContent) {
    throw new Error("Gemini decision generator requires GEMINI_API_KEY");
  }

  const resolvedGenerateContent =
    generateContent ?? createSdkGenerateContent(config.apiKey);

  return async (request) => {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), DEFAULT_GEMINI_TIMEOUT_MS);

    try {
      const response = await resolvedGenerateContent({
        model: config.reasoningModel,
        contents: buildDecisionPrompt(request),
        config: {
          systemInstruction: GEMINI_WELFARE_CHECK_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: agentDecisionResponseSchema,
          temperature: 0.2,
          maxOutputTokens: 800,
          abortSignal: abortController.signal
        }
      });

      return parseAgentDecisionJson(response.text);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  };
}

function createSdkGenerateContent(apiKey: string | undefined): GeminiGenerateContent {
  const ai = new GoogleGenAI({ apiKey });
  return ai.models.generateContent.bind(ai.models);
}

export function parseAgentDecisionJson(raw: string | undefined): AgentDecision | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(stripJsonFence(raw));
    const decision = AgentDecisionSchema.safeParse(parsed);
    if (!decision.success || decision.data.evidence.length === 0) {
      return undefined;
    }

    return decision.data;
  } catch {
    return undefined;
  }
}

function buildDecisionPrompt(request: AgentTurnRequest): string {
  return JSON.stringify({
    task: "Create the next validated AgentDecision for this welfare-check turn.",
    decisionContract: {
      riskLevel: "stable | watch | concern | high | urgent",
      confidence: "number from 0 to 1",
      evidence: "array of concrete observed facts; do not invent facts",
      openQuestions: "array of unknowns worth clarifying conversationally",
      nextGoal: "one concise conversation goal",
      recommendedAction: "non-medical caregiver/family follow-up recommendation",
      shouldContinueConversation: "boolean",
      shouldCreateAlert: "boolean",
      shouldFinalizeCall: "boolean"
    },
    elder: {
      elderId: request.elderId,
      profile: request.profile
    },
    channel: request.channel,
    latestUserTurn: request.latestUserTurn,
    recentTranscript: request.transcript.slice(-RECENT_TRANSCRIPT_LIMIT),
    recentMemories: request.memories.slice(0, MEMORY_LIMIT),
    previousRiskState: request.previousRiskState
  });
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

const stringArraySchema: Schema = {
  type: Type.ARRAY,
  items: { type: Type.STRING }
};

export const agentDecisionResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    riskLevel: {
      type: Type.STRING,
      format: "enum",
      enum: ["stable", "watch", "concern", "high", "urgent"]
    },
    confidence: {
      type: Type.NUMBER,
      minimum: 0,
      maximum: 1
    },
    evidence: stringArraySchema,
    openQuestions: stringArraySchema,
    nextGoal: { type: Type.STRING },
    recommendedAction: { type: Type.STRING },
    shouldContinueConversation: { type: Type.BOOLEAN },
    shouldCreateAlert: { type: Type.BOOLEAN },
    shouldFinalizeCall: { type: Type.BOOLEAN }
  },
  required: [
    "riskLevel",
    "confidence",
    "evidence",
    "openQuestions",
    "nextGoal",
    "recommendedAction",
    "shouldContinueConversation",
    "shouldCreateAlert",
    "shouldFinalizeCall"
  ],
  propertyOrdering: [
    "riskLevel",
    "confidence",
    "evidence",
    "openQuestions",
    "nextGoal",
    "recommendedAction",
    "shouldContinueConversation",
    "shouldCreateAlert",
    "shouldFinalizeCall"
  ]
};
