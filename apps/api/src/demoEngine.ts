import type {
  AlertRecord,
  CallSummary,
  CallSession,
  CreateAlertToolInput,
  CreateAlertToolOutput,
  ConversationTurnRequest,
  ConversationTurnResponse,
  DashboardEvent,
  DashboardSnapshot,
  FinalizeCallSummaryToolInput,
  FinalizeCallSummaryToolOutput,
  GetElderProfileToolInput,
  GetElderProfileToolOutput,
  GetRecentMemoriesToolInput,
  GetRecentMemoriesToolOutput,
  MemoryItem,
  RiskState,
  ScenarioId,
  CompleteCallResponse,
  SaveMemoryToolInput,
  SaveMemoryToolOutput,
  StartScenarioRequest,
  StartScenarioResponse,
  TranscriptTurn,
  UpdateCallStateToolInput,
  UpdateCallStateToolOutput
} from "@voice-agent/contracts";
import {
  DEMO_ELDER_ID,
  baseMemories,
  createInitialRiskState,
  demoProfile,
  getScenario
} from "./demoData.js";
import { createWelfareCheckAgent } from "./welfareCheckAgent.js";

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
const welfareCheckAgent = createWelfareCheckAgent();

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

export function getElderProfileTool(
  input: GetElderProfileToolInput
): GetElderProfileToolOutput {
  assertKnownElder(input.elderId);
  return {
    profile: demoProfile
  };
}

export function getRecentMemoriesTool(
  input: GetRecentMemoriesToolInput
): GetRecentMemoriesToolOutput {
  assertKnownElder(input.elderId);
  const sortedMemories = [...state.memories]
    .filter((memory) => memory.elderId === input.elderId)
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt));

  return {
    memories: sortedMemories.slice(0, input.limit ?? sortedMemories.length)
  };
}

export function updateCallStateTool(
  input: UpdateCallStateToolInput
): UpdateCallStateToolOutput {
  assertKnownElder(input.elderId);
  assertMatchingSession(input.sessionId);

  state.riskState = input.riskState;
  if (input.transcriptTurn) {
    state.transcript.push(input.transcriptTurn);
  }

  emit("risk.updated");

  return {
    riskState: state.riskState,
    snapshot: snapshot()
  };
}

export function saveMemoryTool(input: SaveMemoryToolInput): SaveMemoryToolOutput {
  assertKnownElder(input.elderId);
  assertOptionalMatchingSession(input.sessionId);

  const memory: MemoryItem = {
    elderId: input.elderId,
    category: input.category,
    text: input.text,
    importance: input.importance,
    id: id("mem"),
    observedAt: now()
  };

  state.memories = [memory, ...state.memories];
  emit("snapshot.updated");

  return {
    memory
  };
}

export function createAlertTool(input: CreateAlertToolInput): CreateAlertToolOutput {
  assertKnownElder(input.elderId);
  assertOptionalMatchingSession(input.sessionId);

  const alert: AlertRecord = {
    elderId: input.elderId,
    severity: input.severity,
    title: input.title,
    reason: input.reason,
    suggestedAction: input.suggestedAction,
    evidence: input.evidence,
    id: id("alert"),
    createdAt: now(),
    acknowledged: false
  };

  state.alerts = [alert, ...state.alerts];
  emit("alert.created");

  return {
    alert
  };
}

export function finalizeCallSummaryTool(
  input: FinalizeCallSummaryToolInput
): FinalizeCallSummaryToolOutput {
  assertKnownElder(input.elderId);
  const session = assertMatchingSession(input.sessionId);

  const summary: CallSummary = {
    elderId: input.elderId,
    sessionId: input.sessionId,
    summary: input.summary,
    riskLevel: input.riskLevel,
    riskScore: input.riskScore,
    keyEvidence: input.keyEvidence,
    recommendedFollowUp: input.recommendedFollowUp,
    id: id("summary"),
    createdAt: now()
  };

  state.session = {
    ...session,
    status: "completed",
    completedAt: now()
  };
  state.latestSummary = summary;
  emit("call.completed");

  return {
    summary
  };
}

export function startScenario(input: StartScenarioRequest): StartScenarioResponse {
  assertKnownElder(input.elderId);

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

function assertKnownElder(elderId: string) {
  if (elderId !== DEMO_ELDER_ID) {
    throw new Error(`Unknown elder: ${elderId}`);
  }
}

function assertMatchingSession(sessionId: string): CallSession {
  if (!state.session || state.session.sessionId !== sessionId) {
    throw new Error("No active matching session");
  }

  return state.session;
}

function assertOptionalMatchingSession(sessionId: string | undefined) {
  if (sessionId) {
    assertMatchingSession(sessionId);
  }
}

export async function handleConversationTurn(
  input: ConversationTurnRequest
): Promise<ConversationTurnResponse> {
  if (!state.session || state.session.sessionId !== input.sessionId) {
    throw new Error("No active matching session");
  }

  const elderTurn = transcriptTurn("elder", input.textJa, input.textEn);
  state.transcript.push(elderTurn);

  const agentResult = await welfareCheckAgent.createTurn({
    elderId: input.elderId,
    sessionId: input.sessionId,
    profile: demoProfile,
    memories: state.memories,
    transcript: state.transcript,
    previousRiskState: state.riskState,
    latestUserTurn: elderTurn,
    channel: "text_demo"
  }, {
    createId: id,
    now
  });

  state.riskState = agentResult.riskState;

  if (agentResult.proposedMemory) {
    state.memories = [
      {
        ...agentResult.proposedMemory,
        id: id("mem"),
        observedAt: now()
      },
      ...state.memories
    ];
  }

  if (
    agentResult.proposedAlert &&
    !state.alerts.some((item) => item.title === agentResult.proposedAlert?.title)
  ) {
    state.alerts = [
      {
        ...agentResult.proposedAlert,
        id: id("alert"),
        createdAt: now(),
        acknowledged: false
      },
      ...state.alerts
    ];
  }

  const agentTurn = materializeTranscriptTurn(agentResult.agentTurn);
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

  if (state.riskState.riskLevel === "concern") {
    return "Check-in found a non-urgent well-being concern that should be followed up softly.";
  }

  return "Check-in completed without evidence requiring caregiver action.";
}
