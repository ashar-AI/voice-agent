import cors from "@fastify/cors";
import {
  ConversationTurnRequestSchema,
  StartScenarioRequestSchema
} from "@voice-agent/contracts";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import { DEMO_ELDER_ID, demoScenarios } from "./demoData.js";
import {
  completeCallSession,
  getDashboardSnapshot,
  handleConversationTurn,
  resetDemoState,
  startScenario,
  subscribeDashboardEvents
} from "./demoEngine.js";

const ElderParamsSchema = z.object({
  elderId: z.string()
});

const SessionParamsSchema = z.object({
  sessionId: z.string()
});

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

  app.get("/api/elders/:elderId/snapshot", async (request, reply) => {
    try {
      const params = ElderParamsSchema.parse(request.params);
      assertKnownElder(params.elderId);
      return getDashboardSnapshot();
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  app.get("/api/elders/:elderId/events", async (request, reply) => {
    try {
      const params = ElderParamsSchema.parse(request.params);
      assertKnownElder(params.elderId);

      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "access-control-allow-origin": process.env.WEB_ORIGIN ?? "http://localhost:5173"
      });

      const writeEvent = (event: unknown) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const unsubscribe = subscribeDashboardEvents(writeEvent);
      writeEvent({
        eventId: "initial",
        eventType: "snapshot.updated",
        elderId: params.elderId,
        payload: getDashboardSnapshot(),
        emittedAt: new Date().toISOString()
      });

      request.raw.on("close", unsubscribe);
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

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
      return await handleConversationTurn(input);
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  app.post("/api/calls/:sessionId/complete", async (request, reply) => {
    try {
      const params = SessionParamsSchema.parse(request.params);
      return completeCallSession(params.sessionId);
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  return app;
}

function assertKnownElder(elderId: string) {
  if (elderId !== DEMO_ELDER_ID) {
    throw new Error(`Unknown elder: ${elderId}`);
  }
}

function handleRouteError(
  reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
  error: unknown
) {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: "Invalid request",
      details: error.flatten()
    });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return reply.code(400).send({
    error: message
  });
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? "0.0.0.0";

  const app = buildServer();
  await app.listen({ port, host });
}
