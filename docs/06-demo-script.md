# Demo Script

Last updated: 2026-06-27 JST

## Demo Goal

Show that CareVoice is not an IVR. It is a memory-enabled Gemini voice agent that adapts the conversation, updates risk in realtime, and escalates with evidence.

## Demo Surface

Primary hackathon demo:

```text
Browser microphone -> ADK Live voice agent -> CareVoice dashboard
```

Out of scope for the hackathon demo:

```text
Real phone number / Twilio / PSTN call routing
```

Reason: the differentiator is the realtime adaptive agent, memory, risk
understanding, and evidence-based escalation. Phone routing is a transport
integration and can be added later without changing the agent architecture.

## Primary Scenario

Care recipient:

```text
Sato-san, 82, lives alone.
```

Memory before call:

- knee pain last week
- sounded tired yesterday
- usually waters plants after breakfast

Elder line:

```text
昨日ちょっと転んで、今日は立つとふらつきます。
```

English:

```text
I fell a little yesterday, and today I feel unsteady when I stand.
```

Expected agent behavior:

- acknowledges concern naturally
- asks if they are alone
- asks about injury/pain
- updates risk to `high`
- creates caregiver alert
- generates post-call briefing

## Demo Flow

1. Show caregiver dashboard for Sato-san.
2. Start browser voice check-in.
3. Browser calls `POST /api/live/session`.
4. Browser connects to the ADK voice-agent WebSocket.
5. ADK/Gemini opens from memory:

```text
先週、膝が痛いとおっしゃっていましたが、その後どうですか？
```

6. Elder gives fall/dizziness line through browser mic.
7. Dashboard updates:
   - transcript
   - risk state
   - evidence
   - open questions
8. ADK/Gemini asks adaptive follow-up.
9. Alert appears for caregiver.
10. Complete call.
11. Managed Agent briefing appears.

## Backup Demo

If voice setup fails:

- use text-mode fallback input
- keep same transcript/risk/alert/dashboard flow
- explain that ADK Live browser voice is the intended channel
- do not claim phone-call integration is implemented

## Secondary Scenarios

Stable check-in:

```text
今日はまあまあです。膝は少し良くなりました。
```

Expected:

- `stable` or `watch`
- no alert
- memory updates improvement

Loneliness:

```text
別に大丈夫です。ただ、最近あまり人と話していません。
```

Expected:

- `concern`
- no urgent alert
- suggest family follow-up
