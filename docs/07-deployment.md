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
GOOGLE_CLOUD_LOCATION=global
GEMINI_BACKEND=vertex
GEMINI_REASONING_MODEL=gemini-3.5-flash
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
AGENT_MODE=fallback|gemini
STATE_REPOSITORY=memory|firestore
FIRESTORE_STATE_COLLECTION=carevoice_states
```

`STATE_REPOSITORY` defaults to `memory`, which keeps the deterministic local
hackathon fallback working without Google credentials. Set
`STATE_REPOSITORY=firestore` on Cloud Run to persist CareVoice state in
Firestore. The API uses Application Default Credentials, so grant the Cloud Run
service account Firestore access and do not commit service account keys.

Prefer `GEMINI_BACKEND=vertex` on Cloud Run so Gemini calls use Google Cloud
billing/credits through the service account. Do not set `GEMINI_API_KEY` for
the Vertex path. It is needed only for `GEMINI_BACKEND=developer`, which uses
the AI Studio Gemini API prepay path.

## Verification

```bash
curl https://<cloud-run-url>/health
```

Acceptance:

- health endpoint works
- dashboard can connect to API
- one check-in flow works
- local/default memory mode works without Google credentials
- Firestore mode is enabled only through Cloud Run env/config
- no secrets are committed
