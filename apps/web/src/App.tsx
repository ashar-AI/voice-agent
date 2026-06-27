import type {
  DashboardSnapshot,
  DemoScenario,
  RiskLevel,
  ScenarioId
} from "@voice-agent/contracts";
import { useEffect, useMemo, useState } from "react";
import {
  completeCall,
  createDashboardEventSource,
  getScenarios,
  getSnapshot,
  resetDemo,
  sendConversationTurn,
  startScenario
} from "./api";

const ELDER_ID = "sato_001";

const riskLabels: Record<RiskLevel, string> = {
  stable: "Stable",
  watch: "Watch",
  concern: "Concern",
  high: "High",
  urgent: "Urgent"
};

const responsePresets: Record<ScenarioId, { title: string; description: string }> = {
  normal_check_in: {
    title: "Stable response",
    description: "Knee pain is improving; keep monitoring without alerting."
  },
  loneliness_decline: {
    title: "Social isolation signal",
    description: "Non-urgent concern; suggest a family follow-up."
  },
  fall_dizziness_escalation: {
    title: "Safety concern",
    description: "Fall and dizziness signals; notify caregiver with evidence."
  }
};

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function App() {
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<ScenarioId>("fall_dizziness_escalation");
  const [customTextJa, setCustomTextJa] = useState("");
  const [customTextEn, setCustomTextEn] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.scenarioId === selectedScenarioId),
    [scenarios, selectedScenarioId]
  );

  useEffect(() => {
    async function load() {
      try {
        const [nextScenarios, nextSnapshot] = await Promise.all([
          getScenarios(),
          getSnapshot(ELDER_ID)
        ]);
        const nextSelectedScenario =
          nextScenarios.find((scenario) => scenario.scenarioId === selectedScenarioId) ??
          nextScenarios[0];

        setScenarios(nextScenarios);
        setSnapshot(nextSnapshot);
        setCustomTextJa(nextSelectedScenario?.elderLineJa ?? "");
        setCustomTextEn(nextSelectedScenario?.elderLineEn ?? "");
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load workspace");
      }
    }

    void load();
  }, []);

  useEffect(() => {
    const source = createDashboardEventSource(
      ELDER_ID,
      (event) => {
        setSnapshot(event.payload);
        setIsRealtimeConnected(true);
      },
      () => setIsRealtimeConnected(false)
    );

    source.onopen = () => setIsRealtimeConnected(true);

    return () => source.close();
  }, []);

  function selectScenario(scenarioId: ScenarioId) {
    const scenario = scenarios.find((item) => item.scenarioId === scenarioId);
    setSelectedScenarioId(scenarioId);
    setCustomTextJa(scenario?.elderLineJa ?? "");
    setCustomTextEn(scenario?.elderLineEn ?? "");
  }

  async function startSelectedCall() {
    if (!selectedScenario) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const started = await startScenario(ELDER_ID, selectedScenario.scenarioId);
      setSnapshot(started.snapshot);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Call start failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function sendElderResponse() {
    const activeSession = snapshot?.session?.status === "active" ? snapshot.session : undefined;

    if (!activeSession) {
      setError("There is no live call receiving demo input.");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const response = await sendConversationTurn({
        elderId: ELDER_ID,
        sessionId: activeSession.sessionId,
        textJa: customTextJa,
        textEn: customTextEn
      });
      setSnapshot(response.snapshot);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Conversation turn failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function completeActiveCall() {
    const activeSession = snapshot?.session?.status === "active" ? snapshot.session : undefined;

    if (!activeSession) {
      setError("There is no live call to finish.");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const response = await completeCall(activeSession.sessionId);
      setSnapshot(response.snapshot);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Call completion failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function reset() {
    setIsBusy(true);
    setError(null);

    try {
      setSnapshot(await resetDemo());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Reset failed");
    } finally {
      setIsBusy(false);
    }
  }

  if (!snapshot) {
    return (
      <main className="shell">
        <section className="loading">Loading caregiver monitor...</section>
      </main>
    );
  }

  const activeAlert = snapshot.alerts[0];
  const activeSession = snapshot.session?.status === "active" ? snapshot.session : undefined;
  const lastUpdated = formatClock(snapshot.updatedAt);

  return (
    <main className="shell">
      <nav className="app-header">
        <div className="brand">
          <span className="brand-mark">CV</span>
          <div>
            <strong>CareVoice</strong>
            <span>Passive caregiver monitor</span>
          </div>
        </div>
        <div className="status-row">
          <span>{isRealtimeConnected ? "Live updates connected" : "Live updates reconnecting"}</span>
          <span>Updated {lastUpdated}</span>
        </div>
      </nav>

      <header className="hero">
        <div>
          <p className="eyebrow">Current welfare view</p>
          <h1>{snapshot.profile.displayName}</h1>
          <p className="hero-copy">
            Voice check-ins stream into this dashboard so family and care teams can watch
            status, evidence, and recommended follow-up without driving the conversation.
          </p>
          <div className="patient-meta">
            <span>{snapshot.profile.age} years old</span>
            <span>{snapshot.profile.livesAlone ? "Lives alone" : "Lives with support"}</span>
            <span>{snapshot.profile.emergencyContactName}</span>
          </div>
        </div>
        <div className={`risk-meter risk-${snapshot.riskState.riskLevel}`}>
          <span>Risk now</span>
          <strong>{snapshot.riskState.riskScore}</strong>
          <em>{riskLabels[snapshot.riskState.riskLevel]}</em>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="grid monitor-grid" aria-label="Live caregiver monitor">
        <CallStatusCard snapshot={snapshot} />
        <RiskCard snapshot={snapshot} />
        <AlertCard alert={activeAlert} />
      </section>

      <section className="grid detail-grid">
        <TranscriptCard snapshot={snapshot} />
        <div className="side-stack">
          <ReasoningCard snapshot={snapshot} />
          <OpenQuestionsCard snapshot={snapshot} />
          <BriefingCard snapshot={snapshot} />
        </div>
      </section>

      <section className="grid context-grid">
        <MemoryCard snapshot={snapshot} />
        <SummaryCard snapshot={snapshot} />
      </section>

      <section className="panel demo-controls" aria-label="Demo controls">
        <div className="section-title">
          <div>
            <span className="card-kicker">Demo controls</span>
            <h2>Local backup input</h2>
            <p>
              Sample scenarios and manual text remain available for demos when the voice
              channel is not driving the monitor.
            </p>
          </div>
          <button className="secondary" disabled={isBusy} onClick={() => void reset()}>
            Clear demo data
          </button>
        </div>

        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <button
              className={
                scenario.scenarioId === selectedScenarioId
                  ? "scenario-card selected"
                  : "scenario-card"
              }
              key={scenario.scenarioId}
              onClick={() => selectScenario(scenario.scenarioId)}
              type="button"
            >
              <strong>{responsePresets[scenario.scenarioId].title}</strong>
              <span>{responsePresets[scenario.scenarioId].description}</span>
            </button>
          ))}
        </div>

        <div className="input-row">
          <label>
            Sample elder response in Japanese
            <textarea
              value={customTextJa}
              onChange={(event) => setCustomTextJa(event.target.value)}
              rows={3}
            />
          </label>
          <label>
            English translation for caregiver review
            <textarea
              value={customTextEn}
              onChange={(event) => setCustomTextEn(event.target.value)}
              rows={3}
            />
          </label>
        </div>

        <div className="button-row">
          <button className="primary" disabled={isBusy || !selectedScenario} onClick={() => void startSelectedCall()}>
            {isBusy ? "Updating..." : "Begin sample call"}
          </button>
          <button className="primary" disabled={isBusy || !customTextJa || !activeSession} onClick={() => void sendElderResponse()}>
            Send sample response
          </button>
          <button className="secondary" disabled={isBusy || !activeSession} onClick={() => void completeActiveCall()}>
            Finish sample call
          </button>
        </div>
      </section>
    </main>
  );
}

function CallStatusCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const session = snapshot.session;
  const statusText =
    session?.status === "active"
      ? "Live check-in in progress"
      : session?.status === "completed"
        ? "Latest check-in completed"
        : "Waiting for next check-in";
  const transcriptCount = snapshot.transcript.length;
  const lastTurn = snapshot.transcript[transcriptCount - 1];

  return (
    <article className="card call-status">
      <span className="card-kicker">Call status</span>
      <h2>{statusText}</h2>
      <dl className="facts">
        <div><dt>Session</dt><dd>{session?.sessionId ?? "Not started"}</dd></div>
        <div><dt>Transcript turns</dt><dd>{transcriptCount}</dd></div>
        <div><dt>Last activity</dt><dd>{lastTurn ? formatClock(lastTurn.timestamp) : "None yet"}</dd></div>
      </dl>
    </article>
  );
}

function RiskCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className={`card risk-card risk-surface-${snapshot.riskState.riskLevel}`}>
      <span className="card-kicker">Risk and evidence</span>
      <h2>{riskLabels[snapshot.riskState.riskLevel]} risk</h2>
      <div className="risk-score-line">
        <strong>{snapshot.riskState.riskScore}</strong>
        <span>{snapshot.riskState.alertRequired ? "Alert threshold met" : "No alert threshold"}</span>
      </div>
      {snapshot.riskState.signals.length > 0 ? (
        <div className="signal-list">
          {snapshot.riskState.signals.map((signal) => (
            <div className={`signal risk-border-${signal.severity}`} key={signal.id}>
              <strong>{signal.label}</strong>
              <p>{signal.evidence}</p>
              <span>{riskLabels[signal.severity]} evidence</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No risk signals detected in the current check-in.</p>
      )}
    </article>
  );
}

function AlertCard({ alert }: { alert: DashboardSnapshot["alerts"][number] | undefined }) {
  if (!alert) {
    return (
      <article className="card calm">
        <span className="card-kicker">Alert</span>
        <h2>No active alert</h2>
        <p className="muted">Caregiver notification stays quiet until evidence crosses threshold.</p>
      </article>
    );
  }

  return (
    <article className={`card alert risk-surface-${alert.severity}`}>
      <span className="card-kicker">Alert</span>
      <h2>{alert.title}</h2>
      <p>{alert.reason}</p>
      <strong className="action-label">Suggested follow-up</strong>
      <p>{alert.suggestedAction}</p>
      <ul>
        {alert.evidence.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

function ReasoningCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card">
      <span className="card-kicker">AI reasoning state</span>
      <h2>{snapshot.riskState.nextGoal}</h2>
      <p className="muted">{snapshot.riskState.recommendedAction}</p>
      <div className="chip-row">
        {snapshot.riskState.knownFacts.map((fact) => (
          <span className="chip" key={fact}>{fact}</span>
        ))}
      </div>
    </article>
  );
}

function OpenQuestionsCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card questions">
      <span className="card-kicker">Open questions</span>
      {snapshot.riskState.uncertainties.length > 0 ? (
        <div className="question-list">
          {snapshot.riskState.uncertainties.map((item) => <p key={item}>{item}</p>)}
        </div>
      ) : (
        <>
          <h2>No unresolved questions</h2>
          <p className="muted">The current evidence is enough for the recommended state.</p>
        </>
      )}
    </article>
  );
}

function TranscriptCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card transcript">
      <span className="card-kicker">Live transcript</span>
      <h2>Conversation stream</h2>
      {snapshot.transcript.length === 0 ? (
        <p className="muted">The transcript will appear as the scheduled check-in runs.</p>
      ) : (
        <div className="turn-list">
          {snapshot.transcript.map((turn) => (
            <div className={`turn ${turn.speaker}`} key={turn.id}>
              <div className="turn-meta">
                <strong>{turn.speaker}</strong>
                <span>{formatClock(turn.timestamp)}</span>
              </div>
              <p lang="ja">{turn.textJa}</p>
              {turn.textEn ? <span>{turn.textEn}</span> : null}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function MemoryCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card memory">
      <span className="card-kicker">Memory timeline</span>
      <h2>Longitudinal context</h2>
      <div className="memory-list">
        {snapshot.memories.map((memory) => (
          <div className="memory-item" key={memory.id}>
            <div className="memory-meta">
              <strong>{memory.category}</strong>
              <span>{formatDateTime(memory.observedAt)}</span>
            </div>
            <p>{memory.text}</p>
            <span>{memory.importance} importance</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function SummaryCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  if (!snapshot.latestSummary) {
    return (
      <article className="card">
        <span className="card-kicker">Summary</span>
        <h2>Pending</h2>
        <p className="muted">A final summary and follow-up recommendation will appear after the call closes.</p>
      </article>
    );
  }

  return (
    <article className="card">
      <span className="card-kicker">Summary</span>
      <h2>{snapshot.latestSummary.summary}</h2>
      <p className="muted">{snapshot.latestSummary.recommendedFollowUp}</p>
      <div className="chip-row">
        {snapshot.latestSummary.keyEvidence.map((item) => <span className="chip" key={item}>{item}</span>)}
      </div>
    </article>
  );
}

function BriefingCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  if (!snapshot.latestBriefing) {
    return (
      <article className="card briefing">
        <span className="card-kicker">Future briefing</span>
        <h2>Awaiting family-ready wording</h2>
        <p className="muted">When the contract supplies a caregiver briefing, it will appear here with evidence and safety wording.</p>
      </article>
    );
  }

  return (
    <article className="card briefing">
      <span className="card-kicker">Future briefing</span>
      <h2>{snapshot.latestBriefing.briefing}</h2>
      <p className="muted">{snapshot.latestBriefing.recommendedFamilyFollowUp}</p>
      <div className="signal-list compact">
        {snapshot.latestBriefing.evidenceBullets.map((item) => (
          <div className="signal" key={item}>
            <p>{item}</p>
          </div>
        ))}
      </div>
      <strong className="action-label">Safety wording</strong>
      <p>{snapshot.latestBriefing.safetyWording}</p>
    </article>
  );
}
