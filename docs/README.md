# CareVoice Documentation

Last updated: 2026-06-27 JST

Use this directory as the source of truth for product, architecture, and implementation decisions.

## Documentation Map

Read in this order:

1. [Product Requirements](./01-product-requirements.md)
   - Locked product direction, ownership boundaries, risk levels, dashboard requirements.
2. [Architecture](./02-architecture.md)
   - Target system design, current scaffold, service boundaries, data flow.
3. [Implementation Plan](./03-implementation-plan.md)
   - Task-wise build plan and acceptance criteria.
4. [Gemini Agent Setup](./04-gemini-agent-setup.md)
   - SDK/model choices, Live API, Managed Agent bonus direction.
5. [Contracts](./05-contracts.md)
   - Shared API/event/tool contracts and schema responsibilities.
6. [Demo Script](./06-demo-script.md)
   - Primary demo scenario, fallback path, judge-facing flow.
7. [Deployment](./07-deployment.md)
   - Cloud Run deployment and environment setup.

Archived earlier drafts live under [`archive/`](./archive/).

## Update Rules

- Product behavior changes go in `01-product-requirements.md`.
- System design or service ownership changes go in `02-architecture.md`.
- Build sequencing and tasks go in `03-implementation-plan.md`.
- Gemini model/tool/runtime choices go in `04-gemini-agent-setup.md`.
- API, event, or tool payload changes go in `05-contracts.md`.
- Presentation/demo flow changes go in `06-demo-script.md`.
- Deploy or environment changes go in `07-deployment.md`.

Do not duplicate the same decision across multiple docs. Link to the source of truth instead.
