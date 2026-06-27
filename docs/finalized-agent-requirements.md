# Finalized Agent Requirements

Last updated: 2026-06-27 JST

This document locks the current product direction so implementation does not drift back into a local rules engine, IVR, or manual dashboard workflow.

## Core Requirement

CareVoice must be an agent-driven welfare-check platform. Gemini owns the live conversation loop and reasoning. Our app owns contracts, persistence, safety boundaries, tool execution, and caregiver UI.

The product must not behave like:

- a scripted IVR
- a fixed decision tree
- a checklist disguised as voice
- a dashboard-controlled manual turn processor
- a local regex/rules risk engine as the primary intelligence

## Final Target Flow

```text
Scheduled/browser voice check-in starts
  -> Gemini Live agent loads profile + memory
  -> Gemini speaks naturally in Japanese
  -> elder responds freely
  -> Gemini evaluates context, risk, and open questions
  -> Gemini chooses the next conversational move
  -> Gemini calls CareVoice tools to update state
  -> Gemini decides when enough information is gathered
  -> Gemini creates alert and summary through tools when needed
  -> dashboard updates passively for caregiver
```

## What Gemini Owns

- Japanese realtime conversation.
- Adaptive next-question planning.
- Risk-level decision from memory, transcript, and context.
- Open-question tracking.
- Deciding whether to continue, reassure, escalate, or close.
- Memory proposal generation.
- Alert explanation proposal.
- Final caregiver summary.

## What CareVoice Owns

- Shared contracts and schemas.
- Risk-level definitions and safety constraints.
- Tool endpoints and input validation.
- Firestore persistence.
- Alert creation and audit trail.
- Dashboard rendering.
- Fallback local evaluator only when Gemini is unavailable.

CareVoice may validate agent output, but it should not be the primary decision-maker for normal operation.

## Risk Levels

Use five levels. Gemini chooses the level and must return evidence.

```text
stable
  No meaningful concern. Continue normal check-in cadence.

watch
  Mild change or uncertainty. No alert, but track trend.

concern
  Non-urgent well-being issue such as loneliness, lower mood, or mild symptom.

high
  Safety-relevant signal requiring caregiver follow-up, such as fall + dizziness.

urgent
  Immediate safety concern, such as inability to move, confusion, severe distress,
  or explicit emergency language.
```

Required agent decision shape:

```json
{
  "riskLevel": "high",
  "confidence": 0.86,
  "evidence": ["reported fall", "dizziness when standing", "lives alone"],
  "openQuestions": ["injury severity", "whether they can move safely"],
  "nextGoal": "clarify immediate safety gently",
  "recommendedAction": "notify caregiver",
  "shouldContinueConversation": true,
  "shouldCreateAlert": true,
  "shouldFinalizeCall": false
}
```

## Dashboard Requirement

The caregiver dashboard must show the working platform, not a plan or demo script.

Primary dashboard surface:

- care recipient status
- live call status
- transcript
- AI reasoning state
- risk level and evidence
- open questions
- alerts
- memory timeline
- post-call summary

The dashboard should not make the caregiver manually advance the agent through fixed steps.

Allowed for hackathon only:

- a small, clearly secondary demo input panel
- sample utterance presets
- fallback simulation controls

These controls must not be the visual center of the product.

## Fallback Policy

A local evaluator may exist only as fallback/demo resilience.

Rules:

- Name it clearly as fallback.
- Keep it behind an adapter interface.
- Do not present it as the product intelligence.
- Do not let scenario IDs determine risk.
- Do not let local rules decide the final product flow when Gemini is available.

## Bonus Feature Direction

Primary bonus candidate:

- Managed Agent for post-call caregiver briefing.

This agent should run after the call, using transcript, risk state, alert evidence, and memory timeline.

It should not replace the realtime Gemini Live call agent unless mentors explicitly recommend that path and setup is reliable.
