import { z } from "zod";

export const RiskLevelSchema = z.enum(["low", "medium", "high", "urgent"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const CallStatusSchema = z.enum(["idle", "active", "completed"]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const ScenarioIdSchema = z.enum([
  "normal_check_in",
  "loneliness_decline",
  "fall_dizziness_escalation"
]);
export type ScenarioId = z.infer<typeof ScenarioIdSchema>;

export const SpeakerSchema = z.enum(["ai", "elder", "system"]);
export type Speaker = z.infer<typeof SpeakerSchema>;

export const ElderProfileSchema = z.object({
  elderId: z.string(),
  displayName: z.string(),
  age: z.number().int().positive(),
  preferredLanguage: z.literal("ja"),
  livesAlone: z.boolean(),
  emergencyContactName: z.string(),
  emergencyContactRelation: z.string(),
  baseline: z.object({
    usualMood: z.string(),
    usualEnergy: z.string(),
    dailyHabits: z.array(z.string())
  })
});
export type ElderProfile = z.infer<typeof ElderProfileSchema>;

export const MemoryItemSchema = z.object({
  id: z.string(),
  elderId: z.string(),
  category: z.enum(["health", "mood", "habit", "social", "safety"]),
  text: z.string(),
  observedAt: z.string(),
  importance: z.enum(["low", "medium", "high"])
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const TranscriptTurnSchema = z.object({
  id: z.string(),
  speaker: SpeakerSchema,
  textJa: z.string(),
  textEn: z.string().optional(),
  timestamp: z.string()
});
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;

export const RiskSignalSchema = z.object({
  id: z.string(),
  label: z.string(),
  severity: RiskLevelSchema,
  evidence: z.string(),
  detectedAt: z.string()
});
export type RiskSignal = z.infer<typeof RiskSignalSchema>;

export const RiskStateSchema = z.object({
  riskLevel: RiskLevelSchema,
  riskScore: z.number().int().min(0).max(100),
  knownFacts: z.array(z.string()),
  uncertainties: z.array(z.string()),
  nextGoal: z.string(),
  recommendedAction: z.string(),
  alertRequired: z.boolean(),
  signals: z.array(RiskSignalSchema)
});
export type RiskState = z.infer<typeof RiskStateSchema>;

export const AlertRecordSchema = z.object({
  id: z.string(),
  elderId: z.string(),
  severity: RiskLevelSchema,
  title: z.string(),
  reason: z.string(),
  suggestedAction: z.string(),
  evidence: z.array(z.string()),
  createdAt: z.string(),
  acknowledged: z.boolean()
});
export type AlertRecord = z.infer<typeof AlertRecordSchema>;

export const CallSummarySchema = z.object({
  id: z.string(),
  elderId: z.string(),
  sessionId: z.string(),
  summary: z.string(),
  riskLevel: RiskLevelSchema,
  riskScore: z.number().int().min(0).max(100),
  keyEvidence: z.array(z.string()),
  recommendedFollowUp: z.string(),
  createdAt: z.string()
});
export type CallSummary = z.infer<typeof CallSummarySchema>;

export const CallSessionSchema = z.object({
  sessionId: z.string(),
  elderId: z.string(),
  scenarioId: ScenarioIdSchema,
  status: CallStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().optional()
});
export type CallSession = z.infer<typeof CallSessionSchema>;

export const DashboardSnapshotSchema = z.object({
  profile: ElderProfileSchema,
  memories: z.array(MemoryItemSchema),
  session: CallSessionSchema.optional(),
  transcript: z.array(TranscriptTurnSchema),
  riskState: RiskStateSchema,
  alerts: z.array(AlertRecordSchema),
  latestSummary: CallSummarySchema.optional(),
  updatedAt: z.string()
});
export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>;

export const DemoScenarioSchema = z.object({
  scenarioId: ScenarioIdSchema,
  title: z.string(),
  purpose: z.string(),
  elderLineJa: z.string(),
  elderLineEn: z.string(),
  expectedOutcome: z.string()
});
export type DemoScenario = z.infer<typeof DemoScenarioSchema>;

export const StartScenarioRequestSchema = z.object({
  elderId: z.string(),
  scenarioId: ScenarioIdSchema
});
export type StartScenarioRequest = z.infer<typeof StartScenarioRequestSchema>;

export const StartScenarioResponseSchema = z.object({
  session: CallSessionSchema,
  snapshot: DashboardSnapshotSchema,
  agentOpening: TranscriptTurnSchema
});
export type StartScenarioResponse = z.infer<typeof StartScenarioResponseSchema>;

export const ConversationTurnRequestSchema = z.object({
  elderId: z.string(),
  sessionId: z.string(),
  textJa: z.string(),
  textEn: z.string().optional()
});
export type ConversationTurnRequest = z.infer<typeof ConversationTurnRequestSchema>;

export const ConversationTurnResponseSchema = z.object({
  elderTurn: TranscriptTurnSchema,
  agentTurn: TranscriptTurnSchema,
  snapshot: DashboardSnapshotSchema
});
export type ConversationTurnResponse = z.infer<typeof ConversationTurnResponseSchema>;

export const CompleteCallResponseSchema = z.object({
  session: CallSessionSchema,
  summary: CallSummarySchema,
  snapshot: DashboardSnapshotSchema
});
export type CompleteCallResponse = z.infer<typeof CompleteCallResponseSchema>;

export const DashboardEventSchema = z.object({
  eventId: z.string(),
  eventType: z.enum(["snapshot.updated", "risk.updated", "alert.created", "call.completed"]),
  elderId: z.string(),
  sessionId: z.string().optional(),
  payload: DashboardSnapshotSchema,
  emittedAt: z.string()
});
export type DashboardEvent = z.infer<typeof DashboardEventSchema>;

export const AgentToolNameSchema = z.enum([
  "get_elder_profile",
  "get_recent_memories",
  "update_call_state",
  "save_memory",
  "create_alert",
  "finalize_call_summary"
]);
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;

export const AgentToolCallSchema = z.object({
  toolName: AgentToolNameSchema,
  elderId: z.string(),
  sessionId: z.string().optional(),
  arguments: z.record(z.unknown())
});
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;

export function parseContract<T>(schema: z.ZodSchema<T>, value: unknown): T {
  return schema.parse(value);
}
