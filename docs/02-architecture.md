# Architecture

Last updated: 2026-06-27 JST

## Product HLD

```text
Browser voice client / elder demo device
  -> CareVoice API: POST /api/live/session
  -> ADK voice-agent service
  -> Gemini Live API
  -> CareVoice API tool endpoints
  -> Firestore state
  -> SSE/dashboard events
  -> Caregiver dashboard

Post-call
  -> Managed Agent caregiver briefing
  -> Dashboard briefing panel
```

Phone-call/PSTN integration is out of hackathon scope. A browser microphone is
the live-call demo surface. Twilio or carrier phone calls can be added later by
feeding audio into the same ADK service.

## Current Status

Implemented:

```text
React caregiver dashboard
  -> Fastify API
  -> CareVoice state repository
  -> fallback or Gemini decision adapter
  -> validated tool handlers
  -> SSE/HTTP dashboard updates
```

```text
Browser/API live bootstrap
  -> POST /api/live/session
  -> services/adk-voice-agent scaffold
  -> ADK tool wrappers over CareVoice API tool endpoints
```

The fallback evaluator exists only to keep local development and hackathon backup demo reliable before Gemini credentials are available. It is not the target intelligence layer.

The state repository defaults to memory mode for deterministic local demos and can be switched to Firestore on Cloud Run with `STATE_REPOSITORY=firestore`.

Remaining implementation gaps:

- React microphone capture and PCM 16 kHz streaming are not wired yet.
- Browser WebSocket client for ADK events/audio playback is not wired yet.
- ADK Live session has not yet been smoke-tested with a real browser audio stream.
- ADK transcript/audio events are not yet mapped into dashboard transcript updates.
- Dashboard still includes secondary demo controls until Gemini Live is wired.
- Firestore mode is implemented locally but still needs deployed Cloud Run verification.
- ADK service deployment/containerization is not finished.

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

`services/adk-voice-agent`

- ADK Live streaming runtime
- realtime Japanese conversation loop
- Gemini Live model connection
- agent tool wrappers over CareVoice backend endpoints
- no direct database writes

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

ADK / Gemini Live API

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
2. Browser calls POST /api/live/session.
3. Backend creates an active CareVoice session and returns ADK WebSocket metadata.
4. Browser connects to the ADK voice-agent WebSocket.
5. ADK/Gemini Live agent loads profile and memory through tools.
6. ADK/Gemini Live agent starts Japanese conversation.
7. Elder responds naturally through browser audio.
8. ADK/Gemini produces risk decisions and calls CareVoice tools.
9. Tool handlers validate and persist state.
10. Backend emits DashboardEvent.
11. Caregiver dashboard updates passively.
12. ADK/Gemini finalizes call through tool.
13. Managed Agent creates caregiver briefing.
```

## Hard Boundaries

- Dashboard must never consume raw model output directly.
- Gemini must use CareVoice tools for persistent side effects.
- The live voice agent loop must not be controlled by dashboard buttons.
- Scenario IDs can seed demo inputs but must not determine risk.
- Fallback evaluator must stay behind an adapter interface.
- Alert creation must remain auditable and validated server-side.
