import assert from "node:assert/strict";
import test from "node:test";
import { baseMemories, createInitialRiskState, demoProfile } from "./demoData.js";
import { evaluateUserTurn } from "./riskEvaluator.js";

const fixedNow = () => "2026-06-27T00:00:00.000Z";

function createId(prefix: string): string {
  return `${prefix}_test`;
}

test("fall and dizziness utterance creates high-risk alert independent of selected scenario", () => {
  const result = evaluateUserTurn({
    elderId: demoProfile.elderId,
    textJa: "昨日ちょっと転んで、今日は立つとふらつきます。",
    textEn: "I fell a little yesterday, and today I feel unsteady when I stand.",
    profile: demoProfile,
    memories: baseMemories,
    previousRiskState: createInitialRiskState(),
    createId,
    now: fixedNow
  });

  assert.equal(result.riskState.riskLevel, "high");
  assert.equal(result.riskState.alertRequired, true);
  assert.ok(result.alert);
});

test("stable improvement utterance remains stable even when demo seed is fall scenario", () => {
  const result = evaluateUserTurn({
    elderId: demoProfile.elderId,
    textJa: "今日はまあまあです。膝は少し良くなりました。",
    textEn: "I am doing okay today. My knee is a little better.",
    profile: demoProfile,
    memories: baseMemories,
    previousRiskState: createInitialRiskState(),
    createId,
    now: fixedNow
  });

  assert.equal(result.riskState.riskLevel, "stable");
  assert.equal(result.riskState.alertRequired, false);
  assert.equal(result.alert, undefined);
});

test("loneliness utterance creates concern without urgent alert", () => {
  const result = evaluateUserTurn({
    elderId: demoProfile.elderId,
    textJa: "別に大丈夫です。ただ、最近あまり人と話していません。",
    textEn: "I am not really in trouble. I just have not talked to people much lately.",
    profile: demoProfile,
    memories: baseMemories,
    previousRiskState: createInitialRiskState(),
    createId,
    now: fixedNow
  });

  assert.equal(result.riskState.riskLevel, "concern");
  assert.equal(result.riskState.alertRequired, false);
  assert.equal(result.alert, undefined);
});
