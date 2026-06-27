import assert from "node:assert/strict";
import test from "node:test";
import type { AgentDecision, RiskState } from "@voice-agent/contracts";
import {
  CreateAlertToolOutputSchema,
  FinalizeCallSummaryToolOutputSchema,
  GetElderProfileToolOutputSchema,
  GetRecentMemoriesToolOutputSchema,
  SaveMemoryToolOutputSchema,
  StartScenarioResponseSchema,
  UpdateCallStateToolOutputSchema
} from "@voice-agent/contracts";
import { DEMO_ELDER_ID } from "./demoData.js";
import { getDashboardSnapshot, resetDemoState } from "./demoEngine.js";
import { buildServer } from "./server.js";

test("agent profile tool returns the elder profile", async (t) => {
  resetDemoState();
  const app = buildServer();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/agent-tools/get_elder_profile",
    payload: {
      elderId: DEMO_ELDER_ID
    }
  });

  assert.equal(response.statusCode, 200);
  const output = GetElderProfileToolOutputSchema.parse(response.json());
  assert.equal(output.profile.elderId, DEMO_ELDER_ID);
  assert.equal(output.profile.displayName, "Sato-san");
});

test("agent memory tools save and retrieve recent memories", async (t) => {
  resetDemoState();
  const app = buildServer();
  t.after(async () => app.close());

  const saveResponse = await app.inject({
    method: "POST",
    url: "/api/agent-tools/save_memory",
    payload: {
      elderId: DEMO_ELDER_ID,
      category: "health",
      text: "Reported drinking water after breakfast.",
      importance: "medium"
    }
  });

  assert.equal(saveResponse.statusCode, 200);
  const saveOutput = SaveMemoryToolOutputSchema.parse(saveResponse.json());
  assert.match(saveOutput.memory.id, /^mem_/);
  assert.equal(saveOutput.memory.observedAt.length > 0, true);

  const recentResponse = await app.inject({
    method: "POST",
    url: "/api/agent-tools/get_recent_memories",
    payload: {
      elderId: DEMO_ELDER_ID,
      arguments: {
        limit: 1
      }
    }
  });

  assert.equal(recentResponse.statusCode, 200);
  const recentOutput = GetRecentMemoriesToolOutputSchema.parse(recentResponse.json());
  assert.equal(recentOutput.memories.length, 1);
  assert.equal(recentOutput.memories[0]?.id, saveOutput.memory.id);
});

test("agent risk update tool persists call risk state", async (t) => {
  resetDemoState();
  const app = buildServer();
  t.after(async () => app.close());
  const started = await startScenario(app);
  const riskState = createRiskState();

  const response = await app.inject({
    method: "POST",
    url: "/api/agent-tools/update_call_state",
    payload: {
      elderId: DEMO_ELDER_ID,
      sessionId: started.session.sessionId,
      decision: createDecision(riskState),
      riskState
    }
  });

  assert.equal(response.statusCode, 200);
  const output = UpdateCallStateToolOutputSchema.parse(response.json());
  assert.equal(output.riskState.riskLevel, "watch");
  assert.equal(output.snapshot.riskState.riskScore, 31);
  assert.equal(getDashboardSnapshot().riskState.recommendedAction, "Ask one more mobility question");
});

test("agent alert tool creates a dashboard alert", async (t) => {
  resetDemoState();
  const app = buildServer();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/agent-tools/create_alert",
    payload: {
      elderId: DEMO_ELDER_ID,
      severity: "high",
      title: "Fall follow-up needed",
      reason: "The elder reported a fall and dizziness.",
      suggestedAction: "Daughter should call now.",
      evidence: ["Reported a fall", "Feels dizzy"]
    }
  });

  assert.equal(response.statusCode, 200);
  const output = CreateAlertToolOutputSchema.parse(response.json());
  assert.match(output.alert.id, /^alert_/);
  assert.equal(output.alert.acknowledged, false);
  assert.equal(getDashboardSnapshot().alerts[0]?.id, output.alert.id);
});

test("agent final summary tool stores the summary and completes the call", async (t) => {
  resetDemoState();
  const app = buildServer();
  t.after(async () => app.close());
  const started = await startScenario(app);

  const response = await app.inject({
    method: "POST",
    url: "/api/agent-tools/finalize_call_summary",
    payload: {
      elderId: DEMO_ELDER_ID,
      sessionId: started.session.sessionId,
      summary: "Check-in completed with mild mobility concern.",
      riskLevel: "watch",
      riskScore: 31,
      keyEvidence: ["Mentioned standing carefully"],
      recommendedFollowUp: "Family can check in later today."
    }
  });

  assert.equal(response.statusCode, 200);
  const output = FinalizeCallSummaryToolOutputSchema.parse(response.json());
  const snapshot = getDashboardSnapshot();
  assert.match(output.summary.id, /^summary_/);
  assert.equal(snapshot.latestSummary?.id, output.summary.id);
  assert.equal(snapshot.session?.status, "completed");
  assert.equal(snapshot.session?.completedAt !== undefined, true);
});

async function startScenario(app: ReturnType<typeof buildServer>) {
  const response = await app.inject({
    method: "POST",
    url: "/api/scenarios/start",
    payload: {
      elderId: DEMO_ELDER_ID,
      scenarioId: "normal_check_in"
    }
  });

  assert.equal(response.statusCode, 200);
  return StartScenarioResponseSchema.parse(response.json());
}

function createRiskState(): RiskState {
  return {
    riskLevel: "watch",
    riskScore: 31,
    knownFacts: ["Standing carefully today"],
    uncertainties: ["Whether dizziness is present"],
    nextGoal: "Clarify whether standing causes dizziness.",
    recommendedAction: "Ask one more mobility question",
    alertRequired: false,
    signals: []
  };
}

function createDecision(riskState: RiskState): AgentDecision {
  return {
    riskLevel: riskState.riskLevel,
    confidence: 0.8,
    evidence: riskState.knownFacts,
    openQuestions: riskState.uncertainties,
    nextGoal: riskState.nextGoal,
    recommendedAction: riskState.recommendedAction,
    shouldContinueConversation: true,
    shouldCreateAlert: false,
    shouldFinalizeCall: false
  };
}
