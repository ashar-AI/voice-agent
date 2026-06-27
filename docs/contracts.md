# Service Contracts

The demo is contract-first. Frontend and backend import the same schemas from `@voice-agent/contracts`, so API payloads, dashboard state, and future agent tool calls stay aligned.

## Current Services

```text
apps/web
  Caregiver dashboard and scenario runner.

apps/api
  Cloud Run-ready API, deterministic demo engine, future Gemini adapter host.

packages/contracts
  Shared Zod schemas and TypeScript types.
```

## Core Data Shapes

- `ElderProfile`: stable elder context, baseline habits, emergency contact.
- `MemoryItem`: longitudinal facts from prior calls.
- `CallSession`: active call identity, status, scenario, timestamps.
- `TranscriptTurn`: Japanese call line plus optional English translation.
- `RiskState`: realtime score, facts, uncertainties, next goal, action, signals.
- `AlertRecord`: caregiver-facing escalation with evidence and suggested action.
- `DashboardSnapshot`: full dashboard state returned after each meaningful update.

## HTTP API

```text
GET  /health
GET  /api/scenarios
GET  /api/elders/:elderId/snapshot
GET  /api/elders/:elderId/events
POST /api/demo/reset
POST /api/scenarios/start
POST /api/conversation/turn
POST /api/calls/:sessionId/complete
```

### Start Scenario

Request:

```json
{
  "elderId": "sato_001",
  "scenarioId": "fall_dizziness_escalation"
}
```

Response:

```json
{
  "session": { "...": "CallSession" },
  "snapshot": { "...": "DashboardSnapshot" },
  "agentOpening": { "...": "TranscriptTurn" }
}
```

### Conversation Turn

Request:

```json
{
  "elderId": "sato_001",
  "sessionId": "session_...",
  "textJa": "昨日ちょっと転んで、今日は立つとふらつきます。",
  "textEn": "I fell a little yesterday, and today I feel unsteady when I stand."
}
```

Response:

```json
{
  "elderTurn": { "...": "TranscriptTurn" },
  "agentTurn": { "...": "TranscriptTurn" },
  "snapshot": { "...": "DashboardSnapshot" }
}
```

### Complete Call

Response:

```json
{
  "session": { "...": "CallSession" },
  "summary": { "...": "CallSummary" },
  "snapshot": { "...": "DashboardSnapshot" }
}
```

## Future Realtime Event Contract

The push channel uses the existing `DashboardEvent` schema over Server-Sent Events:

```text
snapshot.updated
risk.updated
alert.created
call.completed
```

The dashboard still accepts direct HTTP responses, so the demo keeps working if SSE is unavailable.

## Future Agent Tool Contract

Gemini function calls should map to `AgentToolCall`:

```text
get_elder_profile
get_recent_memories
update_call_state
save_memory
create_alert
finalize_call_summary
```

The API owns persistence and alert side effects. The Gemini adapter should request tool calls but should not write directly to Firestore from the model layer.
