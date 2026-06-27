# Browser Voice Plan

Last updated: 2026-06-27 JST

Purpose: concrete implementation checklist for T60 Browser Voice Session using
ADK Live.

## Decision

Use an ADK voice-agent service as the realtime call runtime.

```text
Browser microphone
  -> services/adk-voice-agent WebSocket
  -> ADK Live / Gemini Live
  -> CareVoice tool wrappers
  -> apps/api validated tool endpoints
  -> Firestore + SSE dashboard
```

Reason: the real product must not be a caregiver-driven turn processor. ADK
keeps the conversation loop, tool choice, interruption behavior, and next
question selection inside the agent runtime. CareVoice remains responsible for
state validation, persistence, audit trail, and dashboard rendering.

Phone-call/PSTN integration is out of scope for the hackathon. Browser voice is
the live-call demo surface.

## Target Flow

```text
Caregiver clicks Start Voice Demo
  -> Web calls POST /api/live/session on apps/api
  -> API creates active CallSession and initial memory-aware opening turn
  -> API returns session, snapshot, ADK WebSocket path, audio MIME type
  -> Browser connects to services/adk-voice-agent /ws/{elderId}/{sessionId}
  -> Browser streams microphone audio as audio/pcm;rate=16000
  -> ADK/Gemini talks naturally in Japanese
  -> ADK/Gemini calls CareVoice tool wrappers when state changes
  -> Tool wrappers call /api/agent-tools/:toolName
  -> Dashboard updates through existing SSE snapshots/events
```

## Current Status

Done:

- `POST /api/live/session` contract and backend bootstrap route.
- Test coverage for live-session bootstrap.
- `services/adk-voice-agent` scaffold.
- ADK agent instruction with memory, risk levels, non-medical boundary, and tool rules.
- ADK tool wrappers for profile, memories, risk decision, memory save, and call finalization.
- `uv sync --python python3.12` succeeds.
- ADK service imports successfully.
- ADK service `/health` responds locally.

Still missing:

- React microphone capture and PCM 16 kHz conversion.
- Browser WebSocket client for ADK events/audio playback.
- Mapping ADK transcript/audio events into dashboard-visible transcript updates.
- ADK text WebSocket smoke test against the running Node API.
- Real browser voice smoke test with Japanese utterance.
- Cloud Run deployment plan for the second service or a combined deployment.

## Backend Tasks

- Keep `POST /api/live/session` as the session bootstrap.
- Keep all persistent side effects behind `POST /api/agent-tools/:toolName`.
- Keep tests for `LiveSessionBootstrapRequest` and route response passing.
- Decide whether to keep ADK as a second Cloud Run service or merge it behind the
  same external domain later.

## ADK Service Tasks

- Keep `uv run uvicorn app.server:app --port 8081` working.
- Confirm ADK can connect to Vertex with:
  - `GOOGLE_GENAI_USE_VERTEXAI=true`
  - `GOOGLE_CLOUD_PROJECT=<project>`
  - `GOOGLE_CLOUD_LOCATION=global`
- Confirm text WebSocket smoke test before microphone work.
- Confirm ADK tool calls reach the Node API and update Firestore/dashboard state.

## Frontend Tasks

- Add `startLiveSession()` UI action.
- Add `apps/web/src/adkVoiceClient.ts`.
- Add voice state:
  - idle
  - requesting microphone
  - connecting
  - live
  - error
  - ended
- Stream mic audio to the ADK WebSocket.
- Play model audio or display model text/transcript depending on ADK event payload.
- Keep text demo controls visually secondary as backup only.

## Tool Rule

ADK tools may simplify the model-facing signature, but they must call existing
CareVoice backend endpoints for side effects:

```text
get_elder_profile      -> POST /api/agent-tools/get_elder_profile
get_recent_memories    -> POST /api/agent-tools/get_recent_memories
record_risk_decision   -> POST /api/agent-tools/update_call_state
record_risk_decision   -> POST /api/agent-tools/create_alert when needed
save_memory            -> POST /api/agent-tools/save_memory
finalize_call          -> POST /api/agent-tools/finalize_call_summary
```

The browser must never write dashboard state directly.

## Tests

- `POST /api/live/session` validates body and creates an active session.
- ADK service Python files parse with Python 3.12.
- Text WebSocket smoke test can send one Japanese utterance.
- ADK tool call updates dashboard state through SSE.
- Full repo `typecheck`, `test`, and `build` pass.
