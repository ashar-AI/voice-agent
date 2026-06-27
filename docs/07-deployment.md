# Deployment

Last updated: 2026-06-27 JST

## Target

Deploy the API to Cloud Run. The dashboard may be served separately or bundled later, but hackathon eligibility requires a deployed Google Cloud component.

## Build Container

```bash
docker build -t voice-agent-api .
```

## Deploy To Cloud Run

Replace project and region values with the hackathon-provided Google Cloud project.

```bash
gcloud run deploy voice-agent-api \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars WEB_ORIGIN=<dashboard-origin>
```

## Environment

```text
PORT=8080
WEB_ORIGIN=<dashboard-origin>
GOOGLE_CLOUD_PROJECT=<hackathon-project>
GEMINI_API_KEY=<secret>
GEMINI_REASONING_MODEL=gemini-3.5-flash
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
AGENT_MODE=fallback|gemini
STATE_STORE=memory|firestore
```

## Verification

```bash
curl https://<cloud-run-url>/health
```

Acceptance:

- health endpoint works
- dashboard can connect to API
- one check-in flow works
- no secrets are committed
