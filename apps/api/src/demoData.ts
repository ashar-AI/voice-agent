import type {
  DemoScenario,
  ElderProfile,
  MemoryItem,
  RiskState,
  ScenarioId
} from "@voice-agent/contracts";

export const DEMO_ELDER_ID = "sato_001";

export const demoProfile: ElderProfile = {
  elderId: DEMO_ELDER_ID,
  displayName: "Sato-san",
  age: 82,
  preferredLanguage: "ja",
  livesAlone: true,
  emergencyContactName: "Yuki Sato",
  emergencyContactRelation: "daughter",
  baseline: {
    usualMood: "calm and conversational",
    usualEnergy: "steady in the morning, lower in the evening",
    dailyHabits: ["waters plants after breakfast", "takes a short afternoon walk"]
  }
};

export const baseMemories: MemoryItem[] = [
  {
    id: "mem_knee_pain",
    elderId: DEMO_ELDER_ID,
    category: "health",
    text: "Mentioned knee pain last week, especially when standing up.",
    observedAt: "2026-06-20T09:00:00.000Z",
    importance: "high"
  },
  {
    id: "mem_tired_yesterday",
    elderId: DEMO_ELDER_ID,
    category: "mood",
    text: "Sounded more tired than usual yesterday.",
    observedAt: "2026-06-26T09:00:00.000Z",
    importance: "medium"
  },
  {
    id: "mem_waters_plants",
    elderId: DEMO_ELDER_ID,
    category: "habit",
    text: "Usually waters plants after breakfast.",
    observedAt: "2026-06-18T09:00:00.000Z",
    importance: "low"
  }
];

export const demoScenarios: DemoScenario[] = [
  {
    scenarioId: "normal_check_in",
    title: "Normal personalized check-in",
    purpose: "Shows memory and continuity without creating a false alert.",
    elderLineJa: "今日はまあまあです。膝は少し良くなりました。",
    elderLineEn: "I am doing okay today. My knee is a little better.",
    expectedOutcome: "Stable. Knee memory is updated and the dashboard does not alert."
  },
  {
    scenarioId: "loneliness_decline",
    title: "Subtle loneliness / mood decline",
    purpose: "Shows non-medical well-being detection and soft follow-up.",
    elderLineJa: "別に大丈夫です。ただ、最近あまり人と話していません。",
    elderLineEn: "I am not really in trouble. I just have not talked to people much lately.",
    expectedOutcome: "Concern. Suggest a family follow-up without urgent escalation."
  },
  {
    scenarioId: "fall_dizziness_escalation",
    title: "Fall / dizziness escalation",
    purpose: "Shows realtime risk detection, adaptive questioning, and alert creation.",
    elderLineJa: "昨日ちょっと転んで、今日は立つとふらつきます。",
    elderLineEn: "I fell a little yesterday, and today I feel unsteady when I stand.",
    expectedOutcome: "High risk. Alert daughter with fall, dizziness, alone, and pain evidence."
  }
];

export function getScenario(scenarioId: ScenarioId): DemoScenario {
  const scenario = demoScenarios.find((item) => item.scenarioId === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  return scenario;
}

export function createInitialRiskState(): RiskState {
  return {
    riskLevel: "stable",
    riskScore: 18,
    knownFacts: ["Lives alone", "Had knee pain last week", "Sounded tired yesterday"],
    uncertainties: ["Today's mobility", "Today's mood", "Medication adherence"],
    nextGoal: "Open with prior knee pain and compare today against recent baseline.",
    recommendedAction: "Continue gentle check-in",
    alertRequired: false,
    signals: []
  };
}
