# Architecture

## Hackathon MVP

```text
Browser dashboard
  -> HTTP API on Cloud Run
  -> utterance-driven deterministic risk evaluator
  -> shared DashboardSnapshot contract
  -> SSE/HTTP live caregiver view
```

The current scaffold intentionally starts with deterministic local risk evaluation. Scenarios seed the demo utterance, but the evaluator consumes the actual utterance plus memory, which preserves the core product direction while Google access, Gemini credentials, and telephony details are still pending.

## Planned Production Adapters

```text
Browser voice or Twilio Media Streams
  -> Cloud Run session backend
  -> Gemini Live API voice agent
  -> realtime risk evaluator
  -> Firestore memory/state/alerts
  -> caregiver dashboard
```

## Boundary Decisions

- `packages/contracts` owns all cross-service schemas.
- `apps/api` owns session orchestration, persistence, and alert creation.
- Gemini adapter should only communicate through tool contracts.
- Dashboard should consume snapshots/events, not raw model output.
- Firestore should replace the in-memory demo store without changing the public API.
- Demo scenario IDs must not decide risk by themselves; they only provide planned seed utterances.

## Next Implementation Steps

1. Add Firestore-backed repository behind the current demo state functions.
2. Add Gemini Live adapter for browser voice sessions.
3. Replace local response planning with Gemini tool calls while keeping evaluator contracts.
4. Add Twilio adapter only if setup is quick enough for the hackathon.
