import type {
  AgentDecision,
  AgentTurnRequest,
  AgentTurnResponse,
  RiskState,
  TranscriptTurn
} from "@voice-agent/contracts";
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
  constructor(private readonly fallbackAgent: WelfareCheckAgent = new FallbackWelfareCheckAgent()) {}

  async createTurn(
    request: AgentTurnRequest,
    runtime: WelfareCheckAgentRuntime
  ): Promise<WelfareCheckAgentResult> {
    return this.fallbackAgent.createTurn(request, runtime);
  }
}

export function createWelfareCheckAgent(
  provider = process.env.AGENT_MODE ?? "fallback"
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
