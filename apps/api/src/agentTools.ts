import type { AgentToolName, AgentToolOutput } from "@voice-agent/contracts";
import {
  AgentToolNameSchema,
  CreateAlertToolInputSchema,
  CreateAlertToolOutputSchema,
  FinalizeCallSummaryToolInputSchema,
  FinalizeCallSummaryToolOutputSchema,
  GetElderProfileToolInputSchema,
  GetElderProfileToolOutputSchema,
  GetRecentMemoriesToolInputSchema,
  GetRecentMemoriesToolOutputSchema,
  SaveMemoryToolInputSchema,
  SaveMemoryToolOutputSchema,
  UpdateCallStateToolInputSchema,
  UpdateCallStateToolOutputSchema
} from "@voice-agent/contracts";
import { z } from "zod";
import {
  createAlertTool,
  finalizeCallSummaryTool,
  getElderProfileTool,
  getRecentMemoriesTool,
  saveMemoryTool,
  updateCallStateTool
} from "./demoEngine.js";

export const AgentToolRouteParamsSchema = z.object({
  toolName: AgentToolNameSchema
});

export function handleAgentToolRequest(
  toolName: AgentToolName,
  body: unknown
): AgentToolOutput {
  const normalizedBody = normalizeToolBody(body);

  switch (toolName) {
    case "get_elder_profile":
      return GetElderProfileToolOutputSchema.parse(
        getElderProfileTool(GetElderProfileToolInputSchema.parse(normalizedBody))
      );
    case "get_recent_memories":
      return GetRecentMemoriesToolOutputSchema.parse(
        getRecentMemoriesTool(GetRecentMemoriesToolInputSchema.parse(normalizedBody))
      );
    case "update_call_state":
      return UpdateCallStateToolOutputSchema.parse(
        updateCallStateTool(UpdateCallStateToolInputSchema.parse(normalizedBody))
      );
    case "save_memory":
      return SaveMemoryToolOutputSchema.parse(
        saveMemoryTool(SaveMemoryToolInputSchema.parse(normalizedBody))
      );
    case "create_alert":
      return CreateAlertToolOutputSchema.parse(
        createAlertTool(CreateAlertToolInputSchema.parse(normalizedBody))
      );
    case "finalize_call_summary":
      return FinalizeCallSummaryToolOutputSchema.parse(
        finalizeCallSummaryTool(FinalizeCallSummaryToolInputSchema.parse(normalizedBody))
      );
  }
}

function normalizeToolBody(body: unknown): unknown {
  if (!isRecord(body) || !isRecord(body.arguments)) {
    return body;
  }

  return {
    elderId: body.elderId,
    sessionId: body.sessionId,
    ...body.arguments
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
