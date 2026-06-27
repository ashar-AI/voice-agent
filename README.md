# CareVoice

CareVoice is a Gemini-powered welfare-check voice platform for elderly people living alone in Japan.

The product goal is a memory-enabled Japanese voice agent that checks in naturally, understands risk in realtime, and updates a caregiver dashboard with evidence-backed alerts and summaries.

## Current Status

Implemented:

- React caregiver dashboard scaffold.
- Fastify API scaffold.
- Shared Zod/TypeScript contracts.
- In-memory fallback state.
- Fallback local evaluator for development only.
- Agent adapter boundary with fallback and Gemini modes.
- Gemini 3.5 Flash structured decision foundation.
- Agent tool endpoints for profile, memory, risk state, alerts, and summaries.
- Caregiver briefing bonus foundation.
- Repository abstraction with memory mode and Firestore mode.
- SSE/HTTP dashboard updates.
- Dockerfile and Cloud Run deployment notes.

Not yet implemented:

- Gemini Live API voice session.

## Documentation

Start here:

- [Documentation map](./docs/README.md)
- [Product requirements](./docs/01-product-requirements.md)
- [Architecture](./docs/02-architecture.md)
- [Implementation plan](./docs/03-implementation-plan.md)
- [Gemini agent setup](./docs/04-gemini-agent-setup.md)
- [Contracts](./docs/05-contracts.md)
- [Demo script](./docs/06-demo-script.md)
- [Deployment](./docs/07-deployment.md)
- [Task dependency hierarchy](./docs/08-task-dependency-hierarchy.md)
- [Browser voice plan](./docs/09-browser-voice-plan.md)

Archived earlier planning artifact:

- [Gemini hackathon plan HTML](./docs/archive/gemini-hackathon-plan.html)

## Local Development

Install dependencies:

```bash
npm install
```

Run the API:

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

Validate:

```bash
npm test
npm run typecheck
npm run build
```

## Positioning

CareVoice is a well-being and welfare-check companion, not an AI doctor, diagnosis assistant, or emergency service replacement.
