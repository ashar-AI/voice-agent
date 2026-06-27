# Architecture

## Hackathon MVP

```text
Browser dashboard
  -> HTTP API on Cloud Run
  -> deterministic demo engine
  -> shared DashboardSnapshot contract
  -> live caregiver view
```

The current scaffold intentionally starts with deterministic scenario logic. This makes the demo reliable while the Google access, Gemini credentials, and telephony details are still pending.

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

## Next Implementation Steps

1. Add Firestore-backed repository behind the current demo state functions.
2. Add Gemini Live adapter for browser voice sessions.
3. Add realtime push via SSE or WebSocket using `DashboardEvent`.
4. Add Twilio adapter only if setup is quick enough for the hackathon.
