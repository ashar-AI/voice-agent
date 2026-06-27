# Architecture

Last updated: 2026-06-27 JST

## Target Architecture

```text
Browser voice client
  -> Gemini Live API
  -> CareVoice Cloud Run backend
  -> CareVoice tool endpoints
  -> Firestore state
  -> SSE/dashboard events
  -> Caregiver dashboard

Post-call
  -> Managed Agent caregiver briefing
  -> Dashboard briefing panel
```

## Current Scaffold

Current implementation is a local scaffold:

```text
React caregiver dashboard
  -> Fastify API
  -> in-memory demo state
  -> fallback local evaluator
  -> SSE/HTTP dashboard updates
```

The fallback evaluator exists only to keep local development and hackathon backup demo reliable before Gemini credentials are available. It is not the target intelligence layer.

Known scaffold gaps:

- current code still uses the older fallback risk enum until Phase 1 migrates contracts to `stable/watch/concern/high/urgent`
- current dashboard still includes secondary demo controls until Gemini Live is wired
- current state is in-memory until Firestore is added

## Service Responsibilities

`apps/web`

- caregiver command center
- live transcript/risk/alert/summary display
- secondary demo controls until voice is wired
- consumes snapshots/events only

`apps/api`

- Cloud Run backend
- session orchestration
- tool endpoint validation
- persistence adapter
- Gemini adapter host
- fallback evaluator host

`packages/contracts`

- shared Zod schemas and TypeScript types
- API contracts
- event contracts
- tool payload contracts
- agent decision contracts

Firestore

- elder profile
- memories
- call sessions
- transcript turns
- risk state
- alerts
- call summaries
- Managed Agent briefings

Gemini Live API

- realtime Japanese voice
- adaptive conversation
- function/tool calling
- next question and call continuation decisions

Gemini 3.5 Flash

- structured risk extraction
- memory update proposal
- alert explanation
- post-call summary

Managed Agent

- post-call caregiver briefing bonus feature

## Data Flow

```text
1. Check-in starts.
2. Backend loads profile and recent memories.
3. Gemini Live agent starts Japanese conversation.
4. Elder responds naturally.
5. Gemini produces AgentDecision and calls tools.
6. Tool handlers validate and persist state.
7. Backend emits DashboardEvent.
8. Caregiver dashboard updates passively.
9. Gemini finalizes call through tool.
10. Managed Agent creates caregiver briefing.
```

## Hard Boundaries

- Dashboard must never consume raw model output directly.
- Gemini must use CareVoice tools for persistent side effects.
- Scenario IDs can seed demo inputs but must not determine risk.
- Fallback evaluator must stay behind an adapter interface.
- Alert creation must remain auditable and validated server-side.
