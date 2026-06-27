import type {
  AlertRecord,
  CallSummary,
  CallSession,
  ConversationTurnRequest,
  ConversationTurnResponse,
  DashboardEvent,
  DashboardSnapshot,
  MemoryItem,
  RiskState,
  ScenarioId,
  CompleteCallResponse,
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
import { evaluateUserTurn } from "./riskEvaluator.js";

type DemoState = {
  memories: MemoryItem[];
  session?: CallSession;
  transcript: TranscriptTurn[];
  riskState: RiskState;
  alerts: AlertRecord[];
  latestSummary?: CallSummary;
};

const state: DemoState = createResetState();
const listeners = new Set<(event: DashboardEvent) => void>();

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

function materializeTranscriptTurn(turn: Omit<TranscriptTurn, "id" | "timestamp">): TranscriptTurn {
  return {
    ...turn,
    id: id("turn"),
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
    latestSummary: state.latestSummary,
    updatedAt: now()
  };
}

function emit(eventType: DashboardEvent["eventType"]) {
  const currentSnapshot = snapshot();
  const event: DashboardEvent = {
    eventId: id("event"),
    eventType,
    elderId: DEMO_ELDER_ID,
    sessionId: state.session?.sessionId,
    payload: currentSnapshot,
    emittedAt: now()
  };

  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeDashboardEvents(
  listener: (event: DashboardEvent) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetDemoState(): DashboardSnapshot {
  const next = createResetState();
  state.memories = next.memories;
  state.session = undefined;
  state.transcript = next.transcript;
  state.riskState = next.riskState;
  state.alerts = next.alerts;
  state.latestSummary = undefined;
  const currentSnapshot = snapshot();
  emit("snapshot.updated");
  return currentSnapshot;
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
  emit("snapshot.updated");

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

  const evaluation = evaluateUserTurn({
    elderId: input.elderId,
    textJa: input.textJa,
    textEn: input.textEn,
    profile: demoProfile,
    memories: state.memories,
    previousRiskState: state.riskState,
    createId: id,
    now
  });

  state.riskState = evaluation.riskState;

  if (evaluation.newMemory) {
    state.memories = [
      {
        ...evaluation.newMemory,
        id: id("mem"),
        observedAt: now()
      },
      ...state.memories
    ];
  }

  if (evaluation.alert && !state.alerts.some((item) => item.title === evaluation.alert?.title)) {
    state.alerts = [
      {
        ...evaluation.alert,
        id: id("alert"),
        createdAt: now(),
        acknowledged: false
      },
      ...state.alerts
    ];
  }

  const agentTurn = materializeTranscriptTurn(evaluation.agentTurn);
  state.transcript.push(agentTurn);
  emit(state.riskState.alertRequired ? "alert.created" : "risk.updated");

  return {
    elderTurn,
    agentTurn,
    snapshot: snapshot()
  };
}

export function completeCallSession(sessionId: string): CompleteCallResponse {
  if (!state.session || state.session.sessionId !== sessionId) {
    throw new Error("No active matching session");
  }

  const completedSession: CallSession = {
    ...state.session,
    status: "completed",
    completedAt: now()
  };

  const summary: CallSummary = {
    id: id("summary"),
    elderId: completedSession.elderId,
    sessionId: completedSession.sessionId,
    summary: createSummaryText(),
    riskLevel: state.riskState.riskLevel,
    riskScore: state.riskState.riskScore,
    keyEvidence: state.riskState.knownFacts,
    recommendedFollowUp: state.riskState.recommendedAction,
    createdAt: now()
  };

  state.session = completedSession;
  state.latestSummary = summary;
  emit("call.completed");

  return {
    session: completedSession,
    summary,
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

function createSummaryText(): string {
  if (state.riskState.alertRequired) {
    return "Check-in found safety signals that require caregiver follow-up.";
  }

  if (state.riskState.riskLevel === "medium") {
    return "Check-in found a non-urgent well-being concern that should be followed up softly.";
  }

  return "Check-in completed without evidence requiring caregiver action.";
}
