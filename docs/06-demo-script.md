# Demo Script

Last updated: 2026-06-27 JST

## Demo Goal

Show that CareVoice is not an IVR. It is a memory-enabled Gemini voice agent that adapts the conversation, updates risk in realtime, and escalates with evidence.

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
2. Start voice check-in.
3. Gemini opens from memory:

```text
先週、膝が痛いとおっしゃっていましたが、その後どうですか？
```

4. Elder gives fall/dizziness line.
5. Dashboard updates:
   - transcript
   - risk state
   - evidence
   - open questions
6. Gemini asks adaptive follow-up.
7. Alert appears for caregiver.
8. Complete call.
9. Managed Agent briefing appears.

## Backup Demo

If voice setup fails:

- use text-mode fallback input
- keep same transcript/risk/alert/dashboard flow
- explain that Gemini Live API is the intended voice channel

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
