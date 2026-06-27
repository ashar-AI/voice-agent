import {
  CompleteCallResponseSchema,
  ConversationTurnResponseSchema,
  DashboardEventSchema,
  DashboardSnapshotSchema,
  DemoScenarioSchema,
  StartScenarioResponseSchema,
  type CompleteCallResponse,
  type ConversationTurnResponse,
  type DashboardEvent,
  type DashboardSnapshot,
  type DemoScenario,
  type ScenarioId,
  type StartScenarioResponse
} from "@voice-agent/contracts";
import { z } from "zod";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

async function fetchContract<T>(
  path: string,
  schema: z.ZodSchema<T>,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }

  return schema.parse(body);
}

export async function getScenarios(): Promise<DemoScenario[]> {
  return fetchContract("/api/scenarios", z.array(DemoScenarioSchema));
}

export async function getSnapshot(elderId: string): Promise<DashboardSnapshot> {
  return fetchContract(`/api/elders/${elderId}/snapshot`, DashboardSnapshotSchema);
}

export async function resetDemo(): Promise<DashboardSnapshot> {
  return fetchContract("/api/demo/reset", DashboardSnapshotSchema, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function startScenario(
  elderId: string,
  scenarioId: ScenarioId
): Promise<StartScenarioResponse> {
  return fetchContract("/api/scenarios/start", StartScenarioResponseSchema, {
    method: "POST",
    body: JSON.stringify({ elderId, scenarioId })
  });
}

export async function sendConversationTurn(input: {
  elderId: string;
  sessionId: string;
  textJa: string;
  textEn?: string;
}): Promise<ConversationTurnResponse> {
  return fetchContract("/api/conversation/turn", ConversationTurnResponseSchema, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function completeCall(sessionId: string): Promise<CompleteCallResponse> {
  return fetchContract(`/api/calls/${sessionId}/complete`, CompleteCallResponseSchema, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function createDashboardEventSource(
  elderId: string,
  onEvent: (event: DashboardEvent) => void,
  onError: () => void
): EventSource {
  const source = new EventSource(`${API_BASE_URL}/api/elders/${elderId}/events`);

  source.onmessage = (message) => {
    const parsed = DashboardEventSchema.safeParse(JSON.parse(message.data));
    if (parsed.success) {
      onEvent(parsed.data);
    }
  };

  source.onerror = () => {
    onError();
  };

  return source;
}
