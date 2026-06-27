# Task Dependency Hierarchy

Last updated: 2026-06-27 JST

Purpose: convert the implementation plan into small executable tasks that can be split across teammates without drifting from the locked product direction.

Use this as the working task board. Keep statuses here or mirror these task IDs into GitHub Issues.

## Execution Rules

- Do contracts before feature work that depends on payload shape.
- Keep Gemini responsible for adaptive conversation, risk level decision, and next-goal selection.
- Keep CareVoice responsible for validated tools, persistence, audit trail, dashboard rendering, and fallback reliability.
- The dashboard is a passive caregiver platform, not the driver of the check-in.
- Local fallback logic is allowed only behind the same agent adapter used by Gemini.
- Every task must end with a small demoable or testable output.

## Status Legend

- `Done`: already completed in repo.
- `In Progress`: partially implemented; remaining work is listed in the task.
- `Ready`: can start now.
- `Blocked`: needs dependency first.
- `Parallel`: can be worked in parallel once listed dependencies are done.

## Dependency Map

```text
T00 Docs and locked requirements
  -> T10 Contract migration
    -> T50 Dashboard passive monitor
    -> T20 Agent adapter boundary
      -> T30 Backend tool handlers
      -> T40 Gemini decision adapter

T30 Backend tool handlers + T40 Gemini decision adapter + T50 Dashboard passive monitor
  -> T60 ADK browser voice session
    -> T80 End-to-end demo hardening

T30 Backend tool handlers
  -> T70 Firestore persistence
    -> T80 End-to-end demo hardening

T30 Backend tool handlers + T40 Gemini decision adapter
  -> T90 Managed Agent briefing bonus
    -> T80 End-to-end demo hardening

T81 Cloud Run deployment depends on T30 plus whichever runtime path is demo-ready.
T82 Backup text-mode demo depends on T20 and T50.
```

Critical path for the hackathon demo:

```text
contracts -> agent adapter -> Gemini decision path -> tool handlers -> passive dashboard -> ADK browser voice -> demo script -> Cloud Run
```

## Workstream Ownership

Suggested split for 3 people:

| Owner | Primary workstream | First tasks |
| --- | --- | --- |
| Owner A | Contracts and backend agent boundary | T10, T20, T30 |
| Owner B | Caregiver dashboard and demo UX | T50, T82, T80 |
| Owner C | Gemini SDK, Live API, Managed Agent bonus | T40, T60, T90 |

Suggested split for 4 people:

| Owner | Primary workstream | First tasks |
| --- | --- | --- |
| Owner A | Contracts and backend agent boundary | T10, T20 |
| Owner B | Tool handlers and Firestore | T30, T70 |
| Owner C | Gemini decision and Live voice | T40, T60 |
| Owner D | Dashboard, deployment, demo polish | T50, T81, T80 |

## Tasks

### T00: Documentation And Direction Lock

Status: `Done`

Dependencies: none

Output:

- Numbered docs in `docs/`.
- Locked product requirement that this is not IVR and not medical diagnosis.
- Clear ownership split between Gemini and CareVoice.

Acceptance:

- Teammates can find product, architecture, contracts, Gemini setup, demo, deployment, and this task hierarchy from `docs/README.md`.

### T10: Contract Migration

Status: `Done`

Dependencies: T00

Owner fit: contracts/backend

Tasks:

- Replace risk enum with `stable`, `watch`, `concern`, `high`, `urgent`.
- Add `AgentDecision`.
- Add `AgentTurnRequest`.
- Add `AgentTurnResponse`.
- Add tool input/output schemas.
- Add dashboard event type `briefing.created`.
- Update API/web imports to compile against the new contracts.

Output:

- `packages/contracts/src/index.ts` becomes the single source for agent, tool, risk, and dashboard event types.

Acceptance:

- `npm run typecheck` passes.
- Existing fallback behavior is mapped to the new risk levels.
- No duplicate decision shape exists in `apps/api` or `apps/web`.

### T20: Agent Adapter Boundary

Status: `Done`

Dependencies: T10

Owner fit: backend

Tasks:

- Create `WelfareCheckAgent` interface.
- Move local fallback evaluator behind `FallbackWelfareCheckAgent`.
- Add placeholder `GeminiWelfareCheckAgent`.
- Update `demoEngine` to call the adapter, not `riskEvaluator` directly.
- Add tests proving scenario ID does not determine risk.

Output:

- Backend can switch between `fallback` and `gemini` modes without changing dashboard or route code.

Acceptance:

- `AGENT_MODE=fallback` works without Gemini credentials.
- Fallback tests pass with new risk levels.
- One text-mode check-in updates dashboard through the adapter.

### T30: Backend Tool Handlers

Status: `Done`

Dependencies: T10, T20

Owner fit: backend/persistence

Tasks:

- Implement `get_elder_profile`.
- Implement `get_recent_memories`.
- Implement `update_call_state`.
- Implement `save_memory`.
- Implement `create_alert`.
- Implement `finalize_call_summary`.
- Add internal route `POST /api/agent-tools/:toolName`.
- Emit dashboard events after meaningful state changes.

Output:

- Gemini can use backend tools for all persistent side effects.

Acceptance:

- Tool inputs validate with Zod.
- Tool outputs are model-safe JSON.
- Direct raw model output is never written to dashboard state without validation.
- Unit tests cover at least profile, memory, risk update, alert, and final summary tools.

### T40: Gemini Decision Adapter

Status: `Done`

Dependencies: T10, T20

Owner fit: Gemini/backend

Tasks:

- Install and configure `@google/genai`.
- Add env vars from `docs/04-gemini-agent-setup.md`.
- Implement Gemini 3.5 structured `AgentDecision` generation.
- Build system instruction with risk definitions and non-medical safety boundaries.
- Add timeout and fallback behavior.
- Add dev logging that avoids storing secrets or full sensitive transcripts.

Output:

- Backend can ask Gemini for the next `AgentDecision` in text mode before Live voice is added.

Acceptance:

- App starts in fallback mode without `GEMINI_API_KEY`.
- App uses Gemini path when `AGENT_MODE=gemini` and key is present.
- Gemini returns only validated `AgentDecision` data.
- Fallback adapter is used when Gemini fails.

### T50: Passive Caregiver Dashboard

Status: `Done`

Dependencies: T10

Owner fit: frontend

Tasks:

- Make the primary screen a passive live monitor.
- Move scenario controls into a visually secondary `Demo Controls` area.
- Replace visible process labels like `Start / Process / Complete` with live call state.
- Display transcript, risk state, evidence, uncertainty, next agent goal, alert, summary, and briefing.
- Add empty/loading/error states.
- Update risk styling for `stable`, `watch`, `concern`, `high`, `urgent`.

Output:

- Dashboard feels like the actual caregiver platform rather than a plan or control panel.

Acceptance:

- Caregiver cannot appear to manually drive the agent.
- Demo controls are available but visually secondary.
- SSE updates remain the main dashboard update path.
- Mobile layout is readable.

### T60: ADK Browser Voice Session

Status: `In Progress`

Dependencies: T30, T40, T50

Implementation checklist: [`09-browser-voice-plan.md`](./09-browser-voice-plan.md)

Owner fit: Gemini/frontend/backend

Tasks:

- `Done`: add `POST /api/live/session` bootstrap.
- `Done`: add `LiveSessionBootstrapRequest` and `LiveSessionBootstrapResponse` contracts.
- `Done`: add `services/adk-voice-agent` with ADK Live streaming scaffold.
- `Done`: add ADK instruction with memory, risk levels, and non-medical boundaries.
- `Done`: route ADK/Gemini tool wrappers to CareVoice tool handlers.
- `Done`: verify ADK service boots locally and `/health` responds.
- `Ready`: smoke-test ADK text WebSocket against the running Node API.
- `Ready`: add browser microphone/speaker flow.
- `Ready`: convert browser mic input to `audio/pcm;rate=16000`.
- `Ready`: connect browser audio to the ADK voice-agent WebSocket.
- `Ready`: map ADK transcript/audio/tool events to dashboard-visible transcript and status.
- `Ready`: add browser permission and connection error states.

Output:

- Primary demo path: Japanese browser voice check-in with ADK-owned realtime conversation and dashboard updates.

Acceptance:

- One Japanese call works through browser voice.
- Agent uses memory naturally.
- Agent updates risk during the call.
- ADK/Gemini calls at least `get_elder_profile` and `get_recent_memories`.
- ADK/Gemini calls `record_risk_decision`, which persists through `update_call_state`.
- Dashboard updates without caregiver manually processing turns.
- Phone-call/PSTN integration is not required for hackathon acceptance.

### T70: Firestore Persistence

Status: `Done`

Dependencies: T10, T30

Owner fit: backend/persistence

Tasks:

- Add repository interface.
- Keep in-memory implementation for local fallback.
- Add Firestore implementation.
- Persist elder profile, memories, sessions, transcript turns, risk state, alerts, summaries, and briefings.
- Add env flag to select repository mode.

Output:

- State can survive backend restart when Firestore is enabled.
- Local memory mode remains the default for deterministic demos without Google credentials.
- `STATE_REPOSITORY=memory|firestore` selects the repository implementation.

Acceptance:

- API behavior remains unchanged across repository modes.
- Firestore writes happen only through repository/tool layers.
- Local mode still works without Google Cloud credentials.

### T80: End-To-End Demo Hardening

Status: `Blocked`

Dependencies: T50 plus one runtime path:

- text fallback path: T20
- Gemini text path: T40
- voice path: T60

Owner fit: frontend/backend/demo

Tasks:

- Use browser voice as the primary live-call demo surface.
- Keep phone-call/Twilio integration out of demo scope.
- Finalize primary demo data: knee pain, tired yesterday, lives alone.
- Script fall/dizziness path with adaptive follow-up.
- Script loneliness path with concern and no urgent alert.
- Script normal improvement path with stable/watch outcome.
- Add reset button or route for reliable judge demo.
- Add short judge-facing explanation in README or demo notes.

Output:

- A reliable 2-minute demo path plus backup path.

Acceptance:

- Demo does not depend on random phrasing to succeed.
- Backup text-mode demo remains available.
- Alert evidence is visible and easy to explain.

### T81: Cloud Run Deployment

Status: `Blocked`

Dependencies: T30 and whichever runtime path is selected for the hackathon. For
voice mode, this includes the ADK service from T60.

Owner fit: DevOps/backend

Tasks:

- Confirm Docker build.
- Add Dockerfile or deployment path for `services/adk-voice-agent`.
- Configure Cloud Run env vars and secrets.
- Configure CORS for deployed dashboard origin.
- Confirm `/health`.
- Confirm ADK service `/health` if deployed.
- Confirm dashboard can reach API.
- Confirm dashboard can reach ADK WebSocket if deployed.
- Document deployed URLs and any manual setup steps.

Output:

- Deployed demo target for judges/mentors.

Acceptance:

- Deployed API health check passes.
- Deployed ADK service health check passes if voice demo is deployed.
- One check-in path works against deployed backend.
- Secrets are not committed.

### T82: Backup Text-Mode Demo

Status: `Ready`

Dependencies: T20, T50

Owner fit: frontend/backend/demo

Tasks:

- Keep text input demo available behind `Demo Controls`.
- Use the same agent adapter and dashboard events as voice mode.
- Add clear scenario presets for normal, loneliness, and fall/dizziness.
- Ensure reset creates deterministic starting state.

Output:

- Reliable fallback if Live API, browser audio, or event setup fails during hackathon.

Acceptance:

- Text-mode demo proves memory, realtime risk update, adaptive next goal, alert, and summary.
- Text-mode controls do not visually dominate the caregiver dashboard.

### T90: Managed Agent Briefing Bonus

Status: `Done`

Dependencies: T30, T40

Owner fit: Gemini/backend/frontend

Tasks:

- Create `caregiver-briefing-agent` flow.
- Input transcript, risk state, memories, alert evidence, and call summary.
- Output concise caregiver briefing, 3 evidence bullets, recommended follow-up, and non-medical wording.
- Persist briefing.
- Emit `briefing.created`.
- Add dashboard briefing panel.

Output:

- Hackathon bonus feature using managed agent capability.

Acceptance:

- Briefing appears after call completion.
- Core check-in still works if briefing generation fails.
- Demo makes the managed-agent usage visible without distracting from the main welfare-check flow.

## Parallelization Plan

Start immediately:

- Owner A: T10 contract migration.
- Owner B: prepare T50 dashboard design branch using temporary mapping, but wait for T10 before final type changes.
- Owner C: prepare T40 Gemini SDK notes and env setup, but wait for T10/T20 before wiring.

After T10 is merged:

- Owner A: T20 adapter boundary.
- Owner B: T50 passive dashboard.
- Owner C: T40 Gemini decision adapter.

After T20 is merged:

- Owner A or B: T30 tool handlers.
- Owner D if available: T82 backup text-mode demo.

After T30 and T40 are merged:

- Owner C: T60 browser voice.
- Owner D: T90 Managed Agent briefing bonus.
- Owner B: T70 Firestore, if time allows.

Final integration:

- Pair Owner B and C on T80 end-to-end demo hardening.
- Pair Owner A and D on T81 Cloud Run deployment.

## Suggested Git Branches

Use task IDs in branch names:

```text
task/t10-contract-migration
task/t20-agent-adapter
task/t30-agent-tools
task/t40-gemini-decision
task/t50-passive-dashboard
task/t60-browser-voice
task/t70-firestore
task/t80-demo-hardening
task/t81-cloud-run
task/t90-managed-agent-briefing
```

## Merge Order

1. T10
2. T20
3. T50 after T10; T30 and T40 after T20
4. T60 and T90
5. T70 if time allows before final demo, otherwise after hackathon
6. T80
7. T81

## Daily Checkpoint Questions

- Did any task change a contract? If yes, update `docs/05-contracts.md`.
- Did any task change Gemini model, SDK, or agent setup? If yes, update `docs/04-gemini-agent-setup.md`.
- Did any task change product behavior? If yes, update `docs/01-product-requirements.md`.
- Is fallback still working without Gemini credentials?
- Is the dashboard still passive?
- Can we still run a 2-minute demo today?
