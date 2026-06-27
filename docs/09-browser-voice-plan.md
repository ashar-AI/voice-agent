# Browser Voice Plan

Last updated: 2026-06-27 JST

Purpose: concrete implementation checklist for T60 Browser Voice Session.

## Decision

Use `POST /api/live/session` rather than a pure token route.

Reason: starting browser voice also needs to create a CareVoice call session, emit a dashboard snapshot, and return Gemini Live connection metadata. A route named `live/session` better reflects that behavior than `live/token`.

## Target Flow

```text
Caregiver clicks Start Voice Demo
  -> Web calls POST /api/live/session
  -> API creates active CallSession and initial opening turn
  -> API returns session, snapshot, live model/token metadata
  -> Browser connects to Gemini Live
  -> Gemini calls CareVoice tools through /api/agent-tools/:toolName
  -> Dashboard updates through existing SSE snapshots/events
```

## Backend Tasks

- Add `GEMINI_LIVE_MODEL`, default `gemini-3.1-flash-live-preview`, to `geminiConfig`.
- Add shared contracts:
  - `LiveSessionBootstrapRequest`
  - `LiveSessionBootstrapResponse`
- Add `POST /api/live/session`.
- Add `startLiveSession()` in `demoEngine`.
- Reuse existing `agentTools.ts`; do not duplicate tool persistence logic.
- Add `geminiLiveSession.ts` for Live model metadata, system instruction, and token/session bootstrap.
- Keep fallback behavior clear when Gemini credentials or Live token support are unavailable.

## Frontend Tasks

- Add `startLiveSession()` wrapper in `apps/web/src/api.ts`.
- Add `apps/web/src/liveVoiceClient.ts`.
- Add voice connection state in `App.tsx`:
  - idle
  - requesting microphone
  - connecting
  - live
  - error
  - ended
- Keep transcript, risk, alert, memory, summary, and briefing updates SSE-driven.
- Keep demo text controls secondary.

## Tool Call Rule

Gemini Live tool calls must map to existing endpoints:

```text
POST /api/agent-tools/get_elder_profile
POST /api/agent-tools/get_recent_memories
POST /api/agent-tools/update_call_state
POST /api/agent-tools/save_memory
POST /api/agent-tools/create_alert
POST /api/agent-tools/finalize_call_summary
```

Do not let the browser write dashboard state directly. Browser voice can relay tool calls, but all side effects must pass through validated backend tools.

## Tests

- Gemini config parses default and overridden live model.
- `POST /api/live/session` validates body.
- Live session bootstrap creates an active session and returns a usable snapshot.
- Route fails gracefully without Gemini credentials if token minting is not available.
- Full repo `typecheck`, `test`, and `build` pass.

## Open Questions

- Does the currently installed `@google/genai` version support browser-safe ephemeral Live tokens directly?
- If not, should the backend proxy the Live WebSocket for the hackathon or keep browser voice as a stretch path?
- Should true Live sessions keep `scenarioId`, or should `CallSession` later make scenario optional?
