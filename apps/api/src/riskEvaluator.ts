import type {
  AlertRecord,
  ElderProfile,
  MemoryItem,
  RiskLevel,
  RiskSignal,
  RiskState,
  TranscriptTurn
} from "@voice-agent/contracts";

type EvaluationInput = {
  elderId: string;
  textJa: string;
  textEn?: string;
  profile: ElderProfile;
  memories: MemoryItem[];
  previousRiskState: RiskState;
  createId: (prefix: string) => string;
  now: () => string;
};

type EvaluationResult = {
  riskState: RiskState;
  agentTurn: Omit<TranscriptTurn, "id" | "timestamp">;
  newMemory?: Omit<MemoryItem, "id" | "observedAt">;
  alert?: Omit<AlertRecord, "id" | "createdAt" | "acknowledged">;
};

type SignalDraft = {
  label: string;
  severity: RiskLevel;
  evidence: string;
};

export function evaluateUserTurn(input: EvaluationInput): EvaluationResult {
  const text = `${input.textJa} ${input.textEn ?? ""}`.toLowerCase();
  const signals: SignalDraft[] = [];
  const knownFacts: string[] = [];
  const uncertainties: string[] = [];
  let score = 18;

  const hasFall = /転ん|転倒|倒れ|fell|fall|fallen/.test(text);
  const hasDizziness = /ふらつ|めまい|dizz|unsteady|lightheaded/.test(text);
  const hasPain = /痛|いた|pain|hurt|腰|膝|knee|back/.test(text);
  const hasAlone = /一人|ひとり|alone|by myself/.test(text) || input.profile.livesAlone;
  const hasLoneliness = /話していません|人と話|寂|さみ|孤独|lonely|not talked|haven.t talked|no one/.test(text);
  const hasImprovement = /良くな|よくな|大丈夫|まあまあ|better|okay|fine/.test(text);
  const hasSevereLimitation = /動け|起き上がれ|立てない|cannot move|can't move|cannot stand|can't stand/.test(text);
  const hasConfusion = /わからない|混乱|confus|disoriented/.test(text);

  if (hasImprovement) {
    knownFacts.push("Reported improvement or stable condition");
    score -= 4;
  }

  if (hasFall) {
    knownFacts.push("Reported a fall");
    signals.push({ label: "Fall", severity: "high", evidence: input.textJa });
    score += 34;
  }

  if (hasDizziness) {
    knownFacts.push("Feels dizzy or unsteady");
    signals.push({ label: "Dizziness when standing", severity: "high", evidence: input.textJa });
    score += 26;
  }

  if (hasPain) {
    knownFacts.push("Reported pain or possible injury");
    signals.push({ label: "Pain or injury", severity: hasFall ? "high" : "medium", evidence: input.textJa });
    score += hasFall ? 14 : 8;
  }

  if (hasAlone) {
    knownFacts.push("Lives alone or is currently alone");
    score += hasFall || hasDizziness ? 10 : 2;
  }

  if (hasLoneliness) {
    knownFacts.push("Reduced recent social contact");
    signals.push({ label: "Reduced social contact", severity: "medium", evidence: input.textJa });
    score += 28;
  }

  if (hasSevereLimitation) {
    knownFacts.push("May be unable to move safely");
    signals.push({ label: "Mobility limitation", severity: "urgent", evidence: input.textJa });
    score += 34;
  }

  if (hasConfusion) {
    knownFacts.push("Possible confusion or disorientation");
    signals.push({ label: "Possible confusion", severity: "high", evidence: input.textJa });
    score += 24;
  }

  if (knownFacts.length === 0) {
    knownFacts.push("No immediate risk signal detected");
  }

  const rememberedKneePain = input.memories.some((memory) =>
    /knee|膝/i.test(memory.text)
  );

  if (rememberedKneePain && (hasFall || hasDizziness || hasPain)) {
    knownFacts.push("Recent knee pain memory increases mobility concern");
    score += 6;
  }

  const riskScore = clamp(score, 0, 100);
  const riskLevel = getRiskLevel(riskScore, signals);

  if (riskLevel === "high" || riskLevel === "urgent") {
    uncertainties.push("Injury severity", "Whether they can move safely", "Whether immediate help is nearby");
    return highRiskResult(input, riskLevel, riskScore, knownFacts, uncertainties, signals);
  }

  if (hasLoneliness) {
    uncertainties.push("Mood duration", "Whether family contact would help");
    return lonelinessResult(input, riskScore, knownFacts, uncertainties, signals);
  }

  uncertainties.push("Sleep quality", "Medication adherence");
  return lowRiskResult(input, riskScore, knownFacts, uncertainties, signals, hasImprovement);
}

function highRiskResult(
  input: EvaluationInput,
  riskLevel: RiskLevel,
  riskScore: number,
  knownFacts: string[],
  uncertainties: string[],
  signalDrafts: SignalDraft[]
): EvaluationResult {
  const signals = materializeSignals(input, signalDrafts);

  return {
    riskState: {
      riskLevel,
      riskScore,
      knownFacts: dedupe(knownFacts),
      uncertainties: dedupe(uncertainties),
      nextGoal: "Clarify immediate safety and whether the daughter should be notified.",
      recommendedAction: "Create caregiver alert",
      alertRequired: true,
      signals
    },
    alert: {
      elderId: input.elderId,
      severity: riskLevel,
      title: "Safety risk detected during check-in",
      reason: "The conversation included safety signals that require caregiver follow-up.",
      suggestedAction: "Daughter should call now and confirm whether in-person help is needed.",
      evidence: dedupe(knownFacts)
    },
    agentTurn: {
      speaker: "ai",
      textJa: "それは心配ですね。今はお一人ですか？けがや痛みはありますか？念のため、ご家族に状況を知らせますね。",
      textEn: "That is concerning. Are you alone right now? Do you have any injury or pain? I will let your family know just to be safe."
    },
    newMemory: {
      elderId: input.elderId,
      category: "safety",
      text: `Safety concern during call: ${dedupe(knownFacts).join(", ")}.`,
      importance: "high"
    }
  };
}

function lonelinessResult(
  input: EvaluationInput,
  riskScore: number,
  knownFacts: string[],
  uncertainties: string[],
  signalDrafts: SignalDraft[]
): EvaluationResult {
  return {
    riskState: {
      riskLevel: "medium",
      riskScore,
      knownFacts: dedupe(knownFacts),
      uncertainties: dedupe(uncertainties),
      nextGoal: "Explore social contact gently without making the call feel clinical.",
      recommendedAction: "Suggest daughter calls this week",
      alertRequired: false,
      signals: materializeSignals(input, signalDrafts)
    },
    agentTurn: {
      speaker: "ai",
      textJa: "そうだったんですね。ここ数日は、誰かと電話したり、少し外に出たりする機会はありましたか？",
      textEn: "I see. In the past few days, have you had a chance to call anyone or go outside for a little while?"
    },
    newMemory: {
      elderId: input.elderId,
      category: "social",
      text: "Mentioned reduced recent social contact.",
      importance: "medium"
    }
  };
}

function lowRiskResult(
  input: EvaluationInput,
  riskScore: number,
  knownFacts: string[],
  uncertainties: string[],
  signalDrafts: SignalDraft[],
  hasImprovement: boolean
): EvaluationResult {
  return {
    riskState: {
      riskLevel: "low",
      riskScore,
      knownFacts: dedupe(knownFacts),
      uncertainties: dedupe(uncertainties),
      nextGoal: "Briefly check sleep and then close without over-questioning.",
      recommendedAction: "No caregiver action needed",
      alertRequired: false,
      signals: materializeSignals(input, signalDrafts)
    },
    agentTurn: {
      speaker: "ai",
      textJa: hasImprovement
        ? "少し良くなったんですね。安心しました。昨日は少しお疲れのようでしたが、昨夜は眠れましたか？"
        : "教えてくださってありがとうございます。昨日と比べて、今日は体のだるさや気分に変化はありますか？",
      textEn: hasImprovement
        ? "I am glad it is a little better. You sounded a little tired yesterday. Were you able to sleep last night?"
        : "Thank you for telling me. Compared with yesterday, has your energy or mood changed today?"
    },
    newMemory: hasImprovement
      ? {
          elderId: input.elderId,
          category: "health",
          text: "Reported improvement or stable condition during check-in.",
          importance: "medium"
        }
      : undefined
  };
}

function materializeSignals(input: EvaluationInput, signals: SignalDraft[]): RiskSignal[] {
  return signals.map((signal) => ({
    id: input.createId("signal"),
    label: signal.label,
    severity: signal.severity,
    evidence: signal.evidence,
    detectedAt: input.now()
  }));
}

function getRiskLevel(score: number, signals: SignalDraft[]): RiskLevel {
  if (signals.some((signal) => signal.severity === "urgent")) {
    return "urgent";
  }

  if (score >= 70) {
    return "high";
  }

  if (score >= 40) {
    return "medium";
  }

  return "low";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
