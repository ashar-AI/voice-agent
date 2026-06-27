# Contracts

Last updated: 2026-06-27 JST

Contracts live in `packages/contracts`. Frontend and backend must import shared types from there.

## Source Of Truth

- Product behavior: [`01-product-requirements.md`](./01-product-requirements.md)
- Architecture ownership: [`02-architecture.md`](./02-architecture.md)
- Implementation sequence: [`03-implementation-plan.md`](./03-implementation-plan.md)

## Core Shapes

- `ElderProfile`
- `MemoryItem`
- `CallSession`
- `TranscriptTurn`
- `RiskState`
- `AlertRecord`
- `CallSummary`
- `CaregiverBriefing`
- `DashboardSnapshot`
- `DashboardEvent`
- `AgentDecision`
- `AgentTurnRequest`
- `AgentTurnResponse`
- tool input/output schemas

## Risk Levels

Use the locked five-level product vocabulary:

```text
stable
watch
concern
high
urgent
```

Do not reintroduce `low` or `medium` as risk levels. Those words may still exist for unrelated fields such as memory importance.

## Current HTTP API

```text
GET  /health
GET  /api/scenarios
GET  /api/elders/:elderId/snapshot
GET  /api/elders/:elderId/events
POST /api/demo/reset
POST /api/scenarios/start
POST /api/conversation/turn
POST /api/agent-tools/:toolName
POST /api/calls/:sessionId/complete
```

The scenario and conversation routes support local fallback/demo mode. They are not the final Gemini Live interface.

## Tool API

Gemini function calls map to:

```text
get_elder_profile
get_recent_memories
update_call_state
save_memory
create_alert
finalize_call_summary
```

Each tool has a shared input and output schema in `packages/contracts`.

Internal HTTP route:

```text
POST /api/agent-tools/:toolName
```

Rules:

- validate input with Zod
- return model-safe JSON
- persist only through server-owned tool handlers
- emit `DashboardEvent` after meaningful state changes

## Dashboard Events

Use Server-Sent Events for live dashboard updates:

```text
snapshot.updated
risk.updated
alert.created
call.completed
briefing.created
```

Dashboard consumes snapshots/events, not raw Gemini output.
