import type {
  AlertRecord,
  CallSession,
  ConversationTurnRequest,
  ConversationTurnResponse,
  DashboardSnapshot,
  MemoryItem,
  RiskState,
  ScenarioId,
  StartScenarioRequest,
  StartScenarioResponse,
  TranscriptTurn
} from "@voice-agent/contracts";
import {
  DEMO_ELDER_ID,
  baseMemories,
  createInitialRiskState,
  demoProfile,
  getScenario
} from "./demoData.js";

type DemoState = {
  memories: MemoryItem[];
  session?: CallSession;
  transcript: TranscriptTurn[];
  riskState: RiskState;
  alerts: AlertRecord[];
};

const state: DemoState = createResetState();

function createResetState(): DemoState {
  return {
    memories: [...baseMemories],
    transcript: [],
    riskState: createInitialRiskState(),
    alerts: []
  };
}

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function transcriptTurn(
  speaker: TranscriptTurn["speaker"],
  textJa: string,
  textEn?: string
): TranscriptTurn {
  return {
    id: id("turn"),
    speaker,
    textJa,
    textEn,
    timestamp: now()
  };
}

function snapshot(): DashboardSnapshot {
  return {
    profile: demoProfile,
    memories: state.memories,
    session: state.session,
    transcript: state.transcript,
    riskState: state.riskState,
    alerts: state.alerts,
    updatedAt: now()
  };
}

export function resetDemoState(): DashboardSnapshot {
  const next = createResetState();
  state.memories = next.memories;
  state.session = undefined;
  state.transcript = next.transcript;
  state.riskState = next.riskState;
  state.alerts = next.alerts;
  return snapshot();
}

export function getDashboardSnapshot(): DashboardSnapshot {
  return snapshot();
}

export function startScenario(input: StartScenarioRequest): StartScenarioResponse {
  if (input.elderId !== DEMO_ELDER_ID) {
    throw new Error(`Unknown elder: ${input.elderId}`);
  }

  resetDemoState();

  const session: CallSession = {
    sessionId: id("session"),
    elderId: input.elderId,
    scenarioId: input.scenarioId,
    status: "active",
    startedAt: now()
  };

  const agentOpening = createOpeningTurn(input.scenarioId);
  state.session = session;
  state.transcript = [agentOpening];

  return {
    session,
    snapshot: snapshot(),
    agentOpening
  };
}

export function handleConversationTurn(
  input: ConversationTurnRequest
): ConversationTurnResponse {
  if (!state.session || state.session.sessionId !== input.sessionId) {
    throw new Error("No active matching session");
  }

  const elderTurn = transcriptTurn("elder", input.textJa, input.textEn);
  state.transcript.push(elderTurn);

  const { agentTurn, riskState, newMemory, alert } = evaluateTurn(
    state.session.scenarioId,
    input
  );

  state.riskState = riskState;

  if (newMemory) {
    state.memories = [newMemory, ...state.memories];
  }

  if (alert && !state.alerts.some((item) => item.title === alert.title)) {
    state.alerts = [alert, ...state.alerts];
  }

  state.transcript.push(agentTurn);

  return {
    elderTurn,
    agentTurn,
    snapshot: snapshot()
  };
}

function createOpeningTurn(scenarioId: ScenarioId): TranscriptTurn {
  const scenario = getScenario(scenarioId);

  if (scenario.scenarioId === "loneliness_decline") {
    return transcriptTurn(
      "ai",
      "佐藤さん、こんにちは。昨日は少しお疲れのようでしたが、今日はどんな感じですか？",
      "Hello Sato-san. Yesterday you sounded a little tired. How are you feeling today?"
    );
  }

  return transcriptTurn(
    "ai",
    "佐藤さん、こんにちは。先週、膝が痛いとおっしゃっていましたが、その後どうですか？",
    "Hello Sato-san. Last week you mentioned your knee was hurting. How has it been since then?"
  );
}

function evaluateTurn(
  scenarioId: ScenarioId,
  input: ConversationTurnRequest
): {
  agentTurn: TranscriptTurn;
  riskState: RiskState;
  newMemory?: MemoryItem;
  alert?: AlertRecord;
} {
  if (scenarioId === "normal_check_in") {
    const newMemory: MemoryItem = {
      id: id("mem"),
      elderId: input.elderId,
      category: "health",
      text: "Knee pain appears to be improving compared with last week.",
      observedAt: now(),
      importance: "medium"
    };

    return {
      newMemory,
      riskState: {
        riskLevel: "low",
        riskScore: 16,
        knownFacts: ["Knee pain improving", "Conversational tone stable"],
        uncertainties: ["Sleep quality", "Medication adherence"],
        nextGoal: "Briefly check sleep and then close without over-questioning.",
        recommendedAction: "No caregiver action needed",
        alertRequired: false,
        signals: []
      },
      agentTurn: transcriptTurn(
        "ai",
        "少し良くなったんですね。安心しました。昨日は少しお疲れのようでしたが、昨夜は眠れましたか？",
        "I am glad it is a little better. You sounded a little tired yesterday. Were you able to sleep last night?"
      )
    };
  }

  if (scenarioId === "loneliness_decline") {
    return {
      riskState: {
        riskLevel: "medium",
        riskScore: 48,
        knownFacts: ["Has not talked to people much recently", "No immediate physical complaint"],
        uncertainties: ["Mood duration", "Whether family contact would help"],
        nextGoal: "Explore social contact gently without making the call feel clinical.",
        recommendedAction: "Suggest daughter calls this week",
        alertRequired: false,
        signals: [
          {
            id: id("signal"),
            label: "Reduced social contact",
            severity: "medium",
            evidence: input.textJa,
            detectedAt: now()
          }
        ]
      },
      agentTurn: transcriptTurn(
        "ai",
        "そうだったんですね。ここ数日は、誰かと電話したり、少し外に出たりする機会はありましたか？",
        "I see. In the past few days, have you had a chance to call anyone or go outside for a little while?"
      )
    };
  }

  const alert: AlertRecord = {
    id: id("alert"),
    elderId: input.elderId,
    severity: "high",
    title: "Fall and dizziness reported",
    reason: "Sato-san reported falling yesterday and feeling unsteady when standing today.",
    suggestedAction: "Daughter should call now and confirm whether in-person help is needed.",
    evidence: [
      "Reported a fall yesterday",
      "Feels dizzy or unsteady when standing",
      "Lives alone",
      "Recent knee pain memory increases concern"
    ],
    createdAt: now(),
    acknowledged: false
  };

  return {
    alert,
    riskState: {
      riskLevel: "high",
      riskScore: 82,
      knownFacts: ["Fell yesterday", "Feels unsteady when standing", "Lives alone"],
      uncertainties: ["Injury severity", "Whether they can move safely", "Whether immediate help is nearby"],
      nextGoal: "Clarify immediate safety and whether the daughter should be notified.",
      recommendedAction: "Create caregiver alert",
      alertRequired: true,
      signals: [
        {
          id: id("signal"),
          label: "Fall",
          severity: "high",
          evidence: "昨日ちょっと転んで",
          detectedAt: now()
        },
        {
          id: id("signal"),
          label: "Dizziness when standing",
          severity: "high",
          evidence: "今日は立つとふらつきます",
          detectedAt: now()
        }
      ]
    },
    agentTurn: transcriptTurn(
      "ai",
      "それは心配ですね。今はお一人ですか？けがや痛みはありますか？念のため、ご家族に状況を知らせますね。",
      "That is concerning. Are you alone right now? Do you have any injury or pain? I will let your family know just to be safe."
    )
  };
}
