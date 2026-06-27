# Gemini Agent Setup Decision

Last updated: 2026-06-27 JST

This document records the current agent setup direction for the hackathon build. Update it whenever Google access, model availability, or mentor guidance changes.

## Decision Summary

Keep CareVoice lightweight. Our app owns product state, dashboard contracts, validation, persistence, and alerts. Gemini owns realtime conversation, agent reasoning, tool-use decisions, structured risk extraction, memory proposals, and summaries.

```text
Browser voice
  -> Gemini Live API
  -> CareVoice Cloud Run tool endpoints
  -> Gemini 3.5 Flash structured reasoning
  -> Firestore / dashboard events
  -> Caregiver dashboard
```

## What Stays On Our Side

- **Dashboard and UX:** caregiver command center, risk display, transcript, alerts, memory timeline.
- **Contracts:** shared Zod/TypeScript schemas in `packages/contracts`.
- **Tool endpoints:** validated handlers for profile, memory, risk state, alert creation, and summary storage.
- **Persistence:** Firestore-backed profile, call state, memories, summaries, and alerts.
- **Safety boundaries:** alert thresholds, audit-friendly records, no medical diagnosis positioning.
- **Fallback logic:** deterministic local evaluator for demo reliability if Gemini access is unavailable.

Reason: these are product/state responsibilities and must remain stable, testable, and observable.

## What Gemini / Google Should Own

- **Realtime Japanese voice conversation:** Gemini Live API.
- **Adaptive next-question planning:** Gemini reasoning over memory + latest utterance.
- **Realtime risk extraction:** Gemini 3.5 Flash structured output from transcript/context.
- **Tool-call decisions:** Gemini decides when to fetch memory, update state, create alerts, or finalize summaries.
- **Post-call summary:** Gemini 3.5 Flash generates caregiver-facing summary and follow-up recommendation.

Reason: this is the intelligence layer and the key differentiator for the hackathon.

## SDK And Model Choices

Use the official Gemini SDK:

```bash
npm install @google/genai
```

Current model choices:

- **Primary agent reasoning:** `gemini-3.5-flash`
  - Use for structured risk extraction, next-goal planning, memory proposals, alert explanation, and final summaries.
  - Reason: latest stable Gemini 3.5 Flash model is positioned for agentic/tool-use workloads.

- **Realtime voice:** `gemini-3.1-flash-live-preview`
  - Use for spoken Japanese conversation through the Live API.
  - Reason: current Live API voice model for low-latency dialogue.

- **Do not use:** `gemini-3.5-live-translate-preview`
  - Reason: intended for real-time speech translation, not welfare-check agent behavior.

## Recommended Implementation Path

1. Add `@google/genai`.
2. Add `POST /api/live/token` to mint ephemeral Live API tokens.
3. Add Gemini tool definitions matching our existing contracts:
   - `get_elder_profile`
   - `get_recent_memories`
   - `update_call_state`
   - `create_alert`
   - `save_memory`
   - `finalize_call_summary`
4. Browser connects to Gemini Live API for the elder conversation.
5. Tool handlers call CareVoice API and, where needed, `gemini-3.5-flash` for structured reasoning.
6. Dashboard continues consuming snapshots/events, not raw model output.

## AI Studio / Agent Studio Position

Use AI Studio Agents Playground for prompt and tool-definition prototyping only.

Do not make it the primary runtime for the hackathon demo unless Google mentors explicitly recommend it.

Reason: the product needs controlled realtime voice, persistence, and dashboard state. AI Studio agents are useful for exploration, but our runtime should remain Live API + Cloud Run tools.

## ADK / Agent Runtime Position

Use ADK or Agent Runtime only after the direct Live API path works.

Good use cases:

- cleaner future agent structure
- managed deployment
- session handling
- production hardening

Hackathon default:

```text
Direct Gemini Live API + Cloud Run tool endpoints
```

Reason: lower setup risk and faster path to a reliable demo.
