# Agent-Driven Implementation Plan

Last updated: 2026-06-27 JST

Goal: rework the current scaffold so CareVoice is Gemini-agent-driven, while preserving local fallback reliability for the hackathon.

## Task 1: Update Contracts

- Replace four-level `RiskLevel` with five-level model:
  - `stable`
  - `watch`
  - `concern`
  - `high`
  - `urgent`
- Add `AgentDecision` contract:
  - `riskLevel`
  - `confidence`
  - `evidence`
  - `openQuestions`
  - `nextGoal`
  - `recommendedAction`
  - `shouldContinueConversation`
  - `shouldCreateAlert`
  - `shouldFinalizeCall`
  - `memoryUpdates`
- Add `AgentTurnRequest` and `AgentTurnResponse`.
- Keep `DashboardSnapshot` as the dashboard source of truth.

Acceptance:

- frontend and backend import shared types only from `packages/contracts`
- no duplicated decision shapes in app code

## Task 2: Introduce Agent Adapter Boundary

- Create `apps/api/src/agents/agentAdapter.ts`.
- Define interface:

```ts
interface WelfareCheckAgent {
  startSession(input): Promise<AgentStartResult>;
  handleUserTurn(input): Promise<AgentTurnResponse>;
  finalizeSession(input): Promise<AgentFinalizeResult>;
}
```

- Move existing deterministic evaluator behind `FallbackWelfareCheckAgent`.
- Add placeholder `GeminiWelfareCheckAgent`.

Acceptance:

- `demoEngine` calls the adapter, not local evaluator directly
- fallback behavior still passes current tests
- naming makes fallback status explicit

## Task 3: Add Gemini SDK Foundation

- Install `@google/genai`.
- Add env vars:
  - `GEMINI_API_KEY`
  - `GEMINI_REASONING_MODEL=gemini-3.5-flash`
  - `GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview`
- Add `apps/api/src/gemini/client.ts`.
- Add typed helper for structured `AgentDecision` generation with Gemini 3.5 Flash.

Acceptance:

- app starts without Gemini key using fallback adapter
- app uses Gemini adapter when key is present and mode is enabled

## Task 4: Add Tool Endpoints

Implement tool handlers:

- `get_elder_profile`
- `get_recent_memories`
- `update_call_state`
- `save_memory`
- `create_alert`
- `finalize_call_summary`

Expose them internally first under:

```text
POST /api/agent-tools/:toolName
```

Acceptance:

- all tool inputs validate against shared contracts
- tool outputs are safe for Gemini
- dashboard state updates only through tool-backed state changes

## Task 5: Rework Dashboard To Passive Live Monitor

- Remove main “Start / Process / Complete” step framing from primary UI.
- Make primary surface:
  - call status
  - live transcript
  - AI reasoning state
  - risk/evidence
  - open questions
  - alerts
  - summary
- Move sample utterance controls into a small secondary `Demo Controls` panel.

Acceptance:

- dashboard reads as working caregiver platform
- manual controls are visually secondary
- caregiver does not appear to drive the agent logic

## Task 6: Browser Voice Integration

- Add `POST /api/live/token` for ephemeral Live API token minting.
- Add browser voice client module.
- Wire Gemini Live API session to:
  - send elder audio/text
  - receive agent audio/text
  - call CareVoice tools
  - update dashboard events

Acceptance:

- browser voice path can run one Japanese check-in
- transcript updates live
- agent can call at least `get_recent_memories` and `update_call_state`

## Task 7: Managed Agent Bonus

- Add `caregiver-briefing-agent` as post-call bonus feature.
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

- briefing appears after call completion
- core live-call flow still works if Managed Agent is unavailable
- judges can see Managed Agent is used for a real product feature

## Task 8: Firestore Persistence

- Replace in-memory demo state with repository interface.
- Add Firestore implementation.
- Keep in-memory implementation for local fallback.

Acceptance:

- API behavior remains unchanged
- dashboard state survives server restart when Firestore is enabled

## Task 9: Deployment

- Deploy API to Cloud Run.
- Configure env vars and secrets.
- Confirm dashboard can reach deployed API.

Acceptance:

- `/health` works on deployed URL
- dashboard can complete at least one check-in flow against deployed backend

## Task 10: Final Demo Script

- Prepare one primary live scenario:
  - memory: knee pain, tired yesterday, lives alone
  - elder says fall + dizziness
  - agent asks adaptive follow-up
  - risk becomes high
  - caregiver alert appears
  - post-call briefing appears
- Keep backup text-mode fallback ready.

Acceptance:

- 2-minute demo is reliable
- core differentiator is clear: memory + adaptive agent + realtime risk + escalation
