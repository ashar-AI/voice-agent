# Voice Agent Hackathon Plan

Private planning repository for a Gemini Tokyo hackathon concept: an AI welfare-check voice companion for elderly people living alone in Japan.

## Concept

The product is a Japanese voice-first AI companion that performs recurring welfare check-ins. It remembers prior conversations, detects risk signals during the call, adapts its questions naturally, and alerts a caregiver only when the evidence warrants escalation.

The core differentiator is that this is not an IVR or fixed questionnaire. The agent uses memory and realtime reasoning to decide what to ask next.

## Included Plan

- [Gemini hackathon plan](./gemini-hackathon-plan.html)

Open the HTML file directly in a browser. It is standalone and does not require a build step, external assets, or network access.

## Project Structure

```text
apps/api
  Fastify API, deterministic demo engine, future Gemini/Firestore adapter host.

apps/web
  React caregiver dashboard and scenario runner.

packages/contracts
  Shared Zod schemas and TypeScript types for all service communication.

docs
  Architecture, service contracts, deployment notes, and demo scenarios.
```

## Local Development

Install dependencies:

```bash
npm install
```

Run the backend:

```bash
npm run dev:api
```

Run the dashboard:

```bash
npm run dev:web
```

Default local URLs:

```text
API: http://localhost:8080
Web: http://localhost:5173
```

Validate the workspace:

```bash
npm run typecheck
npm run build
```

Run the current demo flow:

1. Open the dashboard.
2. Pick a planned scenario.
3. Click `1. Start Call`.
4. Click `2. Send Elder Response`.
5. Watch the risk state, transcript, alert, and memory timeline update.
6. Click `3. Complete Call` to create the post-call summary.

## Proposed Stack

- Gemini Live API for realtime Japanese voice conversation
- Gemini Flash / Pro for realtime risk extraction and post-call summary
- Cloud Run for the deployed backend
- Firestore for profile, memory, live call state, summaries, and alerts
- React or Next.js for the caregiver dashboard
- Browser voice as the primary demo path
- Twilio Voice as an optional stretch path for real phone calls

## Demo Focus

Primary demo scenario:

1. Load memory for an elderly user living alone.
2. Start a Japanese voice check-in.
3. User mentions a fall and dizziness.
4. Agent adapts the conversation to clarify safety.
5. Dashboard updates with risk evidence and a caregiver alert.

## Positioning

This should be presented as an AI well-being and welfare-check companion, not an AI doctor, diagnosis assistant, or emergency service replacement.
