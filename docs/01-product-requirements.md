# Product Requirements

Last updated: 2026-06-27 JST
Status: locked direction

## Product Goal

CareVoice is an agent-driven welfare-check platform for elderly people living alone in Japan. It uses natural Japanese voice conversations, memory, realtime risk understanding, and caregiver escalation.

The core differentiator is not calling automation. It is a memory-enabled agent that understands the person over time and decides how to continue the conversation.

## Non-Negotiables

CareVoice must not behave like:

- scripted IVR
- fixed decision tree
- checklist disguised as voice
- caregiver-controlled manual turn processor
- local regex/rules engine as primary intelligence

## Ownership Boundary

Gemini owns:

- realtime Japanese conversation
- adaptive next-question planning
- risk-level decision from memory, transcript, and context
- open-question tracking
- deciding whether to continue, reassure, escalate, or close
- memory proposal generation
- alert explanation proposal
- final caregiver summary

CareVoice owns:

- shared contracts and schemas
- risk-level definitions and safety constraints
- tool endpoints and input validation
- Firestore persistence
- alert creation and audit trail
- caregiver dashboard rendering
- local fallback only when Gemini is unavailable

CareVoice may validate agent output. It should not be the primary decision-maker during normal operation.

## Target User Flow

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

## Risk Levels

Gemini chooses the level and must return evidence.

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

## Dashboard Requirements

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

The dashboard must not make the caregiver manually advance the agent through fixed steps.

Allowed for hackathon only:

- small secondary demo input panel
- sample utterance presets
- fallback simulation controls

These controls must not be the visual center of the product.

## Fallback Policy

A local evaluator may exist only as fallback/demo resilience.

Rules:

- Name it clearly as fallback.
- Keep it behind an adapter interface.
- Do not present it as product intelligence.
- Do not let scenario IDs determine risk.
- Do not let local rules decide the final product flow when Gemini is available.

## Bonus Direction

Primary bonus feature: Managed Agent for post-call caregiver briefing.

It should run after the call using transcript, risk state, alert evidence, and memory timeline.

It should not replace the realtime Gemini Live call agent unless mentors explicitly recommend that path and setup is reliable.
