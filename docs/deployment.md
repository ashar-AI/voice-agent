# Deployment

The hackathon deployment target should be Cloud Run for the API. The dashboard can be hosted separately later, but the current priority is proving a deployed Google Cloud backend.

## Build Container

```bash
docker build -t voice-agent-api .
```

## Deploy To Cloud Run

Replace the project and region values with the hackathon-provided Google Cloud project.

```bash
gcloud run deploy voice-agent-api \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars WEB_ORIGIN=http://localhost:5173
```

## Required Environment

```text
PORT=8080
WEB_ORIGIN=<dashboard-origin>
GEMINI_API_KEY=<available during Gemini integration>
GOOGLE_CLOUD_PROJECT=<hackathon project>
```

## Demo Notes

- Current API uses deterministic local risk evaluation for reliability.
- Firestore can replace the in-memory demo store behind the same contracts.
- Gemini Live can replace the deterministic response planner behind the same evaluator/tool boundary.
