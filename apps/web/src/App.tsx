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
    description: "Low urgency concern; suggest a family follow-up."
  },
  fall_dizziness_escalation: {
    title: "Safety concern",
    description: "Fall and dizziness signals; notify caregiver with evidence."
  }
};

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
        setScenarios(nextScenarios);
        setSnapshot(nextSnapshot);
        setCustomTextJa(
          nextScenarios.find((scenario) => scenario.scenarioId === selectedScenarioId)
            ?.elderLineJa ?? ""
        );
        setCustomTextEn(
          nextScenarios.find((scenario) => scenario.scenarioId === selectedScenarioId)
            ?.elderLineEn ?? ""
        );
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
      setError("Start a call before sending an elder response.");
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
      setError("There is no active call to complete.");
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
        <section className="loading">Loading caregiver workspace...</section>
      </main>
    );
  }

  const activeAlert = snapshot.alerts[0];
  const activeSession = snapshot.session?.status === "active" ? snapshot.session : undefined;
  const lastUpdated = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(snapshot.updatedAt));

  return (
    <main className="shell">
      <nav className="app-header">
        <div className="brand">
          <span className="brand-mark">CV</span>
          <div>
            <strong>CareVoice</strong>
            <span>Caregiver command center</span>
          </div>
        </div>
        <div className="status-row">
          <span>{snapshot.session ? `Check-in ${snapshot.session.status}` : "No active check-in"}</span>
          <span>{isRealtimeConnected ? "Live updates connected" : "Live updates reconnecting"}</span>
          <span>Updated {lastUpdated}</span>
        </div>
      </nav>

      <header className="hero">
        <div>
          <p className="eyebrow">Today&apos;s welfare status</p>
          <h1>{snapshot.profile.displayName}</h1>
          <p className="hero-copy">
            Daily voice check-ins track well-being, memory context, and early safety signals
            so family and caregivers know when to follow up.
          </p>
          <div className="patient-meta">
            <span>{snapshot.profile.age} years old</span>
            <span>{snapshot.profile.livesAlone ? "Lives alone" : "Lives with support"}</span>
            <span>Emergency contact: {snapshot.profile.emergencyContactName}</span>
          </div>
        </div>
        <div className={`risk-meter risk-${snapshot.riskState.riskLevel}`}>
          <span>Well-being risk</span>
          <strong>{snapshot.riskState.riskScore}</strong>
          <em>{riskLabels[snapshot.riskState.riskLevel]}</em>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="grid overview-grid">
        <ProfileCard snapshot={snapshot} />
        <RiskCard snapshot={snapshot} />
        <AlertCard alert={activeAlert} />
      </section>

      <section className="panel console-panel">
        <div className="section-title">
          <div>
            <h2>Live Check-In Console</h2>
            <p>Start the scheduled call, capture the elder response, and let the platform update risk, memory, and alerts.</p>
          </div>
          <button className="secondary" disabled={isBusy} onClick={() => void reset()}>
            Clear Session
          </button>
        </div>

        <div className="console-flow" aria-label="Check-in workflow">
          <div className={snapshot.session ? "flow-node done" : "flow-node"}>
            <span>1</span>
            <strong>Call started</strong>
            <em>Agent opens from memory</em>
          </div>
          <div className={snapshot.transcript.some((turn) => turn.speaker === "elder") ? "flow-node done" : "flow-node"}>
            <span>2</span>
            <strong>Response captured</strong>
            <em>Utterance is evaluated</em>
          </div>
          <div className={snapshot.riskState.signals.length > 0 ? "flow-node done" : "flow-node"}>
            <span>3</span>
            <strong>Risk updated</strong>
            <em>Next goal is selected</em>
          </div>
          <div className={snapshot.session?.status === "completed" ? "flow-node done" : "flow-node"}>
            <span>4</span>
            <strong>Summary ready</strong>
            <em>Caregiver follow-up</em>
          </div>
        </div>

        <div className="operator-note">
          Input source: select a sample elder response or edit it manually.
          The voice channel will send the same payload automatically.
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
            Captured elder response in Japanese
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
            {isBusy ? "Working..." : "Start Check-In"}
          </button>
          <button className="primary" disabled={isBusy || !customTextJa || !activeSession} onClick={() => void sendElderResponse()}>
            Process Response
          </button>
          <button className="secondary" disabled={isBusy || !activeSession} onClick={() => void completeActiveCall()}>
            Complete Check-In
          </button>
        </div>
      </section>

      <section className="grid detail-grid">
        <TranscriptCard snapshot={snapshot} />
        <div className="side-stack">
          <MemoryCard snapshot={snapshot} />
          <SummaryCard snapshot={snapshot} />
        </div>
      </section>
    </main>
  );
}

function ProfileCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card">
      <span className="card-kicker">Care recipient</span>
      <h2>Home context</h2>
      <dl className="facts">
        <div><dt>Age</dt><dd>{snapshot.profile.age}</dd></div>
        <div><dt>Lives alone</dt><dd>{snapshot.profile.livesAlone ? "Yes" : "No"}</dd></div>
        <div><dt>Contact</dt><dd>{snapshot.profile.emergencyContactName}</dd></div>
      </dl>
    </article>
  );
}

function RiskCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card">
      <span className="card-kicker">AI reasoning state</span>
      <h2>{snapshot.riskState.nextGoal}</h2>
      <div className="chip-row">
        {snapshot.riskState.knownFacts.map((fact) => (
          <span className="chip" key={fact}>{fact}</span>
        ))}
      </div>
      {snapshot.riskState.uncertainties.length > 0 ? (
        <div className="uncertainty-list">
          <strong>Open questions</strong>
          {snapshot.riskState.uncertainties.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      <p className="muted">{snapshot.riskState.recommendedAction}</p>
    </article>
  );
}

function AlertCard({ alert }: { alert: DashboardSnapshot["alerts"][number] | undefined }) {
  if (!alert) {
    return (
      <article className="card calm">
        <span className="card-kicker">Alert center</span>
        <h2>No active alert</h2>
        <p className="muted">Caregiver notification stays quiet until evidence crosses threshold.</p>
      </article>
    );
  }

  return (
    <article className="card alert">
      <span className="card-kicker">Alert center</span>
      <h2>{alert.title}</h2>
      <p>{alert.reason}</p>
      <ul>
        {alert.evidence.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

function TranscriptCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card transcript">
      <span className="card-kicker">Live check-in</span>
      <h2>Conversation transcript</h2>
      {snapshot.transcript.length === 0 ? (
        <p className="muted">Start the scheduled check-in to create the live transcript.</p>
      ) : (
        <div className="turn-list">
          {snapshot.transcript.map((turn) => (
            <div className={`turn ${turn.speaker}`} key={turn.id}>
              <strong>{turn.speaker}</strong>
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
            <strong>{memory.category}</strong>
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
        <span className="card-kicker">Post-call summary</span>
        <h2>Pending</h2>
        <p className="muted">Complete the call to create a final summary and follow-up recommendation.</p>
      </article>
    );
  }

  return (
    <article className="card">
      <span className="card-kicker">Post-call summary</span>
      <h2>{snapshot.latestSummary.summary}</h2>
      <p className="muted">{snapshot.latestSummary.recommendedFollowUp}</p>
      <div className="chip-row">
        {snapshot.latestSummary.keyEvidence.map((item) => <span className="chip" key={item}>{item}</span>)}
      </div>
    </article>
  );
}
