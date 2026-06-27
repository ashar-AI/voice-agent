import type { DashboardSnapshot, LiveSessionBootstrapResponse } from "@voice-agent/contracts";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createAdkVoiceClient, type AdkVoiceClient, type AdkVoiceMessage } from "./adkVoiceClient";
import { startLiveSession } from "./api";
import {
  createPcmAudioPlayer,
  startPcm16MicrophoneStream,
  type MicrophoneStreamer,
  type PcmAudioPlayer
} from "./audioUtils";

export type CallSurfaceStatus = "idle" | "starting" | "connecting" | "live" | "ended" | "error";

export type CallSurfaceProps = {
  elderId: string;
  adkBaseUrl: string;
  onSnapshot: (snapshot: DashboardSnapshot) => void;
  onClose?: () => void;
};

type AdkEventSummary = {
  id: string;
  at: string;
  summary: string;
};

type MicState = "idle" | "requesting" | "streaming" | "blocked" | "stopped";

const eventLimit = 8;
const defaultSmokeText = "今日は少しふらつきます。";

const statusLabels: Record<CallSurfaceStatus, string> = {
  idle: "待機中",
  starting: "準備中",
  connecting: "接続中",
  live: "通話中",
  ended: "終了",
  error: "エラー"
};

const statusHelpText: Record<CallSurfaceStatus, string> = {
  idle: "大きなボタンを押すと、CareVoice が日本語でお声がけします。",
  starting: "通話の準備をしています。少しお待ちください。",
  connecting: "音声エージェントに接続しています。",
  live: "通話につながっています。マイクの声がADK音声エージェントに送られます。",
  ended: "通話は終了しました。",
  error: "接続で問題が起きました。もう一度お試しください。"
};

const statusTones: Record<CallSurfaceStatus, string> = {
  idle: "#64748b",
  starting: "#b45309",
  connecting: "#2563eb",
  live: "#15803d",
  ended: "#475569",
  error: "#dc2626"
};

const micLabels: Record<MicState, { title: string; text: string; icon: string; background: string; color: string }> = {
  idle: {
    title: "マイクは待機中です",
    text: "通話を始めるとブラウザのマイク許可を確認します。",
    icon: "mic_off",
    background: "#fff8ed",
    color: "#6b3d0c"
  },
  requesting: {
    title: "マイク許可を確認しています",
    text: "ブラウザの確認ダイアログでマイクを許可してください。",
    icon: "settings_voice",
    background: "#eff6ff",
    color: "#1d4ed8"
  },
  streaming: {
    title: "マイク音声を送信中です",
    text: "声はPCM16としてADK Live WebSocketへ送られています。",
    icon: "mic",
    background: "#ecfdf5",
    color: "#047857"
  },
  blocked: {
    title: "マイクが使えません",
    text: "権限またはブラウザ設定を確認してください。テキスト確認は使えます。",
    icon: "mic_off",
    background: "#fff1f2",
    color: "#be123c"
  },
  stopped: {
    title: "マイクは停止しました",
    text: "もう一度通話を始めると再接続します。",
    icon: "mic_off",
    background: "#f8fafc",
    color: "#475569"
  }
};

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

export function CallSurface({ elderId, adkBaseUrl, onSnapshot, onClose }: CallSurfaceProps) {
  const smokeInputId = useId();
  const activeRunRef = useRef(0);
  const eventCounterRef = useRef(0);
  const clientRef = useRef<AdkVoiceClient | null>(null);
  const micStreamerRef = useRef<MicrophoneStreamer | null>(null);
  const audioPlayerRef = useRef<PcmAudioPlayer | null>(null);
  const [status, setStatus] = useState<CallSurfaceStatus>("idle");
  const [micState, setMicState] = useState<MicState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<LiveSessionBootstrapResponse | null>(null);
  const [eventSummaries, setEventSummaries] = useState<AdkEventSummary[]>([]);
  const [smokeText, setSmokeText] = useState(defaultSmokeText);
  const [isSendingText, setIsSendingText] = useState(false);

  const statusTone = statusTones[status];
  const micLabel = micLabels[micState];
  const profileName = bootstrap?.snapshot.profile.displayName;
  const openingLine = bootstrap?.agentOpening.textJa;
  const requiredAudioMimeType = bootstrap?.requiredAudioMimeType ?? "audio/pcm;rate=16000";

  const canStart = status === "idle" || status === "ended" || status === "error";
  const canEnd = status === "starting" || status === "connecting" || status === "live";
  const canSendText = status === "live" && smokeText.trim().length > 0 && !isSendingText;

  const startButtonStyle = useMemo(
    () => ({
      ...styles.primaryButton,
      ...(canStart ? null : styles.disabledButton)
    }),
    [canStart]
  );

  const endButtonStyle = useMemo(
    () => ({
      ...styles.secondaryButton,
      ...(canEnd ? null : styles.disabledButton)
    }),
    [canEnd]
  );

  const sendButtonStyle = useMemo(
    () => ({
      ...styles.sendButton,
      ...(canSendText ? null : styles.disabledButton)
    }),
    [canSendText]
  );

  useEffect(() => {
    activeRunRef.current += 1;
    closeCurrentClient("silent");
    setStatus("idle");
    setMicState("idle");
    setError(null);
    setBootstrap(null);
    setEventSummaries([]);
    setSmokeText(defaultSmokeText);
  }, [adkBaseUrl, elderId]);

  useEffect(() => {
    return () => {
      activeRunRef.current += 1;
      closeCurrentClient("silent");
    };
  }, []);

  function appendEventSummary(summary: string) {
    eventCounterRef.current += 1;
    const nextSummary = {
      id: `${Date.now()}-${eventCounterRef.current}`,
      at: new Date().toISOString(),
      summary
    };
    setEventSummaries((prev) => [...prev, nextSummary].slice(-eventLimit));
  }

  function stopAudio(nextState: MicState | "silent" = "stopped") {
    const currentStreamer = micStreamerRef.current;
    const currentPlayer = audioPlayerRef.current;

    micStreamerRef.current = null;
    audioPlayerRef.current = null;
    currentStreamer?.stop();
    currentPlayer?.stop();

    if (nextState !== "silent") {
      setMicState(nextState);
    }
  }

  function closeCurrentClient(nextMicState: MicState | "silent" = "stopped") {
    const currentClient = clientRef.current;
    clientRef.current = null;
    stopAudio(nextMicState);
    currentClient?.close();
  }

  function isActiveRun(runId: number) {
    return activeRunRef.current === runId;
  }

  async function handleStartCall() {
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    closeCurrentClient("idle");
    setStatus("starting");
    setMicState("idle");
    setError(null);
    setBootstrap(null);
    setEventSummaries([]);

    try {
      const started = await startLiveSession(elderId);
      if (!isActiveRun(runId)) {
        return;
      }

      setBootstrap(started);
      onSnapshot(started.snapshot);
      appendEventSummary(`Live session started. Required audio: ${started.requiredAudioMimeType}.`);
      setStatus("connecting");

      const nextClient = createAdkVoiceClient({
        adkBaseUrl,
        adkWebsocketPath: started.adkWebsocketPath,
        onOpen: () => {
          if (!isActiveRun(runId)) {
            return;
          }
          setStatus("live");
          appendEventSummary("ADK WebSocket connected.");
          void startMicrophoneStream(runId, nextClient);
        },
        onClose: () => {
          if (!isActiveRun(runId)) {
            return;
          }
          setStatus((currentStatus) => (currentStatus === "error" ? currentStatus : "ended"));
          stopAudio("stopped");
          appendEventSummary("ADK WebSocket closed.");
        },
        onError: (nextError) => {
          if (!isActiveRun(runId)) {
            return;
          }
          const message = getErrorMessage(nextError, "ADK WebSocket connection failed.");
          setError(message);
          setStatus("error");
          appendEventSummary(`Error: ${message}`);
        },
        onMessage: (message) => {
          if (!isActiveRun(runId)) {
            return;
          }
          const payload = normalizeAdkMessage(message);
          playAdkAudio(payload);
          const nextSnapshot = findDashboardSnapshot(payload);
          if (nextSnapshot) {
            onSnapshot(nextSnapshot);
          }
          appendEventSummary(summarizeAdkEvent(payload));
        }
      });

      if (!isActiveRun(runId)) {
        nextClient.close();
        return;
      }

      clientRef.current = nextClient;
      nextClient.connect();
    } catch (nextError) {
      if (!isActiveRun(runId)) {
        return;
      }
      const message = getErrorMessage(nextError, "Live session failed to start.");
      setError(message);
      setStatus("error");
      appendEventSummary(`Error: ${message}`);
    }
  }

  function handleEndCall() {
    activeRunRef.current += 1;
    closeCurrentClient("stopped");
    setStatus("ended");
    appendEventSummary("Call ended from this surface.");
  }

  function handleCloseSurface() {
    activeRunRef.current += 1;
    closeCurrentClient("silent");
    onClose?.();
  }

  async function handleSmokeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = smokeText.trim();
    if (!text) {
      return;
    }

    const client = clientRef.current;
    if (!client || status !== "live") {
      setError("ADK WebSocket is not live yet.");
      setStatus("error");
      return;
    }

    setIsSendingText(true);
    setError(null);

    try {
      await sendTextToClient(client, text);
      appendEventSummary(`Sent Japanese text: ${clip(text, 72)}`);
      setSmokeText("");
    } catch (nextError) {
      const message = getErrorMessage(nextError, "Failed to send text to ADK.");
      setError(message);
      setStatus("error");
      appendEventSummary(`Error: ${message}`);
    } finally {
      setIsSendingText(false);
    }
  }

  async function startMicrophoneStream(runId: number, client: AdkVoiceClient) {
    setMicState("requesting");

    try {
      const streamer = await startPcm16MicrophoneStream((chunk) => {
        if (!isActiveRun(runId) || clientRef.current !== client || client.readyState !== WebSocket.OPEN) {
          return;
        }

        client.sendAudioChunk(chunk);
      });

      if (!isActiveRun(runId) || clientRef.current !== client) {
        streamer.stop();
        return;
      }

      micStreamerRef.current = streamer;
      setMicState("streaming");
      appendEventSummary("Microphone streaming PCM16 audio to ADK.");
    } catch (nextError) {
      if (!isActiveRun(runId)) {
        return;
      }

      const message = getErrorMessage(nextError, "Microphone access failed.");
      setMicState("blocked");
      setError(message);
      appendEventSummary(`Microphone unavailable: ${message}`);
    }
  }

  function playAdkAudio(payload: unknown) {
    const audioPackets = collectInlineAudioData(payload);
    if (audioPackets.length === 0) {
      return;
    }

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = createPcmAudioPlayer();
    }

    for (const packet of audioPackets) {
      audioPlayerRef.current.playBase64Pcm(packet);
    }
  }

  return (
    <section style={styles.shell} aria-label="Elder voice call surface">
      <div style={styles.surface}>
        <header style={styles.header}>
          <div style={styles.headerText}>
            <p style={styles.eyebrow}>CareVoice</p>
            <h1 style={styles.title}>お電話の時間です</h1>
          </div>
          <div style={{ ...styles.statusPill, borderColor: statusTone, color: statusTone }} aria-live="polite">
            <span style={{ ...styles.statusDot, background: statusTone }} />
            <span>{statusLabels[status]}</span>
            <span style={styles.statusCode}>{status}</span>
          </div>
          {onClose ? (
            <button type="button" style={styles.iconButton} onClick={handleCloseSurface} aria-label="Close call surface">
              <Icon name="close" />
            </button>
          ) : null}
        </header>

        <main style={styles.callStage}>
          <div style={styles.avatar} aria-hidden="true">
            CV
          </div>
          <div style={styles.callCopy}>
            <p style={styles.kicker}>{profileName ? `${profileName}さん` : "日本語の見守り通話"}</p>
            <p style={styles.openingLine} lang="ja">
              {openingLine ?? "開始すると、CareVoice がゆっくり日本語でお声がけします。"}
            </p>
            <p style={styles.helperText}>{statusHelpText[status]}</p>
          </div>
        </main>

        {error ? (
          <p style={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        <div style={styles.controlRow}>
          <button type="button" style={startButtonStyle} onClick={() => void handleStartCall()} disabled={!canStart}>
            <Icon name="call" />
            <span>通話をはじめる</span>
          </button>
          <button type="button" style={endButtonStyle} onClick={handleEndCall} disabled={!canEnd}>
            <Icon name="call_end" />
            <span>通話を終了</span>
          </button>
        </div>

        <section style={styles.micPanel} aria-label="Microphone status">
          <div
            style={{ ...styles.micIcon, background: micLabel.background, color: micLabel.color }}
            aria-hidden="true"
          >
            <Icon name={micLabel.icon} />
          </div>
          <div style={styles.micCopy}>
            <strong style={{ ...styles.micTitle, color: micLabel.color }}>{micLabel.title}</strong>
            <span style={styles.micText}>{micLabel.text}</span>
          </div>
          <code style={styles.mimeCode}>{requiredAudioMimeType}</code>
        </section>

        <form style={styles.smokePanel} onSubmit={(event) => void handleSmokeSubmit(event)}>
          <div style={styles.sectionHead}>
            <div>
              <h2 style={styles.sectionTitle}>テキスト確認</h2>
              <p style={styles.sectionSubcopy}>Backup WebSocket smoke test only</p>
            </div>
            <button type="submit" style={sendButtonStyle} disabled={!canSendText}>
              <Icon name="send" />
              <span>{isSendingText ? "送信中" : "送信"}</span>
            </button>
          </div>

          <label htmlFor={smokeInputId} style={styles.inputLabel}>
            日本語のテキスト
          </label>
          <textarea
            id={smokeInputId}
            value={smokeText}
            onChange={(event) => setSmokeText(event.currentTarget.value)}
            placeholder="例: 今日は少しふらつきます。"
            rows={3}
            style={styles.textarea}
          />
        </form>

        <section style={styles.eventsPanel} aria-label="Recent ADK events">
          <div style={styles.sectionHead}>
            <div>
              <h2 style={styles.sectionTitle}>最近のADKイベント</h2>
              <p style={styles.sectionSubcopy}>
                {bootstrap ? `Session ${bootstrap.session.sessionId}` : "接続後に表示されます"}
              </p>
            </div>
          </div>

          {eventSummaries.length === 0 ? (
            <p style={styles.emptyState}>まだイベントはありません。</p>
          ) : (
            <ol style={styles.eventList}>
              {eventSummaries.map((event) => (
                <li key={event.id} style={styles.eventItem}>
                  <time style={styles.eventTime}>{timeFormatter.format(new Date(event.at))}</time>
                  <span style={styles.eventText}>{event.summary}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}

export default CallSurface;

function Icon({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined" style={styles.materialIcon} aria-hidden="true">
      {name}
    </span>
  );
}

async function sendTextToClient(client: AdkVoiceClient, text: string) {
  client.sendText(text);
}

function normalizeAdkMessage(message: AdkVoiceMessage): unknown {
  if (message.json !== null) {
    return message.json;
  }

  if (message.text !== null) {
    return parseWireData(message.text);
  }

  return parseWireData(message.rawData);
}

function parseWireData(data: unknown): unknown {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      return data;
    }
  }

  if (data instanceof ArrayBuffer) {
    return { type: "binary", byteLength: data.byteLength };
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return { type: "binary", byteLength: data.size };
  }

  return data;
}

function summarizeAdkEvent(payload: unknown): string {
  if (typeof payload === "string") {
    return clip(payload, 140);
  }

  if (!isRecord(payload)) {
    return "ADK event received.";
  }

  if (payload.type === "binary" && typeof payload.byteLength === "number") {
    return `Received binary payload (${payload.byteLength} bytes).`;
  }

  const errorText = findStringForKeys(payload, new Set(["error", "message"]), 2);
  if (errorText && ("error" in payload || payload.type === "error")) {
    return `ADK error: ${clip(errorText, 120)}`;
  }

  const functionCalls = collectFunctionNames(payload, "functionCall");
  if (functionCalls.length > 0) {
    return `Tool call: ${dedupe(functionCalls).join(", ")}`;
  }

  const functionResponses = collectFunctionNames(payload, "functionResponse");
  if (functionResponses.length > 0) {
    return `Tool response: ${dedupe(functionResponses).join(", ")}`;
  }

  const partTexts = collectPartTexts(payload);
  if (partTexts.length > 0) {
    return `ADK text: ${clip(partTexts.join(" "), 140)}`;
  }

  const transcription = collectTranscriptionTexts(payload);
  if (transcription.length > 0) {
    return `Transcription: ${clip(transcription.join(" "), 140)}`;
  }

  const flags = [
    hasTruthyKey(payload, "turnComplete") ? "turn complete" : null,
    hasTruthyKey(payload, "interrupted") ? "interrupted" : null,
    hasTruthyKey(payload, "partial") ? "partial" : null
  ].filter(Boolean);

  if (flags.length > 0) {
    return `ADK event: ${flags.join(", ")}`;
  }

  const author = typeof payload.author === "string" ? payload.author : "ADK";
  const keys = Object.keys(payload).slice(0, 4).join(", ");
  return `${author} event${keys ? `: ${keys}` : " received"}`;
}

function findDashboardSnapshot(value: unknown, depth = 0, seen = new Set<object>()): DashboardSnapshot | null {
  if (depth > 5 || value === null || typeof value !== "object") {
    return null;
  }

  if (isDashboardSnapshot(value)) {
    return value;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const snapshot = findDashboardSnapshot(item, depth + 1, seen);
      if (snapshot) {
        return snapshot;
      }
    }
    return null;
  }

  for (const item of Object.values(value)) {
    const snapshot = findDashboardSnapshot(item, depth + 1, seen);
    if (snapshot) {
      return snapshot;
    }
  }

  return null;
}

function isDashboardSnapshot(value: unknown): value is DashboardSnapshot {
  return (
    isRecord(value) &&
    isRecord(value.profile) &&
    Array.isArray(value.transcript) &&
    isRecord(value.riskState) &&
    Array.isArray(value.alerts) &&
    typeof value.updatedAt === "string"
  );
}

function collectPartTexts(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPartTexts(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const texts: string[] = [];
  if (Array.isArray(value.parts)) {
    for (const part of value.parts) {
      if (isRecord(part) && typeof part.text === "string") {
        texts.push(part.text);
      }
    }
  }

  for (const item of Object.values(value)) {
    texts.push(...collectPartTexts(item, depth + 1));
  }

  return texts;
}

function collectTranscriptionTexts(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTranscriptionTexts(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const texts: string[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase().includes("transcription")) {
      texts.push(...collectNestedText(item));
    } else {
      texts.push(...collectTranscriptionTexts(item, depth + 1));
    }
  }

  return texts;
}

function collectInlineAudioData(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectInlineAudioData(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const packets: string[] = [];
  const inlineData = value.inlineData ?? value.inline_data;

  if (isRecord(inlineData)) {
    const data = inlineData.data;
    const mimeType = inlineData.mimeType ?? inlineData.mime_type;

    if (
      typeof data === "string" &&
      typeof mimeType === "string" &&
      (mimeType.includes("audio") || mimeType.includes("pcm"))
    ) {
      packets.push(data);
    }
  }

  for (const item of Object.values(value)) {
    packets.push(...collectInlineAudioData(item, depth + 1));
  }

  return packets;
}

function collectNestedText(value: unknown, depth = 0): string[] {
  if (depth > 3 || value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNestedText(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const texts: string[] = [];
  if (typeof value.text === "string") {
    texts.push(value.text);
  }

  for (const item of Object.values(value)) {
    texts.push(...collectNestedText(item, depth + 1));
  }

  return texts;
}

function collectFunctionNames(value: unknown, functionKey: "functionCall" | "functionResponse", depth = 0): string[] {
  if (depth > 5 || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectFunctionNames(item, functionKey, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const names: string[] = [];
  const maybeFunction = value[functionKey];
  if (isRecord(maybeFunction) && typeof maybeFunction.name === "string") {
    names.push(maybeFunction.name);
  }

  for (const item of Object.values(value)) {
    names.push(...collectFunctionNames(item, functionKey, depth + 1));
  }

  return names;
}

function findStringForKeys(value: unknown, keys: Set<string>, depth = 0): string | null {
  if (depth < 0 || value === null || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringForKeys(item, keys, depth - 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const [key, item] of Object.entries(value)) {
    if (keys.has(key) && typeof item === "string") {
      return item;
    }
  }

  for (const item of Object.values(value)) {
    const found = findStringForKeys(item, keys, depth - 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function hasTruthyKey(value: unknown, key: string, depth = 0): boolean {
  if (depth > 5 || value === null || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasTruthyKey(item, key, depth + 1));
  }

  if (!isRecord(value)) {
    return false;
  }

  if (Boolean(value[key])) {
    return true;
  }

  return Object.values(value).some((item) => hasTruthyKey(item, key, depth + 1));
}

function dedupe(items: string[]) {
  return [...new Set(items)];
}

function clip(text: string, maxLength: number) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}...` : trimmed;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: "100%",
    background: "#f6f7f4",
    color: "#172019",
    padding: 24,
    boxSizing: "border-box",
    fontFamily: "Inter, Geist, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
  },
  surface: {
    maxWidth: 920,
    margin: "0 auto",
    display: "grid",
    gap: 18
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap"
  },
  headerText: {
    display: "grid",
    gap: 4
  },
  eyebrow: {
    margin: 0,
    color: "#5f6f52",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.12,
    letterSpacing: 0
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid",
    borderRadius: 8,
    background: "#ffffff",
    padding: "10px 12px",
    fontSize: 15,
    fontWeight: 800
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  statusCode: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: 700
  },
  iconButton: {
    width: 44,
    height: 44,
    border: "1px solid #d8ddd2",
    borderRadius: 8,
    background: "#ffffff",
    color: "#172019",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer"
  },
  callStage: {
    display: "grid",
    gridTemplateColumns: "minmax(96px, 136px) minmax(0, 1fr)",
    gap: 22,
    alignItems: "center",
    background: "#ffffff",
    border: "1px solid #dfe5d8",
    borderRadius: 8,
    padding: 28,
    boxShadow: "0 18px 45px rgba(50, 65, 38, 0.10)"
  },
  avatar: {
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: 8,
    background: "#2f6f4f",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: 0
  },
  callCopy: {
    display: "grid",
    gap: 10,
    minWidth: 0
  },
  kicker: {
    margin: 0,
    color: "#56705c",
    fontSize: 17,
    fontWeight: 800
  },
  openingLine: {
    margin: 0,
    color: "#172019",
    fontSize: 30,
    lineHeight: 1.38,
    fontWeight: 850,
    overflowWrap: "anywhere"
  },
  helperText: {
    margin: 0,
    color: "#52605a",
    fontSize: 16,
    lineHeight: 1.5
  },
  errorBanner: {
    margin: 0,
    border: "1px solid #fecaca",
    borderRadius: 8,
    background: "#fff1f2",
    color: "#991b1b",
    padding: "12px 14px",
    fontSize: 15,
    fontWeight: 700,
    overflowWrap: "anywhere"
  },
  controlRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(160px, 0.6fr)",
    gap: 12
  },
  primaryButton: {
    minHeight: 68,
    border: "1px solid #1f5d42",
    borderRadius: 8,
    background: "#21724e",
    color: "#ffffff",
    fontSize: 22,
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    cursor: "pointer"
  },
  secondaryButton: {
    minHeight: 68,
    border: "1px solid #d4d8d0",
    borderRadius: 8,
    background: "#ffffff",
    color: "#334139",
    fontSize: 18,
    fontWeight: 850,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer"
  },
  disabledButton: {
    opacity: 0.48,
    cursor: "not-allowed"
  },
  micPanel: {
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "center",
    background: "#fff8ed",
    border: "1px solid #f0d9b5",
    borderRadius: 8,
    padding: 14
  },
  micIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    background: "#f4d7a1",
    color: "#6b3d0c",
    display: "grid",
    placeItems: "center"
  },
  micCopy: {
    display: "grid",
    gap: 3,
    minWidth: 0
  },
  micTitle: {
    color: "#3d2b14",
    fontSize: 15,
    lineHeight: 1.35
  },
  micText: {
    color: "#705637",
    fontSize: 14,
    lineHeight: 1.45
  },
  mimeCode: {
    background: "#ffffff",
    border: "1px solid #ead2aa",
    borderRadius: 8,
    color: "#5f421d",
    padding: "7px 9px",
    fontSize: 12,
    overflowWrap: "anywhere"
  },
  smokePanel: {
    display: "grid",
    gap: 12,
    background: "#ffffff",
    border: "1px solid #dfe5d8",
    borderRadius: 8,
    padding: 18
  },
  eventsPanel: {
    display: "grid",
    gap: 12,
    background: "#ffffff",
    border: "1px solid #dfe5d8",
    borderRadius: 8,
    padding: 18
  },
  sectionHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap"
  },
  sectionTitle: {
    margin: 0,
    color: "#172019",
    fontSize: 18,
    lineHeight: 1.3,
    letterSpacing: 0
  },
  sectionSubcopy: {
    margin: "3px 0 0",
    color: "#66736b",
    fontSize: 13,
    lineHeight: 1.35
  },
  sendButton: {
    minHeight: 42,
    border: "1px solid #235f71",
    borderRadius: 8,
    background: "#2f7184",
    color: "#ffffff",
    padding: "0 16px",
    fontSize: 15,
    fontWeight: 850,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    cursor: "pointer"
  },
  inputLabel: {
    color: "#334139",
    fontSize: 14,
    fontWeight: 800
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: 92,
    border: "1px solid #cfd8cc",
    borderRadius: 8,
    padding: 12,
    color: "#172019",
    background: "#fbfcfa",
    fontSize: 18,
    lineHeight: 1.5,
    fontFamily: "inherit",
    outlineColor: "#2f7184"
  },
  emptyState: {
    margin: 0,
    color: "#66736b",
    fontSize: 14
  },
  eventList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gap: 8
  },
  eventItem: {
    display: "grid",
    gridTemplateColumns: "74px minmax(0, 1fr)",
    gap: 10,
    alignItems: "start",
    borderTop: "1px solid #eef2eb",
    paddingTop: 8
  },
  eventTime: {
    color: "#647067",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums"
  },
  eventText: {
    color: "#25322a",
    fontSize: 14,
    lineHeight: 1.45,
    overflowWrap: "anywhere"
  },
  materialIcon: {
    fontSize: 22,
    lineHeight: 1,
    fontVariationSettings: "'FILL' 0, 'wght' 600, 'GRAD' 0, 'opsz' 24"
  }
};
