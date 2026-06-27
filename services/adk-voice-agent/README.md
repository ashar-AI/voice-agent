# CareVoice ADK Voice Agent

This service is the target runtime for the real browser voice call.

It uses Google ADK Live streaming for the conversation loop and calls the
existing CareVoice API tool endpoints for every persistent side effect. The
Node/Fastify API remains responsible for validation, Firestore state, dashboard
events, alerts, summaries, and caregiver briefings.

## Local Run

Start the CareVoice API first:

```bash
PORT=8090 \
WEB_ORIGIN=http://localhost:5174 \
AGENT_MODE=gemini \
GEMINI_BACKEND=vertex \
GOOGLE_CLOUD_PROJECT=project-92cc8461-8edb-409c-b74 \
GOOGLE_CLOUD_LOCATION=global \
STATE_REPOSITORY=firestore \
FIRESTORE_STATE_COLLECTION=carevoice_states \
npm run start -w @voice-agent/api
```

Then run this service from `services/adk-voice-agent`:

```bash
cp .env.example .env
uv sync
uv run uvicorn app.server:app --host 0.0.0.0 --port 8081
```

The browser should first call the Node API:

```text
POST http://localhost:8090/api/live/session
```

Then connect to:

```text
ws://localhost:8081/ws/{elderId}/{sessionId}
```

## Boundary

- ADK owns realtime conversation, turn timing, tool choice, and adaptive next
  questions.
- CareVoice owns profile/memory/state/alert persistence through validated HTTP
  tools.
- The existing text scenario path remains only as a hackathon backup.

