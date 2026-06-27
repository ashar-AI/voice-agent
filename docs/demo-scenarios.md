# Demo Scenarios

The hackathon demo should prioritize scenario 3, because it shows memory, realtime risk extraction, adaptive questioning, and escalation in one loop.

## Scenario 1: Normal Personalized Check-In

Memory:

- Knee pain last week.
- Sounded tired yesterday.

Elder line:

```text
今日はまあまあです。膝は少し良くなりました。
```

Expected outcome:

- Risk remains low.
- No alert.
- Memory updates that knee pain is improving.

## Scenario 2: Subtle Loneliness / Mood Decline

Elder line:

```text
別に大丈夫です。ただ、最近あまり人と話していません。
```

Expected outcome:

- Risk becomes medium.
- No urgent alert.
- Dashboard recommends a soft family follow-up.

## Scenario 3: Fall / Dizziness Escalation

Elder line:

```text
昨日ちょっと転んで、今日は立つとふらつきます。
```

Expected outcome:

- Risk becomes high.
- Agent asks immediate safety follow-up.
- Caregiver alert is created with evidence:
  - fall yesterday
  - unsteady when standing
  - lives alone
  - recent knee pain memory
