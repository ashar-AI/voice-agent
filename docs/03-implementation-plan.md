# Implementation Plan

Last updated: 2026-06-27 JST

Goal: move from the current scaffold to Gemini-agent-driven behavior while preserving fallback reliability.

For owner-ready small tasks, dependency order, and merge sequencing, use [`08-task-dependency-hierarchy.md`](./08-task-dependency-hierarchy.md).

## Current Decision

Use ADK Live for the actual voice-agent runtime. Phone-call/PSTN integration is
out of hackathon scope; the demo call uses browser microphone audio. The
text-mode scenario path remains as backup only.

Current ADK status:

- ADK service scaffold exists.
- CareVoice live-session bootstrap exists.
- ADK tool wrappers exist.
- Service boots locally and `/health` responds.
- Browser microphone/WebSocket/audio/event wiring is not complete.

## Phase 1: Contracts And Adapter Boundary

Tasks:

- Replace current risk enum with:
  - `stable`
  - `watch`
  - `concern`
  - `high`
  - `urgent`
- Add `AgentDecision` contract.
- Add `AgentTurnRequest` and `AgentTurnResponse`.
- Create `WelfareCheckAgent` interface.
- Move current local evaluator behind `FallbackWelfareCheckAgent`.
- Add placeholder `GeminiWelfareCheckAgent`.

Acceptance:

- `demoEngine` calls the agent adapter, not `riskEvaluator` directly.
- Fallback tests still pass.
- No duplicated decision shapes outside `packages/contracts`.

## Phase 2: Gemini SDK Foundation

Tasks:

- Install `@google/genai`.
- Add env vars:
  - `GEMINI_API_KEY`
  - `GEMINI_REASONING_MODEL=gemini-3.5-flash`
  - `GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview`
  - `AGENT_MODE=fallback|gemini`
- Add Gemini client module.
- Add structured `AgentDecision` generation using Gemini 3.5 Flash.

Acceptance:

- App starts without Gemini key in fallback mode.
- App can run Gemini decision path when key and mode are enabled.

## Phase 3: Tool Endpoints

Tasks:

- Implement:
  - `get_elder_profile`
  - `get_recent_memories`
  - `update_call_state`
  - `save_memory`
  - `create_alert`
  - `finalize_call_summary`
- Expose internal route:

```text
POST /api/agent-tools/:toolName
```

Acceptance:

- All tool inputs validate against contracts.
- Tool outputs are safe for Gemini.
- Persistent state changes happen only through tool handlers.

## Phase 4: Passive Dashboard

Tasks:

- Make primary dashboard a passive live monitor.
- Move sample utterance controls into small `Demo Controls`.
- Remove main visual dependency on `Start / Process / Complete`.
- Display:
  - call status
  - transcript
  - AI reasoning state
  - risk/evidence
  - open questions
  - alert
  - summary

Acceptance:

- Caregiver does not appear to drive agent logic.
- Demo controls are visually secondary.

## Phase 5: Browser Voice

Tasks:

Done:

- Add `POST /api/live/session` for CareVoice session bootstrap.
- Add `services/adk-voice-agent` using ADK Live streaming.
- Wire ADK tool wrappers to existing CareVoice backend tool endpoints.

Remaining:

- Add browser voice client that streams mic audio to the ADK WebSocket.
- Convert browser mic audio to `audio/pcm;rate=16000`.
- Play ADK/Gemini audio responses or show model text if audio response is not reliable.
- Map ADK transcript/tool events into dashboard-visible transcript/risk updates.
- Smoke-test one live Japanese browser voice check-in end to end.

Acceptance:

- One Japanese check-in works in browser.
- Transcript updates live.
- ADK agent calls at least `get_elder_profile`, `get_recent_memories`, and `record_risk_decision`.
- Dashboard buttons do not control the live conversation turn loop.

## Phase 6: Managed Agent Bonus

Tasks:

- Add `caregiver-briefing-agent`.
- Input:
  - transcript
  - risk state
  - memory timeline
  - alert evidence
  - call summary
- Output:
  - concise caregiver briefing
  - 3 evidence bullets
  - recommended family follow-up
  - non-medical safety wording

Acceptance:

- Briefing appears after call completion.
- Core live-call flow works if Managed Agent is unavailable.
- Judges can clearly see Managed Agent used for a product feature.

## Phase 7: Firestore

Tasks:

- Add repository interface.
- Add Firestore implementation.
- Keep in-memory implementation for fallback/local.

Acceptance:

- API behavior remains unchanged.
- Dashboard state survives server restart when Firestore is enabled.

## Phase 8: Deployment

Tasks:

- Deploy API to Cloud Run.
- Deploy ADK voice-agent service to Cloud Run or document local-only hackathon mode.
- Configure secrets/env vars.
- Confirm dashboard reaches deployed API.
- Confirm dashboard reaches deployed ADK WebSocket if voice mode is deployed.

Acceptance:

- `/health` works on deployed API URL.
- `/health` works on deployed ADK service URL if deployed.
- One check-in flow works against deployed backend.

## Phase 9: Final Demo

Primary scenario:

- memory: knee pain, tired yesterday, lives alone
- elder says fall + dizziness
- agent asks adaptive follow-up
- risk becomes high
- caregiver alert appears
- post-call Managed Agent briefing appears

Acceptance:

- 2-minute demo is reliable.
- Backup text-mode fallback is ready.
