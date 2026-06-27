import {
  Type,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Schema
} from "@google/genai";
import type {
  AlertRecord,
  CallSummary,
  CaregiverBriefing,
  MemoryItem,
  RiskState,
  TranscriptTurn
} from "@voice-agent/contracts";
import { z } from "zod";
import { createGoogleGenAI, createStructuredJsonConfig } from "./geminiClient.js";
import {
  isGeminiDecisionEnabled,
  readGeminiAgentConfig,
  type GeminiAgentConfig
} from "./geminiConfig.js";

const DEFAULT_GEMINI_TIMEOUT_MS = 8_000;
const RECENT_TRANSCRIPT_LIMIT = 10;
const MEMORY_LIMIT = 8;
const EVIDENCE_BULLET_COUNT = 3;

const CaregiverBriefingDraftSchema = z.object({
  briefing: z.string().min(1).max(240),
  evidenceBullets: z.array(z.string().min(1).max(180)).length(EVIDENCE_BULLET_COUNT),
  recommendedFamilyFollowUp: z.string().min(1).max(220),
  safetyWording: z.string().min(1).max(260)
});

type CaregiverBriefingDraft = z.infer<typeof CaregiverBriefingDraftSchema>;

type GeminiGenerateContent = (
  params: GenerateContentParameters
) => Promise<Pick<GenerateContentResponse, "text">>;

export type CaregiverBriefingInput = {
  elderId: string;
  sessionId: string;
  transcript: TranscriptTurn[];
  memories: MemoryItem[];
  riskState: RiskState;
  alerts: AlertRecord[];
  summary: CallSummary;
};

export type CaregiverBriefingRuntime = {
  createId: (prefix: string) => string;
  now: () => string;
};

export type CaregiverBriefingAgentOptions = {
  config?: GeminiAgentConfig;
  generateContent?: GeminiGenerateContent;
};

export async function createCaregiverBriefing(
  input: CaregiverBriefingInput,
  runtime: CaregiverBriefingRuntime,
  options: CaregiverBriefingAgentOptions = {}
): Promise<CaregiverBriefing> {
  const draft =
    (await createGeminiBriefingDraft(input, options)) ?? createFallbackBriefingDraft(input);

  return {
    id: runtime.createId("briefing"),
    elderId: input.elderId,
    sessionId: input.sessionId,
    briefing: draft.briefing,
    evidenceBullets: draft.evidenceBullets,
    recommendedFamilyFollowUp: draft.recommendedFamilyFollowUp,
    safetyWording: draft.safetyWording,
    createdAt: runtime.now()
  };
}

async function createGeminiBriefingDraft(
  input: CaregiverBriefingInput,
  options: CaregiverBriefingAgentOptions
): Promise<CaregiverBriefingDraft | undefined> {
  const config = options.config ?? readGeminiAgentConfig();

  if (!isGeminiDecisionEnabled(config)) {
    return undefined;
  }

  const generateContent = options.generateContent ?? createSdkGenerateContent(config);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), DEFAULT_GEMINI_TIMEOUT_MS);

  try {
    const response = await generateContent({
      model: config.reasoningModel,
      contents: buildBriefingPrompt(input),
      config: createStructuredJsonConfig(config, {
        systemInstruction: GEMINI_CAREGIVER_BRIEFING_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: caregiverBriefingResponseSchema,
        temperature: 0.2,
        maxOutputTokens: 700,
        abortSignal: abortController.signal
      })
    });

    return parseCaregiverBriefingDraftJson(response.text);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function createSdkGenerateContent(config: GeminiAgentConfig): GeminiGenerateContent {
  const ai = createGoogleGenAI(config);
  return ai.models.generateContent.bind(ai.models);
}

export function parseCaregiverBriefingDraftJson(
  raw: string | undefined
): CaregiverBriefingDraft | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(stripJsonFence(raw));
    const draft = CaregiverBriefingDraftSchema.safeParse(parsed);
    return draft.success ? draft.data : undefined;
  } catch {
    return undefined;
  }
}

function createFallbackBriefingDraft(input: CaregiverBriefingInput): CaregiverBriefingDraft {
  return {
    briefing: createBriefingSentence(input),
    evidenceBullets: createEvidenceBullets(input),
    recommendedFamilyFollowUp:
      input.summary.recommendedFollowUp || input.riskState.recommendedAction,
    safetyWording:
      "This is a non-medical welfare briefing. If safety is uncertain or symptoms feel urgent, contact local emergency services or a qualified clinician."
  };
}

function createBriefingSentence(input: CaregiverBriefingInput): string {
  if (input.riskState.alertRequired || input.summary.riskLevel === "urgent") {
    return "The check-in found safety signals that need prompt caregiver follow-up.";
  }

  if (input.summary.riskLevel === "high") {
    return "The check-in found elevated safety concerns that should be followed up soon.";
  }

  if (input.summary.riskLevel === "concern") {
    return "The check-in found a non-urgent well-being concern for family follow-up.";
  }

  if (input.summary.riskLevel === "watch") {
    return "The check-in found mild changes worth a gentle family check-in.";
  }

  return "The check-in completed without evidence requiring caregiver action.";
}

function createEvidenceBullets(input: CaregiverBriefingInput): string[] {
  const evidence = [
    ...input.summary.keyEvidence,
    ...input.riskState.knownFacts,
    ...input.alerts.flatMap((alert) => alert.evidence),
    ...input.transcript
      .filter((turn) => turn.speaker === "elder")
      .slice(-2)
      .map((turn) => turn.textEn ?? turn.textJa)
  ]
    .map(normalizeBriefText)
    .filter((item) => item.length > 0);

  const uniqueEvidence = Array.from(new Set(evidence));
  const bullets = uniqueEvidence.slice(0, EVIDENCE_BULLET_COUNT);

  while (bullets.length < EVIDENCE_BULLET_COUNT) {
    bullets.push(fallbackEvidenceBullet(input, bullets.length));
  }

  return bullets;
}

function fallbackEvidenceBullet(input: CaregiverBriefingInput, index: number): string {
  const fallbackBullets = [
    `Risk recorded as ${input.summary.riskLevel} (${input.summary.riskScore}/100).`,
    normalizeBriefText(input.summary.summary),
    normalizeBriefText(input.riskState.recommendedAction)
  ].filter((item) => item.length > 0);

  return fallbackBullets[index] ?? "No additional risk evidence was recorded.";
}

function normalizeBriefText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function buildBriefingPrompt(input: CaregiverBriefingInput): string {
  return JSON.stringify({
    task: "Create a concise caregiver briefing after a welfare check call.",
    outputContract: {
      briefing: "one short family-ready sentence",
      evidenceBullets: "exactly 3 concrete evidence bullets; do not invent facts",
      recommendedFamilyFollowUp: "one practical non-medical family follow-up",
      safetyWording: "brief non-medical safety wording"
    },
    callSummary: input.summary,
    riskState: input.riskState,
    alerts: input.alerts,
    recentTranscript: input.transcript.slice(-RECENT_TRANSCRIPT_LIMIT),
    recentMemories: input.memories.slice(0, MEMORY_LIMIT)
  });
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export const GEMINI_CAREGIVER_BRIEFING_SYSTEM_INSTRUCTION = [
  "You are CareVoice's caregiver briefing agent.",
  "Create concise, family-ready welfare-check wording from provided facts only.",
  "Do not diagnose, prescribe, triage medical care, or claim clinical authority.",
  "Use exactly 3 evidence bullets.",
  "Return only JSON that matches the provided caregiver briefing schema."
].join("\n");

const stringArraySchema: Schema = {
  type: Type.ARRAY,
  items: { type: Type.STRING }
};

export const caregiverBriefingResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    briefing: { type: Type.STRING },
    evidenceBullets: stringArraySchema,
    recommendedFamilyFollowUp: { type: Type.STRING },
    safetyWording: { type: Type.STRING }
  },
  required: [
    "briefing",
    "evidenceBullets",
    "recommendedFamilyFollowUp",
    "safetyWording"
  ],
  propertyOrdering: [
    "briefing",
    "evidenceBullets",
    "recommendedFamilyFollowUp",
    "safetyWording"
  ]
};
