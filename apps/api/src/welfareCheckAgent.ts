import type {
  AlertRecord,
  AgentDecision,
  AgentTurnRequest,
  AgentTurnResponse,
  MemoryItem,
  RiskLevel,
  RiskState,
  TranscriptTurn
} from "@voice-agent/contracts";
import {
  createGeminiDecisionGenerator,
  type GeminiDecisionGenerator
} from "./geminiDecisionAdapter.js";
import {
  isGeminiDecisionEnabled,
  readGeminiAgentConfig,
  type GeminiAgentConfig
} from "./geminiConfig.js";
import { evaluateUserTurn } from "./riskEvaluator.js";

export type WelfareCheckAgentRuntime = {
  createId: (prefix: string) => string;
  now: () => string;
};

export type WelfareCheckAgentResult = AgentTurnResponse & {
  riskState: RiskState;
};

export interface WelfareCheckAgent {
  createTurn(
    request: AgentTurnRequest,
    runtime: WelfareCheckAgentRuntime
  ): Promise<WelfareCheckAgentResult>;
}

export class FallbackWelfareCheckAgent implements WelfareCheckAgent {
  async createTurn(
    request: AgentTurnRequest,
    runtime: WelfareCheckAgentRuntime
  ): Promise<WelfareCheckAgentResult> {
    const latestUserTurn = request.latestUserTurn ?? findLatestUserTurn(request.transcript);
    if (!latestUserTurn) {
      throw new Error("Fallback welfare check agent requires a user turn");
    }

    const evaluation = evaluateUserTurn({
      elderId: request.elderId,
      textJa: latestUserTurn.textJa,
      textEn: latestUserTurn.textEn,
      profile: request.profile,
      memories: request.memories,
      previousRiskState: request.previousRiskState,
      createId: runtime.createId,
      now: runtime.now
    });

    return {
      decision: createDecision(evaluation.riskState),
      riskState: evaluation.riskState,
      agentTurn: evaluation.agentTurn,
      proposedMemory: evaluation.newMemory,
      proposedAlert: evaluation.alert
    };
  }
}

export class GeminiWelfareCheckAgent implements WelfareCheckAgent {
  constructor(
    private readonly fallbackAgent: WelfareCheckAgent = new FallbackWelfareCheckAgent(),
    private readonly options: {
      config?: GeminiAgentConfig;
      decisionGenerator?: GeminiDecisionGenerator;
    } = {}
  ) {}

  async createTurn(
    request: AgentTurnRequest,
    runtime: WelfareCheckAgentRuntime
  ): Promise<WelfareCheckAgentResult> {
    const fallbackResult = await this.fallbackAgent.createTurn(request, runtime);
    const config = this.options.config ?? readGeminiAgentConfig();

    if (!isGeminiDecisionEnabled(config)) {
      return fallbackResult;
    }

    const decisionGenerator =
      this.options.decisionGenerator ?? createGeminiDecisionGenerator(config);
    const decision = await decisionGenerator(request);

    if (!decision) {
      return fallbackResult;
    }

    return {
      ...fallbackResult,
      decision,
      riskState: riskStateFromDecision(fallbackResult.riskState, decision),
      proposedAlert: decision.shouldCreateAlert
        ? fallbackResult.proposedAlert ?? alertFromDecision(request, decision)
        : undefined,
      proposedMemory: fallbackResult.proposedMemory ?? memoryFromDecision(request, decision)
    };
  }
}

export function createWelfareCheckAgent(
  provider = readGeminiAgentConfig().agentMode
): WelfareCheckAgent {
  if (provider === "gemini") {
    return new GeminiWelfareCheckAgent();
  }

  if (provider === "fallback") {
    return new FallbackWelfareCheckAgent();
  }

  throw new Error(`Unknown welfare check agent provider: ${provider}`);
}

function findLatestUserTurn(transcript: TranscriptTurn[]): TranscriptTurn | undefined {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const turn = transcript[index];
    if (turn?.speaker === "elder") {
      return turn;
    }
  }

  return undefined;
}

function createDecision(riskState: RiskState): AgentDecision {
  return {
    riskLevel: riskState.riskLevel,
    confidence: 0.75,
    evidence: riskState.knownFacts,
    openQuestions: riskState.uncertainties,
    nextGoal: riskState.nextGoal,
    recommendedAction: riskState.recommendedAction,
    shouldContinueConversation: true,
    shouldCreateAlert: riskState.alertRequired,
    shouldFinalizeCall: false
  };
}

function riskStateFromDecision(base: RiskState, decision: AgentDecision): RiskState {
  return {
    ...base,
    riskLevel: decision.riskLevel,
    riskScore: riskScoreFromDecision(decision.riskLevel, decision.confidence),
    knownFacts: decision.evidence.length > 0 ? decision.evidence : base.knownFacts,
    uncertainties: decision.openQuestions,
    nextGoal: decision.nextGoal,
    recommendedAction: decision.recommendedAction,
    alertRequired: decision.shouldCreateAlert
  };
}

function alertFromDecision(
  request: AgentTurnRequest,
  decision: AgentDecision
): Omit<AlertRecord, "id" | "createdAt" | "acknowledged"> {
  return {
    elderId: request.elderId,
    severity: decision.riskLevel,
    title: "Welfare check follow-up recommended",
    reason: decision.evidence.join("; "),
    suggestedAction: decision.recommendedAction,
    evidence: decision.evidence
  };
}

function memoryFromDecision(
  request: AgentTurnRequest,
  decision: AgentDecision
): Omit<MemoryItem, "id" | "observedAt"> | undefined {
  if (decision.riskLevel === "stable" || decision.evidence.length === 0) {
    return undefined;
  }

  return {
    elderId: request.elderId,
    category: decision.shouldCreateAlert ? "safety" : "health",
    text: `Gemini decision evidence: ${decision.evidence.join(", ")}.`,
    importance: decision.shouldCreateAlert ? "high" : "medium"
  };
}

function riskScoreFromDecision(riskLevel: RiskLevel, confidence: number): number {
  const baseScoreByLevel: Record<RiskLevel, number> = {
    stable: 15,
    watch: 30,
    concern: 50,
    high: 75,
    urgent: 92
  };

  const confidenceAdjustment = Math.round((confidence - 0.5) * 10);
  return clamp(baseScoreByLevel[riskLevel] + confidenceAdjustment, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
