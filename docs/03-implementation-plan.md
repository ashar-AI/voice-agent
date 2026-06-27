# Implementation Plan

Last updated: 2026-06-27 JST

Goal: move from the current scaffold to Gemini-agent-driven behavior while preserving fallback reliability.

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

- Add `POST /api/live/token` for ephemeral token minting.
- Add browser voice client.
- Connect Gemini Live API.
- Wire tool calls to CareVoice backend.
- Emit dashboard events for transcript/risk/alert/summary.

Acceptance:

- One Japanese check-in works in browser.
- Transcript updates live.
- Agent calls at least `get_recent_memories` and `update_call_state`.

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
- Configure secrets/env vars.
- Confirm dashboard reaches deployed API.

Acceptance:

- `/health` works on deployed URL.
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
