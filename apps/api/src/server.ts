import cors from "@fastify/cors";
import {
  ConversationTurnRequestSchema,
  StartScenarioRequestSchema
} from "@voice-agent/contracts";
import Fastify from "fastify";
import { ZodError } from "zod";
import { demoScenarios } from "./demoData.js";
import {
  getDashboardSnapshot,
  handleConversationTurn,
  resetDemoState,
  startScenario
} from "./demoEngine.js";

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173"
  });

  app.get("/health", async () => ({
    ok: true,
    service: "voice-agent-api",
    timestamp: new Date().toISOString()
  }));

  app.get("/api/scenarios", async () => demoScenarios);

  app.get("/api/elders/:elderId/snapshot", async () => getDashboardSnapshot());

  app.post("/api/demo/reset", async () => resetDemoState());

  app.post("/api/scenarios/start", async (request, reply) => {
    try {
      const input = StartScenarioRequestSchema.parse(request.body);
      return startScenario(input);
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  app.post("/api/conversation/turn", async (request, reply) => {
    try {
      const input = ConversationTurnRequestSchema.parse(request.body);
      return handleConversationTurn(input);
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  return app;
}

function handleRouteError(reply: { code: (statusCode: number) => unknown }, error: unknown) {
  if (error instanceof ZodError) {
    return reply.code(400), {
      error: "Invalid request",
      details: error.flatten()
    };
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return reply.code(400), {
    error: message
  };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? "0.0.0.0";

  const app = buildServer();
  await app.listen({ port, host });
}
