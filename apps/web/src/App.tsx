import type {
  DashboardSnapshot,
  DemoScenario,
  RiskLevel,
  ScenarioId
} from "@voice-agent/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
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

  return (
    <div className="shell">
      <Sidebar isBusy={isBusy} onReset={() => void reset()} />

      <main className="main-content">
        <nav className="app-header">
          <h2>Caregiver Command Center</h2>
          <div className="status-row">
            <span className={isRealtimeConnected ? "live-indicator" : ""}>
              {isRealtimeConnected ? "Live" : "Reconnecting"}
            </span>
            <span>{snapshot.session ? `Check-in ${snapshot.session.status}` : "No active check-in"}</span>
            <span>{icon("schedule")}{lastUpdated}</span>
            <span className="avatar">YS</span>
          </div>
        </nav>

        <div className="page-head">
          <span className="eyebrow">Welfare intelligence · Q live cohort</span>
          <h1>{snapshot.profile.displayName}</h1>
          <p>
            Daily Japanese voice check-ins track well-being, longitudinal memory, and early
            safety signals — quantified into the metrics below so family and caregivers know
            exactly when to act.
          </p>
          <div className="patient-meta">
            <span>{icon("cake")}{snapshot.profile.age} years old</span>
            <span>{icon("home")}{snapshot.profile.livesAlone ? "Lives alone" : "Lives with support"}</span>
            <span>{icon("call")}{snapshot.profile.emergencyContactName} ({snapshot.profile.emergencyContactRelation})</span>
          </div>
        </div>

        {error ? <div className="error">{icon("error")}{error}</div> : null}

        {/* KPI stat cards */}
        <section className="stat-grid">
          <StatCard
            label="Well-being Risk Score"
            value={String(snapshot.riskState.riskScore)}
            iconName="monitoring"
            iconTone={snapshot.riskState.riskLevel === "stable" ? "green" : "red"}
            trend={scoreTrend}
            foot={`${riskLabels[snapshot.riskState.riskLevel]} risk band`}
          />
          <StatCard
            label="Active Risk Signals"
            value={String(snapshot.riskState.signals.length)}
            iconName="sensors"
            iconTone="slate"
            foot={
              snapshot.riskState.signals.length > 0
                ? snapshot.riskState.signals.map((s) => s.label).slice(0, 2).join(", ")
                : "No signals detected"
            }
          />
          <StatCard
            label="Open Alerts"
            value={String(snapshot.alerts.length)}
            iconName="notifications_active"
            iconTone={snapshot.alerts.length > 0 ? "red" : "green"}
            foot={snapshot.alerts.length > 0 ? "Caregiver follow-up required" : "Caregiver channel quiet"}
          />
          <StatCard
            label="Memory Context"
            value={String(snapshot.memories.length)}
            iconName="database"
            iconTone="slate"
            foot="Longitudinal facts retained"
          />
        </section>

        {/* Charts */}
        <section className="grid charts-grid">
          <article className="card">
            <div className="card-head">
              <div>
                <h2>Risk Score Trend</h2>
                <p className="sub">Score evolution across this check-in's captured responses</p>
              </div>
              <span className="card-kicker">{icon("show_chart")}Live session</span>
            </div>
            <RiskTrendChart history={riskHistory} />
          </article>

          <article className="card">
            <div className="card-head">
              <div>
                <h2>Signal Severity Mix</h2>
                <p className="sub">Distribution of detected signals</p>
              </div>
            </div>
            <SignalDonut snapshot={snapshot} />
          </article>
        </section>

        {/* Reasoning + Alert */}
        <section className="grid mid-grid">
          <RiskCard snapshot={snapshot} />
          <AlertCard alert={activeAlert} />
        </section>

        {/* Console */}
        <section className="panel console-panel">
          <div className="section-title">
            <div>
              <h2>Live Check-In Console</h2>
              <p>Start the scheduled call, capture the elder response, and let the platform update risk, memory, and alerts.</p>
            </div>
            <button className="secondary" disabled={isBusy} onClick={() => void reset()}>
              {icon("restart_alt")}Clear Session
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
              {icon("call")}{isBusy ? "Working..." : "Start Check-In"}
            </button>
            <button className="primary" disabled={isBusy || !customTextJa || !activeSession} onClick={() => void sendElderResponse()}>
              {icon("graphic_eq")}Process Response
            </button>
            <button className="secondary" disabled={isBusy || !activeSession} onClick={() => void completeActiveCall()}>
              {icon("task_alt")}Complete Check-In
            </button>
          </div>
        </section>

        {/* Transcript + side */}
        <section className="grid detail-grid">
          <TranscriptCard snapshot={snapshot} />
          <div className="side-stack">
            <MemoryCard snapshot={snapshot} />
            <SummaryCard snapshot={snapshot} />
          </div>
        </section>

        <section className="cta-banner">
          <div>
            <h3>Built for scale — pilot-ready in days</h3>
            <p>
              Evidence-backed escalation, memory-aware conversations, and a caregiver console
              that turns every call into a quantifiable welfare signal.
            </p>
          </div>
          <button className="primary" onClick={() => void startSelectedCall()} disabled={isBusy}>
            {icon("rocket_launch")}Run Live Demo
          </button>
        </section>
      </main>
    </div>
  );
}

function Sidebar({ isBusy, onReset }: { isBusy: boolean; onReset: () => void }) {
  const nav = [
    { icon: "dashboard", label: "Overview", active: true },
    { icon: "groups", label: "Senior Profiles", active: false },
    { icon: "graphic_eq", label: "Live Monitor", active: false },
    { icon: "notifications", label: "Alert Center", active: false },
    { icon: "monitoring", label: "Analytics", active: false }
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
          <a className={item.active ? "sidebar-nav-link active" : "sidebar-nav-link"} href="#" key={item.label}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
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

function SignalDonut({ snapshot }: { snapshot: DashboardSnapshot }) {
  const order: RiskLevel[] = ["urgent", "high", "concern", "watch", "stable"];
  const counts: Record<RiskLevel, number> = { stable: 0, watch: 0, concern: 0, high: 0, urgent: 0 };
  for (const signal of snapshot.riskState.signals) {
    counts[signal.severity] += 1;
  }
  const segments = order
    .map((level) => ({ level, value: counts[level], color: riskColors[level] }))
    .filter((segment) => segment.value > 0);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  const size = 180;
  const r = 70;
  const stroke = 22;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;

  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Signal severity distribution">
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="transparent" stroke="#edeeef" strokeWidth={stroke} />
          {total > 0 &&
            segments.map((segment) => {
              const dash = (segment.value / total) * circ;
              const el = (
                <circle
                  key={segment.level}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="transparent"
                  stroke={segment.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return el;
            })}
        </g>
        <text className="donut-center-label" x={cx} y={cy - 6} textAnchor="middle">Signals</text>
        <text className="donut-center-value" x={cx} y={cy + 16} textAnchor="middle">{total}</text>
      </svg>

      <div className="legend">
        {total === 0 ? (
          <div className="legend-row">
            <span className="legend-left">
              <span className="legend-dot" style={{ background: "#cbd5e1" }} />
              No signals detected yet
            </span>
            <span className="legend-val">0</span>
          </div>
        ) : (
          segments.map((segment) => (
            <div className="legend-row" key={segment.level}>
              <span className="legend-left">
                <span className="legend-dot" style={{ background: segment.color }} />
                {riskLabels[segment.level]} severity
              </span>
              <span className="legend-val">
                {segment.value} · {Math.round((segment.value / total) * 100)}%
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RiskCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card">
      <span className="card-kicker">{icon("psychology")}AI reasoning state</span>
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

function AlertCard({ alert }: { alert: DashboardSnapshot["alerts"][number] | undefined }) {
  if (!alert) {
    return (
      <article className="card calm">
        <span className="card-kicker">{icon("shield")}Alert center</span>
        <div className="calm-state">
          {icon("check_circle")}
          <strong>No active alert</strong>
          <span>Caregiver notification stays quiet until evidence crosses threshold.</span>
        </div>
      </article>
    );
  }

  return (
    <article className="card alert">
      <span className="card-kicker">{icon("warning")}Alert center</span>
      <span className="alert-badge">{icon("priority_high")}{alert.severity} priority</span>
      <h2>{alert.title}</h2>
      <p>{alert.reason}</p>
      <ul className="evidence-list">
        {alert.evidence.map((item) => (
          <li key={item}>{icon("arrow_right")}{item}</li>
        ))}
      </ul>
    </article>
  );
}

function TranscriptCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="card">
      <span className="card-kicker">{icon("forum")}Live check-in</span>
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
    <article className="card">
      <span className="card-kicker">{icon("history")}Memory timeline</span>
      <h2>Longitudinal context</h2>
      <div className="memory-list">
        {snapshot.memories.map((memory) => (
          <div className={`memory-item ${memory.importance}`} key={memory.id}>
            <span className="mem-cat">{memory.category}</span>
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
        <p className="muted">Complete the call to create a final summary and follow-up recommendation.</p>
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
