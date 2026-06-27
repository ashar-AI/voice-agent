import type {
  DashboardSnapshot,
  DemoScenario,
  RiskLevel,
  ScenarioId
} from "@voice-agent/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { CallSurface } from "./CallSurface";
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
const ADK_BASE_URL = import.meta.env.VITE_ADK_VOICE_BASE_URL ?? "http://localhost:8081";

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

type RiskPoint = { score: number; level: RiskLevel };

const icon = (name: string) => <span className="material-symbols-outlined">{name}</span>;

export function App() {
  const [surface, setSurface] = useState<"dashboard" | "call">(() =>
    window.location.hash === "#call" ? "call" : "dashboard"
  );
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<ScenarioId>("fall_dizziness_escalation");
  const [customTextJa, setCustomTextJa] = useState("");
  const [customTextEn, setCustomTextEn] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [riskHistory, setRiskHistory] = useState<RiskPoint[]>([]);
  const lastScoreRef = useRef<number | null>(null);

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
        setError(nextError instanceof Error ? nextError.message : "Failed to load dashboard");
      }
    }

    void load();
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setSurface(window.location.hash === "#call" ? "call" : "dashboard");
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
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

  // Accumulate a risk-score trend series across the live session. Cleared on reset.
  // When the agent emits richer per-turn telemetry, this series is its natural home.
  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (!snapshot.session) {
      if (riskHistory.length > 0) {
        setRiskHistory([]);
      }
      lastScoreRef.current = null;
      return;
    }

    const score = snapshot.riskState.riskScore;
    if (lastScoreRef.current !== score) {
      lastScoreRef.current = score;
      setRiskHistory((prev) =>
        [...prev, { score, level: snapshot.riskState.riskLevel }].slice(-12)
      );
    }
  }, [snapshot]);

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
      <div className="shell dashboard-shell">
        <main className="main-content">
          <section className="loading">Loading Kizuna dashboard...</section>
        </main>
      </div>
    );
  }

  const activeAlert = snapshot.alerts[0];
  const activeSession = snapshot.session?.status === "active" ? snapshot.session : undefined;
  const lastUpdated = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(snapshot.updatedAt));

  const scoreTrend = computeTrend(riskHistory);
  const callStatus = getCallStatus(snapshot);
  const firstOpenQuestion = snapshot.riskState.uncertainties[0];

  if (surface === "call") {
    return (
      <CallSurface
        elderId={ELDER_ID}
        adkBaseUrl={ADK_BASE_URL}
        onSnapshot={setSnapshot}
        onClose={() => {
          window.location.hash = "dashboard";
        }}
      />
    );
  }

  return (
    <div className="shell dashboard-shell">
      <main className="main-content">
        <nav className="app-header">
          <div className="brand-lockup">
            <span className="brand-mark">K</span>
            <div>
              <strong>Kizuna</strong>
              <span>Caregiver dashboard</span>
            </div>
          </div>
          <div className="status-row">
            <span className={isRealtimeConnected ? "live-indicator" : ""}>
              {isRealtimeConnected ? "Live updates" : "Reconnecting"}
            </span>
            <span>{callStatus.label}</span>
            <span>{icon("schedule")}{lastUpdated}</span>
            <button className="secondary compact-action" disabled={isBusy} onClick={() => void reset()}>
              {icon("restart_alt")}Reset
            </button>
          </div>
        </nav>

        <div className="page-head dashboard-head">
          <div>
            <span className="eyebrow">Care recipient</span>
            <h1>{snapshot.profile.displayName}</h1>
            <div className="patient-meta">
              <span>{icon("cake")}{snapshot.profile.age} years old</span>
              <span>{icon("home")}{snapshot.profile.livesAlone ? "Lives alone" : "Lives with support"}</span>
              <span>{icon("call")}{snapshot.profile.emergencyContactName} ({snapshot.profile.emergencyContactRelation})</span>
            </div>
          </div>
        </div>

        {error ? <div className="error">{icon("error")}{error}</div> : null}

        <section className="stat-grid">
          <StatCard
            label="Risk score"
            value={String(snapshot.riskState.riskScore)}
            iconName="monitoring"
            iconTone={snapshot.riskState.riskLevel === "stable" ? "green" : "red"}
            trend={scoreTrend}
            foot={`${riskLabels[snapshot.riskState.riskLevel]} risk band`}
          />
          <StatCard
            label="Call status"
            value={callStatus.value}
            iconName={callStatus.iconName}
            iconTone={callStatus.iconTone}
            foot={callStatus.detail}
          />
          <StatCard
            label="Open questions"
            value={String(snapshot.riskState.uncertainties.length)}
            iconName="help"
            iconTone="slate"
            foot={firstOpenQuestion ?? "No open questions"}
          />
          <StatCard
            label="Open alerts"
            value={String(snapshot.alerts.length)}
            iconName="notifications_active"
            iconTone={snapshot.alerts.length > 0 ? "red" : "green"}
            foot={activeAlert ? activeAlert.title : "No active alert"}
          />
        </section>

        <section className="grid monitor-grid">
          <TranscriptCard snapshot={snapshot} />
          <div className="side-stack">
            <RiskCard snapshot={snapshot} />
            <EvidenceCard snapshot={snapshot} />
            <AlertCard alert={activeAlert} alertCount={snapshot.alerts.length} />
          </div>
        </section>

        <section className="grid support-grid">
          <HandoffCard snapshot={snapshot} />
          <MemoryCard snapshot={snapshot} />
        </section>

        <details className="demo-controls">
          <summary>
            <span>{icon("tune")}Fallback Controls</span>
            <small>Text mode backup</small>
          </summary>

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
              Japanese response
              <textarea
                value={customTextJa}
                onChange={(event) => setCustomTextJa(event.target.value)}
                rows={3}
              />
            </label>
            <label>
              English review text
              <textarea
                value={customTextEn}
                onChange={(event) => setCustomTextEn(event.target.value)}
                rows={3}
              />
            </label>
          </div>

          <div className="button-row">
            <button className="secondary" disabled={isBusy || !selectedScenario} onClick={() => void startSelectedCall()}>
              {icon("call")}{isBusy ? "Working..." : "Start fallback"}
            </button>
            <button className="secondary" disabled={isBusy || !customTextJa || !activeSession} onClick={() => void sendElderResponse()}>
              {icon("graphic_eq")}Send turn
            </button>
            <button className="secondary" disabled={isBusy || !activeSession} onClick={() => void completeActiveCall()}>
              {icon("task_alt")}Complete fallback
            </button>
          </div>
        </details>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  iconName,
  iconTone,
  trend,
  foot
}: {
  label: string;
  value: string;
  iconName: string;
  iconTone: "green" | "red" | "slate";
  trend?: { dir: "up" | "down" | "flat"; text: string };
  foot: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`stat-icon ${iconTone}`}>{icon(iconName)}</span>
      </div>
      <div className="stat-sub">
        <span className="stat-value">{value}</span>
        {trend ? (
          <span className={`trend ${trend.dir}`}>
            {icon(trend.dir === "up" ? "trending_up" : trend.dir === "down" ? "trending_down" : "trending_flat")}
            {trend.text}
          </span>
        ) : null}
      </div>
      <span className="stat-foot">{foot}</span>
    </article>
  );
}

function computeTrend(history: RiskPoint[]): { dir: "up" | "down" | "flat"; text: string } | undefined {
  const current = history[history.length - 1];
  const previous = history[history.length - 2];
  if (!current || !previous) {
    return undefined;
  }
  const delta = current.score - previous.score;
  if (delta === 0) {
    return { dir: "flat", text: "0" };
  }
  return { dir: delta > 0 ? "up" : "down", text: `${delta > 0 ? "+" : ""}${delta}` };
}

function getCallStatus(snapshot: DashboardSnapshot): {
  label: string;
  value: string;
  detail: string;
  iconName: string;
  iconTone: "green" | "red" | "slate";
} {
  if (!snapshot.session) {
    return {
      label: "No active check-in",
      value: "Idle",
      detail: "Waiting for elder call",
      iconName: "pause_circle",
      iconTone: "slate"
    };
  }

  if (snapshot.session.status === "active") {
    return {
      label: "Check-in active",
      value: "Live",
      detail: `Started ${formatTime(snapshot.session.startedAt)}`,
      iconName: "radio_button_checked",
      iconTone: "green"
    };
  }

  return {
    label: "Check-in completed",
    value: "Done",
    detail: snapshot.session.completedAt
      ? `Completed ${formatTime(snapshot.session.completedAt)}`
      : "Summary pending",
    iconName: "task_alt",
    iconTone: "green"
  };
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function EvidenceCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const signals = snapshot.riskState.signals.slice(0, 3);
  return (
    <article className="card evidence-card">
      <div className="card-head">
        <div>
          <h2>Risk Evidence</h2>
          <p className="sub">{signals.length} active signal{signals.length === 1 ? "" : "s"}</p>
        </div>
        <span className={`risk-badge ${snapshot.riskState.riskLevel}`}>
          {riskLabels[snapshot.riskState.riskLevel]}
        </span>
      </div>

      {signals.length === 0 ? (
        <div className="empty-state compact">
          {icon("verified")}
          <strong>No risk evidence yet</strong>
          <span>Baseline monitoring remains stable.</span>
        </div>
      ) : (
        <div className="evidence-stack">
          {signals.map((signal) => (
            <div className={`evidence-row ${signal.severity}`} key={signal.id}>
              <span className="evidence-severity">{riskLabels[signal.severity]}</span>
              <div>
                <strong>{signal.label}</strong>
                <p>{signal.evidence}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function RiskCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card risk-card">
      <div className="risk-card-head">
        <span className="card-kicker">{icon("psychology")}AI reasoning state</span>
        <span className={`risk-badge ${snapshot.riskState.riskLevel}`}>
          {riskLabels[snapshot.riskState.riskLevel]}
        </span>
      </div>
      <p className="next-goal">{snapshot.riskState.nextGoal}</p>
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
      <div className="recommend">
        {icon("flag")}
        {snapshot.riskState.recommendedAction}
      </div>
    </article>
  );
}

function AlertCard({
  alert,
  alertCount
}: {
  alert: DashboardSnapshot["alerts"][number] | undefined;
  alertCount: number;
}) {
  if (!alert) {
    return (
      <article className="card calm">
        <span className="card-kicker">{icon("shield")}Alert center</span>
        <div className="calm-state">
          {icon("check_circle")}
          <strong>No active alert</strong>
          <span>0 open caregiver notifications</span>
        </div>
      </article>
    );
  }

  return (
    <article className="card alert">
      <span className="card-kicker">{icon("warning")}Alert center</span>
      <span className="alert-badge">{icon("priority_high")}{alertCount} open · {alert.severity} priority</span>
      <h2>{alert.title}</h2>
      <p>{alert.reason}</p>
      <ul className="evidence-list">
        {alert.evidence.map((item) => (
          <li key={item}>{icon("arrow_right")}{item}</li>
        ))}
      </ul>
      <div className="recommend">
        {icon("contact_phone")}
        {alert.suggestedAction}
      </div>
    </article>
  );
}

function TranscriptCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const speakerLabels: Record<DashboardSnapshot["transcript"][number]["speaker"], string> = {
    ai: "Agent",
    elder: "Elder",
    system: "System"
  };

  return (
    <article className="card">
      <span className="card-kicker">{icon("forum")}Live check-in</span>
      <h2>Conversation transcript</h2>
      {snapshot.transcript.length === 0 ? (
        <div className="empty-state transcript-empty">
          {icon("speaker_notes")}
          <strong>No transcript yet</strong>
          <span>Live turns will appear here as the agent reports them.</span>
        </div>
      ) : (
        <div className="turn-list">
          {snapshot.transcript.map((turn) => (
            <div className={`turn ${turn.speaker}`} key={turn.id}>
              <strong>{speakerLabels[turn.speaker]} · {formatTime(turn.timestamp)}</strong>
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
    <article className="card" id="memory">
      <span className="card-kicker">{icon("history")}Memory timeline</span>
      <h2>Longitudinal context</h2>
      <div className="memory-list">
        {snapshot.memories.slice(0, 4).map((memory) => (
          <div className={`memory-item ${memory.importance}`} key={memory.id}>
            <span className="mem-cat">{memory.category} · {formatShortDate(memory.observedAt)}</span>
            <p>{memory.text}</p>
            <span className="mem-imp">{memory.importance} importance</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function HandoffCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  if (!snapshot.latestSummary && !snapshot.latestBriefing) {
    return (
      <article className="card handoff-card">
        <span className="card-kicker">{icon("summarize")}Post-call handoff</span>
        <h2>Waiting for call completion</h2>
        <p className="muted">Summary and caregiver briefing appear here after the check-in.</p>
      </article>
    );
  }

  return (
    <article className="card handoff-card">
      <span className="card-kicker">{icon("summarize")}Post-call handoff</span>
      {snapshot.latestSummary ? (
        <>
          <h2>{snapshot.latestSummary.summary}</h2>
          <p className="muted">{snapshot.latestSummary.recommendedFollowUp}</p>
          <div className="chip-row">
            {snapshot.latestSummary.keyEvidence.map((item) => <span className="chip" key={item}>{item}</span>)}
          </div>
        </>
      ) : null}

      {snapshot.latestBriefing ? (
        <>
          <div className="briefing-follow-up">
            {icon("family_restroom")}
            <span>{snapshot.latestBriefing.recommendedFamilyFollowUp}</span>
          </div>
          <div className="evidence-stack">
            {snapshot.latestBriefing.evidenceBullets.slice(0, 3).map((item) => (
              <div className="briefing-evidence" key={item}>
                {icon("check")}
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p className="safety-wording">{snapshot.latestBriefing.safetyWording}</p>
        </>
      ) : null}
    </article>
  );
}
