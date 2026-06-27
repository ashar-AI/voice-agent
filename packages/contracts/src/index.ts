import { z } from "zod";

export const RiskLevelSchema = z.enum(["stable", "watch", "concern", "high", "urgent"]);
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

export const CaregiverBriefingSchema = z.object({
  id: z.string(),
  elderId: z.string(),
  sessionId: z.string(),
  briefing: z.string(),
  evidenceBullets: z.array(z.string()),
  recommendedFamilyFollowUp: z.string(),
  safetyWording: z.string(),
  createdAt: z.string()
});
export type CaregiverBriefing = z.infer<typeof CaregiverBriefingSchema>;

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
  latestBriefing: CaregiverBriefingSchema.optional(),
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

export const LiveSessionBootstrapRequestSchema = z.object({
  elderId: z.string()
});
export type LiveSessionBootstrapRequest = z.infer<
  typeof LiveSessionBootstrapRequestSchema
>;

export const LiveSessionBootstrapResponseSchema = z.object({
  session: CallSessionSchema,
  snapshot: DashboardSnapshotSchema,
  agentOpening: TranscriptTurnSchema,
  adkWebsocketPath: z.string(),
  requiredAudioMimeType: z.literal("audio/pcm;rate=16000")
});
export type LiveSessionBootstrapResponse = z.infer<
  typeof LiveSessionBootstrapResponseSchema
>;

export const DashboardEventSchema = z.object({
  eventId: z.string(),
  eventType: z.enum([
    "snapshot.updated",
    "risk.updated",
    "alert.created",
    "call.completed",
    "briefing.created"
  ]),
  elderId: z.string(),
  sessionId: z.string().optional(),
  payload: DashboardSnapshotSchema,
  emittedAt: z.string()
});
export type DashboardEvent = z.infer<typeof DashboardEventSchema>;

export const AgentDecisionSchema = z.object({
  riskLevel: RiskLevelSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  openQuestions: z.array(z.string()),
  nextGoal: z.string(),
  recommendedAction: z.string(),
  shouldContinueConversation: z.boolean(),
  shouldCreateAlert: z.boolean(),
  shouldFinalizeCall: z.boolean()
});
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

export const AgentTurnRequestSchema = z.object({
  elderId: z.string(),
  sessionId: z.string().optional(),
  profile: ElderProfileSchema,
  memories: z.array(MemoryItemSchema),
  transcript: z.array(TranscriptTurnSchema),
  previousRiskState: RiskStateSchema,
  latestUserTurn: TranscriptTurnSchema.optional(),
  channel: z.enum(["text_demo", "browser_voice", "phone"])
});
export type AgentTurnRequest = z.infer<typeof AgentTurnRequestSchema>;

export const AgentTurnResponseSchema = z.object({
  decision: AgentDecisionSchema,
  agentTurn: z.object({
    speaker: z.literal("ai"),
    textJa: z.string(),
    textEn: z.string().optional()
  }),
  proposedMemory: MemoryItemSchema.omit({ id: true, observedAt: true }).optional(),
  proposedAlert: AlertRecordSchema.omit({
    id: true,
    createdAt: true,
    acknowledged: true
  }).optional(),
  proposedSummary: CallSummarySchema.omit({
    id: true,
    createdAt: true
  }).optional()
});
export type AgentTurnResponse = z.infer<typeof AgentTurnResponseSchema>;

export const AgentToolNameSchema = z.enum([
  "get_elder_profile",
  "get_recent_memories",
  "update_call_state",
  "save_memory",
  "create_alert",
  "finalize_call_summary"
]);
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;

export const GetElderProfileToolInputSchema = z.object({
  elderId: z.string()
});
export type GetElderProfileToolInput = z.infer<typeof GetElderProfileToolInputSchema>;

export const GetElderProfileToolOutputSchema = z.object({
  profile: ElderProfileSchema
});
export type GetElderProfileToolOutput = z.infer<typeof GetElderProfileToolOutputSchema>;

export const GetRecentMemoriesToolInputSchema = z.object({
  elderId: z.string(),
  limit: z.number().int().positive().max(20).optional()
});
export type GetRecentMemoriesToolInput = z.infer<typeof GetRecentMemoriesToolInputSchema>;

export const GetRecentMemoriesToolOutputSchema = z.object({
  memories: z.array(MemoryItemSchema)
});
export type GetRecentMemoriesToolOutput = z.infer<typeof GetRecentMemoriesToolOutputSchema>;

export const UpdateCallStateToolInputSchema = z.object({
  elderId: z.string(),
  sessionId: z.string(),
  decision: AgentDecisionSchema,
  riskState: RiskStateSchema,
  transcriptTurn: TranscriptTurnSchema.optional()
});
export type UpdateCallStateToolInput = z.infer<typeof UpdateCallStateToolInputSchema>;

export const UpdateCallStateToolOutputSchema = z.object({
  riskState: RiskStateSchema,
  snapshot: DashboardSnapshotSchema
});
export type UpdateCallStateToolOutput = z.infer<typeof UpdateCallStateToolOutputSchema>;

export const SaveMemoryToolInputSchema = MemoryItemSchema.omit({
  id: true,
  observedAt: true
}).extend({
  sessionId: z.string().optional()
});
export type SaveMemoryToolInput = z.infer<typeof SaveMemoryToolInputSchema>;

export const SaveMemoryToolOutputSchema = z.object({
  memory: MemoryItemSchema
});
export type SaveMemoryToolOutput = z.infer<typeof SaveMemoryToolOutputSchema>;

export const CreateAlertToolInputSchema = AlertRecordSchema.omit({
  id: true,
  createdAt: true,
  acknowledged: true
}).extend({
  sessionId: z.string().optional()
});
export type CreateAlertToolInput = z.infer<typeof CreateAlertToolInputSchema>;

export const CreateAlertToolOutputSchema = z.object({
  alert: AlertRecordSchema
});
export type CreateAlertToolOutput = z.infer<typeof CreateAlertToolOutputSchema>;

export const FinalizeCallSummaryToolInputSchema = CallSummarySchema.omit({
  id: true,
  createdAt: true
});
export type FinalizeCallSummaryToolInput = z.infer<typeof FinalizeCallSummaryToolInputSchema>;

export const FinalizeCallSummaryToolOutputSchema = z.object({
  summary: CallSummarySchema
});
export type FinalizeCallSummaryToolOutput = z.infer<typeof FinalizeCallSummaryToolOutputSchema>;

export const AgentToolInputSchema = z.discriminatedUnion("toolName", [
  GetElderProfileToolInputSchema.extend({ toolName: z.literal("get_elder_profile") }),
  GetRecentMemoriesToolInputSchema.extend({ toolName: z.literal("get_recent_memories") }),
  UpdateCallStateToolInputSchema.extend({ toolName: z.literal("update_call_state") }),
  SaveMemoryToolInputSchema.extend({ toolName: z.literal("save_memory") }),
  CreateAlertToolInputSchema.extend({ toolName: z.literal("create_alert") }),
  FinalizeCallSummaryToolInputSchema.extend({ toolName: z.literal("finalize_call_summary") })
]);
export type AgentToolInput = z.infer<typeof AgentToolInputSchema>;

export const AgentToolOutputSchema = z.union([
  GetElderProfileToolOutputSchema,
  GetRecentMemoriesToolOutputSchema,
  UpdateCallStateToolOutputSchema,
  SaveMemoryToolOutputSchema,
  CreateAlertToolOutputSchema,
  FinalizeCallSummaryToolOutputSchema
]);
export type AgentToolOutput = z.infer<typeof AgentToolOutputSchema>;

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
