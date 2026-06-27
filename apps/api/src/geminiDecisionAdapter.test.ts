import assert from "node:assert/strict";
import test from "node:test";
import { type AgentDecision, type AgentTurnRequest } from "@voice-agent/contracts";
import { baseMemories, createInitialRiskState, demoProfile } from "./demoData.js";
import { parseAgentDecisionJson } from "./geminiDecisionAdapter.js";
import {
  DEFAULT_GEMINI_REASONING_MODEL,
  isGeminiDecisionEnabled,
  readGeminiAgentConfig
} from "./geminiConfig.js";
import { FallbackWelfareCheckAgent, GeminiWelfareCheckAgent } from "./welfareCheckAgent.js";

const fixedNow = () => "2026-06-27T00:00:00.000Z";

const highRiskDecision: AgentDecision = {
  riskLevel: "high",
  confidence: 0.9,
  evidence: ["Reported dizziness while standing"],
  openQuestions: ["Whether someone can come over now"],
  nextGoal: "Clarify immediate safety in one natural Japanese follow-up.",
  recommendedAction: "Ask daughter to call and confirm safety.",
  shouldContinueConversation: true,
  shouldCreateAlert: true,
  shouldFinalizeCall: false
};

function createId(prefix: string): string {
  return `${prefix}_test`;
}

function createRequest(textJa: string, textEn?: string): AgentTurnRequest {
  const latestUserTurn = {
    id: "turn_test",
    speaker: "elder" as const,
    textJa,
    textEn,
    timestamp: fixedNow()
  };

  return {
    elderId: demoProfile.elderId,
    sessionId: "session_test",
    profile: demoProfile,
    memories: baseMemories,
    transcript: [latestUserTurn],
    previousRiskState: createInitialRiskState(),
    latestUserTurn,
    channel: "text_demo"
  };
}

test("Gemini config defaults to credential-free fallback mode", () => {
  const config = readGeminiAgentConfig({});

  assert.deepEqual(config, {
    agentMode: "fallback",
    apiKey: undefined,
    reasoningModel: DEFAULT_GEMINI_REASONING_MODEL
  });
  assert.equal(isGeminiDecisionEnabled(config), false);
});

test("Gemini config enables decisions only in gemini mode with a key", () => {
  const config = readGeminiAgentConfig({
    AGENT_MODE: "gemini",
    GEMINI_API_KEY: " test-key ",
    GEMINI_REASONING_MODEL: "gemini-test-model"
  });

  assert.deepEqual(config, {
    agentMode: "gemini",
    apiKey: "test-key",
    reasoningModel: "gemini-test-model"
  });
  assert.equal(isGeminiDecisionEnabled(config), true);
});

test("Gemini decision parser accepts valid structured JSON and rejects missing evidence", () => {
  assert.deepEqual(
    parseAgentDecisionJson(`\`\`\`json\n${JSON.stringify(highRiskDecision)}\n\`\`\``),
    highRiskDecision
  );

  assert.equal(
    parseAgentDecisionJson(JSON.stringify({ ...highRiskDecision, evidence: [] })),
    undefined
  );
  assert.equal(parseAgentDecisionJson("not json"), undefined);
});

test("Gemini agent delegates to fallback without credentials and does not call decision generator", async () => {
  let called = false;
  const agent = new GeminiWelfareCheckAgent(new FallbackWelfareCheckAgent(), {
    config: {
      agentMode: "gemini",
      reasoningModel: DEFAULT_GEMINI_REASONING_MODEL
    },
    decisionGenerator: async () => {
      called = true;
      return highRiskDecision;
    }
  });

  const result = await agent.createTurn(
    createRequest("今日はまあまあです。膝は少し良くなりました。"),
    { createId, now: fixedNow }
  );

  assert.equal(called, false);
  assert.equal(result.riskState.riskLevel, "stable");
  assert.equal(result.proposedAlert, undefined);
});

test("Gemini agent uses validated decision when gemini mode and key are configured", async () => {
  const agent = new GeminiWelfareCheckAgent(new FallbackWelfareCheckAgent(), {
    config: {
      agentMode: "gemini",
      apiKey: "test-key",
      reasoningModel: DEFAULT_GEMINI_REASONING_MODEL
    },
    decisionGenerator: async () => highRiskDecision
  });

  const result = await agent.createTurn(
    createRequest("今日はまあまあです。", "I am okay today."),
    { createId, now: fixedNow }
  );

  assert.equal(result.decision, highRiskDecision);
  assert.equal(result.riskState.riskLevel, "high");
  assert.equal(result.riskState.alertRequired, true);
  assert.ok(result.proposedAlert);
  assert.deepEqual(result.proposedAlert.evidence, highRiskDecision.evidence);
});
