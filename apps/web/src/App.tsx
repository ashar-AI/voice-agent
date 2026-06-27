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

const riskColors: Record<RiskLevel, string> = {
  stable: "#16a34a",
  watch: "#f59e0b",
  concern: "#ea580c",
  high: "#dc2626",
  urgent: "#be123c"
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
        setError(nextError instanceof Error ? nextError.message : "Failed to load workspace");
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
      <div className="shell">
        <Sidebar isBusy onReset={() => undefined} />
        <main className="main-content">
          <section className="loading">Loading caregiver workspace...</section>
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
  const latestElderTurn = getLatestTurn(snapshot, "elder");
  const primarySignal = snapshot.riskState.signals[0];
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
    <div className="shell">
      <Sidebar
        isBusy={isBusy}
        onReset={() => void reset()}
        snapshot={snapshot}
        isRealtimeConnected={isRealtimeConnected}
      />

      <main className="main-content" id="overview">
        <nav className="app-header">
          <h2>Caregiver Dashboard</h2>
          <div className="status-row">
            <span className={isRealtimeConnected ? "live-indicator" : ""}>
              {isRealtimeConnected ? "Live updates" : "Reconnecting"}
            </span>
            <span>{callStatus.label}</span>
            <span>{icon("schedule")}{lastUpdated}</span>
            <span className="avatar">YS</span>
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
          <div className="head-actions">
            <button className="primary" onClick={() => { window.location.hash = "call"; }}>
              {icon("mic")}Open elder call
            </button>
            <button className="secondary" disabled={isBusy} onClick={() => void reset()}>
              {icon("restart_alt")}Reset
            </button>
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
            label="Risk signals"
            value={String(snapshot.riskState.signals.length)}
            iconName="sensors"
            iconTone={snapshot.riskState.signals.length > 0 ? "red" : "green"}
            foot={
              primarySignal
                ? `${riskLabels[primarySignal.severity]} · ${primarySignal.label}`
                : "No signals detected"
            }
          />
        </section>

        <section className="grid charts-grid">
          <article className="card">
            <div className="card-head">
              <div>
                <h2>Risk Score Trend</h2>
                <p className="sub">Captured risk score changes in the current session</p>
              </div>
              <span className="card-kicker">{icon("show_chart")}Live session</span>
            </div>
            <RiskTrendChart history={riskHistory} />
          </article>

          <EvidenceCard snapshot={snapshot} />
        </section>

        <section className="grid mid-grid" id="alerts">
          <RiskCard snapshot={snapshot} />
          <AlertCard alert={activeAlert} alertCount={snapshot.alerts.length} />
        </section>

        <section className="grid detail-grid" id="transcript">
          <TranscriptCard snapshot={snapshot} />
          <div className="side-stack">
            <SummaryCard snapshot={snapshot} />
            <BriefingCard snapshot={snapshot} />
            <MemoryCard snapshot={snapshot} />
          </div>
        </section>

        <details className="demo-controls">
          <summary>
            <span>{icon("tune")}Demo Controls</span>
            <small>{latestElderTurn ? `Latest: ${latestElderTurn.textEn ?? latestElderTurn.textJa}` : "Fallback text mode"}</small>
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

function Sidebar({
  isBusy,
  onReset,
  snapshot,
  isRealtimeConnected = false
}: {
  isBusy: boolean;
  onReset: () => void;
  snapshot?: DashboardSnapshot;
  isRealtimeConnected?: boolean;
}) {
  const nav = [
    { icon: "dashboard", label: "Overview", href: "#overview", active: true },
    { icon: "forum", label: "Transcript", href: "#transcript", active: false },
    { icon: "warning", label: "Alerts", href: "#alerts", active: false },
    { icon: "history", label: "Memory", href: "#memory", active: false },
    { icon: "mic", label: "Elder call", href: "#call", active: false }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">CV</div>
        <div className="sidebar-logo-text">
          <strong>CareVoice</strong>
          <span>Welfare Portal</span>
        </div>
      </div>
      <div className="sidebar-section-label">Workspace</div>
      <nav className="sidebar-nav">
        {nav.map((item) => (
          <a className={item.active ? "sidebar-nav-link active" : "sidebar-nav-link"} href={item.href} key={item.label}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      {snapshot ? (
        <div className="sidebar-status">
          <span className={isRealtimeConnected ? "sidebar-live is-live" : "sidebar-live"}>
            {isRealtimeConnected ? "Live updates" : "Sync pending"}
          </span>
          <div>
            <strong>{snapshot.profile.displayName}</strong>
            <small>{riskLabels[snapshot.riskState.riskLevel]} · {snapshot.riskState.riskScore}/100</small>
          </div>
        </div>
      ) : null}
      <div className="sidebar-footer">
        <button className="secondary" disabled={isBusy} onClick={onReset} style={{ width: "100%" }}>
          <span className="material-symbols-outlined">restart_alt</span>
          Reset state
        </button>
      </div>
    </aside>
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

function getLatestTurn(
  snapshot: DashboardSnapshot,
  speaker: DashboardSnapshot["transcript"][number]["speaker"]
) {
  return [...snapshot.transcript].reverse().find((turn) => turn.speaker === speaker);
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

function RiskTrendChart({ history }: { history: RiskPoint[] }) {
  if (history.length < 2) {
    return (
      <div className="chart-empty">
        {icon("ssid_chart")}
        <strong>Trend builds as responses arrive</strong>
        <span>Start a check-in and process at least two responses to plot the risk trajectory.</span>
      </div>
    );
  }

  const W = 640;
  const H = 240;
  const padX = 36;
  const padY = 24;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const maxScore = 100;

  const points = history.map((point, index) => {
    const x = padX + (innerW * index) / (history.length - 1);
    const y = padY + innerH * (1 - point.score / maxScore);
    return { x, y, ...point };
  });

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return null;
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${last.x.toFixed(1)},${(padY + innerH).toFixed(1)} L${first.x.toFixed(1)},${(padY + innerH).toFixed(1)} Z`;

  return (
    <div className="linechart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Risk score trend">
        <defs>
          <linearGradient id="riskArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff6600" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ff6600" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padY + innerH * (1 - tick / maxScore);
          return (
            <g key={tick}>
              <line className="grid-line" x1={padX} y1={y} x2={W - padX} y2={y} />
              <text className="axis-label" x={padX - 8} y={y + 3} textAnchor="end">{tick}</text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#riskArea)" />
        <path d={linePath} fill="none" stroke="#ff6600" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={i === points.length - 1 ? 5 : 3.5} fill="#fff" stroke={riskColors[p.level]} strokeWidth={2.5} />
            <text className="axis-label" x={p.x} y={H - 6} textAnchor="middle">R{i + 1}</text>
          </g>
        ))}

        <text x={last.x} y={last.y - 12} textAnchor="middle" fill={riskColors[last.level]} fontSize="13" fontWeight="700">
          {last.score}
        </text>
      </svg>
    </div>
  );
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
        <p className="muted">Transcript will appear when the elder call begins.</p>
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

function SummaryCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  if (!snapshot.latestSummary) {
    return (
      <article className="card summary-card">
        <span className="card-kicker">{icon("summarize")}Post-call summary</span>
        <h2>Pending</h2>
        <p className="muted">Summary will appear after call completion.</p>
      </article>
    );
  }

  return (
    <article className="card summary-card">
      <span className="card-kicker">{icon("summarize")}Post-call summary</span>
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
      <article className="card briefing-card">
        <span className="card-kicker">{icon("clinical_notes")}Caregiver briefing</span>
        <h2>Pending</h2>
        <p className="muted">Briefing will appear with the post-call handoff.</p>
      </article>
    );
  }

  return (
    <article className="card briefing-card">
      <span className="card-kicker">{icon("clinical_notes")}Caregiver briefing</span>
      <h2>{snapshot.latestBriefing.briefing}</h2>
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
    </article>
  );
}
