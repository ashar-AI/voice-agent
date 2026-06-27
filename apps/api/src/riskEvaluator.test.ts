import assert from "node:assert/strict";
import test from "node:test";
import { baseMemories, createInitialRiskState, demoProfile } from "./demoData.js";
import { FallbackWelfareCheckAgent } from "./welfareCheckAgent.js";

const fixedNow = () => "2026-06-27T00:00:00.000Z";
const fallbackAgent = new FallbackWelfareCheckAgent();

function createId(prefix: string): string {
  return `${prefix}_test`;
}

async function evaluateFallbackTurn(textJa: string, textEn?: string) {
  return fallbackAgent.createTurn({
    elderId: demoProfile.elderId,
    sessionId: "session_test",
    profile: demoProfile,
    memories: baseMemories,
    transcript: [
      {
        id: "turn_test",
        speaker: "elder",
        textJa,
        textEn,
        timestamp: fixedNow()
      }
    ],
    previousRiskState: createInitialRiskState(),
    latestUserTurn: {
      id: "turn_test",
      speaker: "elder",
      textJa,
      textEn,
      timestamp: fixedNow()
    },
    channel: "text_demo"
  }, {
    createId,
    now: fixedNow
  });
}

test("fall and dizziness utterance creates high-risk alert through fallback agent", async () => {
  const result = await evaluateFallbackTurn(
    "昨日ちょっと転んで、今日は立つとふらつきます。",
    "I fell a little yesterday, and today I feel unsteady when I stand."
  );

  assert.equal(result.riskState.riskLevel, "high");
  assert.equal(result.riskState.alertRequired, true);
  assert.ok(result.proposedAlert);
});

test("stable improvement utterance remains stable through fallback agent", async () => {
  const result = await evaluateFallbackTurn(
    "今日はまあまあです。膝は少し良くなりました。",
    "I am doing okay today. My knee is a little better."
  );

  assert.equal(result.riskState.riskLevel, "stable");
  assert.equal(result.riskState.alertRequired, false);
  assert.equal(result.proposedAlert, undefined);
});

test("loneliness utterance creates concern without urgent alert through fallback agent", async () => {
  const result = await evaluateFallbackTurn(
    "別に大丈夫です。ただ、最近あまり人と話していません。",
    "I am not really in trouble. I just have not talked to people much lately."
  );

  assert.equal(result.riskState.riskLevel, "concern");
  assert.equal(result.riskState.alertRequired, false);
  assert.equal(result.proposedAlert, undefined);
});
