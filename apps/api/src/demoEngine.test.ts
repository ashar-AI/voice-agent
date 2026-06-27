import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_ELDER_ID } from "./demoData.js";
import { handleConversationTurn, startScenario } from "./demoEngine.js";

test("demo engine evaluates the elder utterance through the agent adapter independent of scenario", async () => {
  const normalScenario = startScenario({
    elderId: DEMO_ELDER_ID,
    scenarioId: "normal_check_in"
  });
  const fallResult = await handleConversationTurn({
    elderId: DEMO_ELDER_ID,
    sessionId: normalScenario.session.sessionId,
    textJa: "昨日ちょっと転んで、今日は立つとふらつきます。",
    textEn: "I fell a little yesterday, and today I feel unsteady when I stand."
  });

  assert.equal(fallResult.snapshot.riskState.riskLevel, "high");
  assert.equal(fallResult.snapshot.riskState.alertRequired, true);
  assert.equal(fallResult.snapshot.alerts.length, 1);

  const fallScenario = startScenario({
    elderId: DEMO_ELDER_ID,
    scenarioId: "fall_dizziness_escalation"
  });
  const stableResult = await handleConversationTurn({
    elderId: DEMO_ELDER_ID,
    sessionId: fallScenario.session.sessionId,
    textJa: "今日はまあまあです。膝は少し良くなりました。",
    textEn: "I am doing okay today. My knee is a little better."
  });

  assert.equal(stableResult.snapshot.riskState.riskLevel, "stable");
  assert.equal(stableResult.snapshot.riskState.alertRequired, false);
  assert.equal(stableResult.snapshot.alerts.length, 0);
});
