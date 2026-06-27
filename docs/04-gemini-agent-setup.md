# Gemini Agent Setup

Last updated: 2026-06-27 JST

## Decision

Keep CareVoice lightweight. Gemini owns the intelligence layer; CareVoice owns state, tools, validation, and UI.

```text
Browser voice
  -> Gemini Live API
  -> CareVoice Cloud Run tool endpoints
  -> Gemini 3.5 Flash structured reasoning
  -> Firestore / dashboard events
  -> Caregiver dashboard
```

## SDK

Use the official Gemini SDK:

```bash
npm install @google/genai
```

## API Environment

API workspace configuration:

```text
AGENT_MODE=fallback|gemini
GEMINI_API_KEY=<Google AI Studio API key>
GEMINI_REASONING_MODEL=gemini-3.5-flash
```

Defaults:

- `AGENT_MODE` defaults to `fallback`.
- `GEMINI_REASONING_MODEL` defaults to `gemini-3.5-flash`.
- `GEMINI_API_KEY` is required only when `AGENT_MODE=gemini`.

Fallback mode must start without Gemini credentials. If `AGENT_MODE=gemini` is set but no `GEMINI_API_KEY` is present, the API should continue using the local fallback agent.

## Model Choices

Primary reasoning:

```text
gemini-3.5-flash
```

Use for:

- structured `AgentDecision`
- risk extraction
- next-goal planning
- memory proposals
- alert explanations
- final summaries

Realtime voice:

```text
gemini-3.1-flash-live-preview
```

Use for:

- Japanese speech conversation
- interruption/barge-in
- live transcript
- function/tool calling during call

Do not use:

```text
gemini-3.5-live-translate-preview
```

Reason: translation model, not welfare-check agent behavior.

## AI Studio / Agent Studio

Use AI Studio Agents Playground for:

- prompt exploration
- tool definition prototyping
- Managed Agent briefing prototype

Do not use it as the primary realtime call runtime unless mentors explicitly recommend it.

## ADK / Agent Runtime

Use ADK or Agent Runtime only after the direct Live API path works.

Good future uses:

- cleaner agent structure
- managed deployment
- session hardening

Hackathon default:

```text
Direct Gemini Live API + Cloud Run tool endpoints
```

## Managed Agent Bonus

Use Managed Agent for post-call caregiver briefing, not the live call loop.

Name:

```text
caregiver-briefing-agent
```

Inputs:

- transcript
- memory timeline
- risk state
- alert evidence
- call summary

Output:

- what changed today
- why the system is concerned or not concerned
- evidence bullets
- recommended family follow-up
- non-medical safety wording

Reason: captures bonus points while keeping the live call reliable.
