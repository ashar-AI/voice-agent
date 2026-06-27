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

type AdkAudioPacket = {
  data: string;
  sampleRate: number;
};

type MicState = "idle" | "requesting" | "streaming" | "blocked" | "stopped";
type SurfaceLanguage = "ja" | "en";

const eventLimit = 12;
const defaultSmokeTextByLanguage: Record<SurfaceLanguage, string> = {
  ja: "今日は少しふらつきます。",
  en: "I feel a little unsteady today."
};

const languageOptions: Array<{ value: SurfaceLanguage; label: string }> = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "EN" }
];

const surfaceCopy: Record<
  SurfaceLanguage,
  {
    ariaLabel: string;
    brand: string;
    title: string;
    subtitle: string;
    languageLabel: string;
    statusLabel: string;
    profileFallback: string;
    fallbackOpening: string;
    privateCall: string;
    dashboardSync: string;
    voiceReady: string;
    audioMode: string;
    startButton: string;
    endButton: string;
    microphoneLabel: string;
    voiceLabel: string;
    voiceStatus: string;
    voiceText: string;
    debugButton: string;
    hideDebugButton: string;
    fallbackTitle: string;
    fallbackDescription: string;
    fallbackInputLabel: string;
    fallbackPlaceholder: string;
    sendButton: string;
    sendingButton: string;
    eventsTitle: string;
    eventsPending: string;
    eventsEmpty: string;
    closeLabel: string;
    notLiveError: string;
    startEvent: string;
    connectedEvent: string;
    closedEvent: string;
    endedEvent: string;
    micStreamingEvent: string;
    textSentPrefix: string;
  }
> = {
  ja: {
    ariaLabel: "高齢者向け音声通話画面",
    brand: "Kizuna",
    title: "お電話の時間です",
    subtitle: "見守りの会話を、落ち着いた画面で始められます。",
    languageLabel: "表示言語",
    statusLabel: "状態",
    profileFallback: "日本語の見守り通話",
    fallbackOpening: "開始すると、Kizuna がゆっくり日本語でお声がけします。",
    privateCall: "見守り通話",
    dashboardSync: "ダッシュボードへ反映",
    voiceReady: "やさしい音声で開始",
    audioMode: "音声: 日本語",
    startButton: "通話をはじめる",
    endButton: "通話を終了",
    microphoneLabel: "マイク",
    voiceLabel: "音声",
    voiceStatus: "準備できています",
    voiceText: "Kizuna の返答音声をこの画面で再生します。",
    debugButton: "デバッグ入力を表示",
    hideDebugButton: "デバッグ入力を隠す",
    fallbackTitle: "テキストで送る",
    fallbackDescription: "マイクが使えない時の確認用です。入力内容は通話エージェントへ送信されます。",
    fallbackInputLabel: "送信するテキスト",
    fallbackPlaceholder: "例: 今日は少しふらつきます。",
    sendButton: "送信",
    sendingButton: "送信中",
    eventsTitle: "接続アクティビティ",
    eventsPending: "通話を始めると表示されます",
    eventsEmpty: "まだアクティビティはありません。",
    closeLabel: "通話画面を閉じる",
    notLiveError: "音声エージェントにまだ接続されていません。",
    startEvent: "ライブセッションを開始しました。",
    connectedEvent: "音声エージェントに接続しました。",
    closedEvent: "音声接続を終了しました。",
    endedEvent: "この画面から通話を終了しました。",
    micStreamingEvent: "マイク音声を送信しています。",
    textSentPrefix: "テキストを送信"
  },
  en: {
    ariaLabel: "Elder voice call surface",
    brand: "Kizuna",
    title: "Time for your call",
    subtitle: "A calm check-in surface for starting and monitoring the call.",
    languageLabel: "Display language",
    statusLabel: "Status",
    profileFallback: "Welfare check-in",
    fallbackOpening: "When you start, Kizuna will begin with a gentle check-in.",
    privateCall: "Welfare call",
    dashboardSync: "Syncs to dashboard",
    voiceReady: "Gentle voice ready",
    audioMode: "Voice: Japanese",
    startButton: "Start call",
    endButton: "End call",
    microphoneLabel: "Microphone",
    voiceLabel: "Voice",
    voiceStatus: "Ready",
    voiceText: "Kizuna responses play from this screen.",
    debugButton: "Show debug input",
    hideDebugButton: "Hide debug input",
    fallbackTitle: "Send text instead",
    fallbackDescription: "Use this when the microphone is unavailable. The text is sent to the call agent.",
    fallbackInputLabel: "Text to send",
    fallbackPlaceholder: "Example: I feel a little unsteady today.",
    sendButton: "Send",
    sendingButton: "Sending",
    eventsTitle: "Connection activity",
    eventsPending: "Activity appears after the call starts",
    eventsEmpty: "No activity yet.",
    closeLabel: "Close call surface",
    notLiveError: "The voice agent is not connected yet.",
    startEvent: "Live session started.",
    connectedEvent: "Voice agent connected.",
    closedEvent: "Voice connection closed.",
    endedEvent: "Call ended from this surface.",
    micStreamingEvent: "Microphone audio is streaming.",
    textSentPrefix: "Sent text"
  }
};

const statusCopy: Record<SurfaceLanguage, Record<CallSurfaceStatus, { label: string; help: string }>> = {
  ja: {
    idle: {
      label: "待機中",
      help: "大きなボタンを押すと、Kizuna が見守り通話を始めます。"
    },
    starting: {
      label: "準備中",
      help: "通話の準備をしています。少しお待ちください。"
    },
    connecting: {
      label: "接続中",
      help: "音声エージェントに接続しています。"
    },
    live: {
      label: "通話中",
      help: "通話につながっています。声は音声エージェントへ送られます。"
    },
    ended: {
      label: "終了",
      help: "通話は終了しました。必要に応じてもう一度開始できます。"
    },
    error: {
      label: "エラー",
      help: "接続で問題が起きました。もう一度お試しください。"
    }
  },
  en: {
    idle: {
      label: "Idle",
      help: "Press the large button to start the Kizuna check-in."
    },
    starting: {
      label: "Preparing",
      help: "Preparing the call. Please wait a moment."
    },
    connecting: {
      label: "Connecting",
      help: "Connecting to the voice agent."
    },
    live: {
      label: "Live",
      help: "The call is connected. Speech is sent to the voice agent."
    },
    ended: {
      label: "Ended",
      help: "The call has ended. You can start again if needed."
    },
    error: {
      label: "Error",
      help: "Something went wrong with the connection. Please try again."
    }
  }
};

const statusTones: Record<CallSurfaceStatus, string> = {
  idle: "#64748b",
  starting: "#b45309",
  connecting: "#2563eb",
  live: "#15803d",
  ended: "#475569",
  error: "#dc2626"
};

const micLabels: Record<
  SurfaceLanguage,
  Record<MicState, { title: string; text: string; icon: string; background: string; color: string }>
> = {
  ja: {
    idle: {
      title: "待機中",
      text: "通話を始めるとブラウザのマイク許可を確認します。",
      icon: "mic_off",
      background: "#fff8ed",
      color: "#6b3d0c"
    },
    requesting: {
      title: "許可を確認中",
      text: "ブラウザの確認ダイアログでマイクを許可してください。",
      icon: "settings_voice",
      background: "#eff6ff",
      color: "#1d4ed8"
    },
    streaming: {
      title: "送信中",
      text: "マイク音声を安全に通話エージェントへ送っています。",
      icon: "mic",
      background: "#ecfdf5",
      color: "#047857"
    },
    blocked: {
      title: "利用できません",
      text: "権限またはブラウザ設定を確認してください。テキスト送信は使えます。",
      icon: "mic_off",
      background: "#fff1f2",
      color: "#be123c"
    },
    stopped: {
      title: "停止しました",
      text: "もう一度通話を始めると再接続します。",
      icon: "mic_off",
      background: "#f8fafc",
      color: "#475569"
    }
  },
  en: {
    idle: {
      title: "Waiting",
      text: "Starting the call will ask the browser for microphone access.",
      icon: "mic_off",
      background: "#fff8ed",
      color: "#6b3d0c"
    },
    requesting: {
      title: "Requesting access",
      text: "Allow microphone access in the browser prompt.",
      icon: "settings_voice",
      background: "#eff6ff",
      color: "#1d4ed8"
    },
    streaming: {
      title: "Streaming",
      text: "Microphone audio is being sent to the call agent.",
      icon: "mic",
      background: "#ecfdf5",
      color: "#047857"
    },
    blocked: {
      title: "Unavailable",
      text: "Check browser permissions. Text fallback is still available.",
      icon: "mic_off",
      background: "#fff1f2",
      color: "#be123c"
    },
    stopped: {
      title: "Stopped",
      text: "Start the call again to reconnect.",
      icon: "mic_off",
      background: "#f8fafc",
      color: "#475569"
    }
  }
};

export function CallSurface({ elderId, adkBaseUrl, onSnapshot, onClose }: CallSurfaceProps) {
  const smokeInputId = useId();
  const activeRunRef = useRef(0);
  const eventCounterRef = useRef(0);
  const clientRef = useRef<AdkVoiceClient | null>(null);
  const micStreamerRef = useRef<MicrophoneStreamer | null>(null);
  const audioPlayerRef = useRef<PcmAudioPlayer | null>(null);
  const audioSampleRateRef = useRef<number | null>(null);
  const [status, setStatus] = useState<CallSurfaceStatus>("idle");
  const [micState, setMicState] = useState<MicState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<LiveSessionBootstrapResponse | null>(null);
  const [eventSummaries, setEventSummaries] = useState<AdkEventSummary[]>([]);
  const [language, setLanguage] = useState<SurfaceLanguage>("ja");
  const [smokeText, setSmokeText] = useState(defaultSmokeTextByLanguage.ja);
  const [isSendingText, setIsSendingText] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  const copy = surfaceCopy[language];
  const currentStatusCopy = statusCopy[language][status];
  const statusTone = statusTones[status];
  const micLabel = micLabels[language][micState];
  const profileName = bootstrap?.snapshot.profile.displayName;
  const openingLine = language === "en"
    ? bootstrap?.agentOpening.textEn ?? bootstrap?.agentOpening.textJa
    : bootstrap?.agentOpening.textJa;
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }),
    [language]
  );

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
    setSmokeText(defaultSmokeTextByLanguage[language]);
    setIsDebugOpen(false);
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

  function handleLanguageChange(nextLanguage: SurfaceLanguage) {
    const currentDefaultText = defaultSmokeTextByLanguage[language];
    setLanguage(nextLanguage);
    setSmokeText((currentText) => {
      const shouldSwapDefault = currentText.trim().length === 0 || currentText === currentDefaultText;
      return shouldSwapDefault ? defaultSmokeTextByLanguage[nextLanguage] : currentText;
    });
  }

  function stopAudio(nextState: MicState | "silent" = "stopped") {
    const currentStreamer = micStreamerRef.current;
    const currentPlayer = audioPlayerRef.current;

    micStreamerRef.current = null;
    audioPlayerRef.current = null;
    audioSampleRateRef.current = null;
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
      appendEventSummary(copy.startEvent);
      setStatus("connecting");

      const nextClient = createAdkVoiceClient({
        adkBaseUrl,
        adkWebsocketPath: started.adkWebsocketPath,
        onOpen: () => {
          if (!isActiveRun(runId)) {
            return;
          }
          setStatus("live");
          appendEventSummary(copy.connectedEvent);
          void startMicrophoneStream(runId, nextClient);
        },
        onClose: () => {
          if (!isActiveRun(runId)) {
            return;
          }
          setStatus((currentStatus) => (currentStatus === "error" ? currentStatus : "ended"));
          stopAudio("stopped");
          appendEventSummary(copy.closedEvent);
        },
        onError: (nextError) => {
          if (!isActiveRun(runId)) {
            return;
          }
          const message = getErrorMessage(nextError, "Voice connection failed.");
          setError(message);
          setStatus("error");
          appendEventSummary(`Error: ${message}`);
        },
        onMessage: (message) => {
          if (!isActiveRun(runId)) {
            return;
          }
          const payload = normalizeAdkMessage(message);
          const playedPackets = playAdkAudio(payload);
          const nextSnapshot = findDashboardSnapshot(payload);
          if (nextSnapshot) {
            onSnapshot(nextSnapshot);
          }
          if (playedPackets > 0) {
            appendEventSummary(language === "ja" ? "音声の返答を再生しています。" : "Playing the voice response.");
          }
          appendEventSummary(summarizeAdkEvent(payload, language));
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
    appendEventSummary(copy.endedEvent);
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
      setError(copy.notLiveError);
      setStatus("error");
      return;
    }

    setIsSendingText(true);
    setError(null);

    try {
      await sendTextToClient(client, text);
      appendEventSummary(`${copy.textSentPrefix}: ${clip(text, 72)}`);
      setSmokeText("");
    } catch (nextError) {
      const message = getErrorMessage(nextError, "Failed to send text.");
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
      appendEventSummary(copy.micStreamingEvent);
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
    const audioPackets = collectInlineAudioPackets(payload);
    if (audioPackets.length === 0) {
      return 0;
    }

    const sampleRate = audioPackets[0]?.sampleRate ?? 24000;
    if (!audioPlayerRef.current || audioSampleRateRef.current !== sampleRate) {
      audioPlayerRef.current?.stop();
      audioPlayerRef.current = createPcmAudioPlayer(sampleRate);
      audioSampleRateRef.current = sampleRate;
    }

    try {
      for (const packet of audioPackets) {
        audioPlayerRef.current.playBase64Pcm(packet.data);
      }
      return audioPackets.length;
    } catch (nextError) {
      const message = getErrorMessage(nextError, "Voice playback failed.");
      setError(message);
      appendEventSummary(`Audio playback failed: ${message}`);
      return 0;
    }
  }

  return (
    <section style={styles.shell} aria-label={copy.ariaLabel} lang={language}>
      <div style={styles.surface}>
        <header style={styles.header}>
          <div style={styles.headerText}>
            <p style={styles.eyebrow}>{copy.brand}</p>
            <h1 style={styles.title}>{copy.title}</h1>
            <p style={styles.subtitle}>{copy.subtitle}</p>
          </div>
          <div style={styles.headerActions}>
            <div style={styles.languageSwitch} role="group" aria-label={copy.languageLabel}>
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  style={{
                    ...styles.languageButton,
                    ...(language === option.value ? styles.languageButtonActive : null)
                  }}
                  onClick={() => handleLanguageChange(option.value)}
                  aria-pressed={language === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div style={{ ...styles.statusPill, borderColor: statusTone, color: statusTone }} aria-live="polite">
              <span style={{ ...styles.statusDot, background: statusTone }} />
              <span>{currentStatusCopy.label}</span>
            </div>
            {onClose ? (
              <button type="button" style={styles.iconButton} onClick={handleCloseSurface} aria-label={copy.closeLabel}>
                <Icon name="close" />
              </button>
            ) : null}
          </div>
        </header>

        <main style={styles.callStage}>
          <div style={styles.avatarPanel}>
            <div style={styles.avatar} aria-hidden="true">
              K
            </div>
            <span style={styles.voiceReady}>
              <span style={styles.softDot} />
              {copy.voiceReady}
            </span>
          </div>
          <div style={styles.callCopy}>
            <p style={styles.kicker}>
              {profileName ? (language === "ja" ? `${profileName}さん` : profileName) : copy.profileFallback}
            </p>
            <p style={styles.openingLine} lang={language}>
              {openingLine ?? copy.fallbackOpening}
            </p>
            <p style={styles.helperText}>{currentStatusCopy.help}</p>
            <div style={styles.contextPills} aria-label="Call context">
              <span style={styles.contextPill}>{copy.privateCall}</span>
              <span style={styles.contextPill}>{copy.dashboardSync}</span>
              <span style={styles.contextPill}>{copy.audioMode}</span>
            </div>
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
            <span>{copy.startButton}</span>
          </button>
          <button type="button" style={endButtonStyle} onClick={handleEndCall} disabled={!canEnd}>
            <Icon name="call_end" />
            <span>{copy.endButton}</span>
          </button>
        </div>

        <section style={styles.connectionGrid} aria-label="Connection status">
          <div style={styles.statusCard}>
            <div
              style={{ ...styles.micIcon, background: micLabel.background, color: micLabel.color }}
              aria-hidden="true"
            >
              <Icon name={micLabel.icon} />
            </div>
            <div style={styles.micCopy}>
              <span style={styles.cardKicker}>{copy.microphoneLabel}</span>
              <strong style={{ ...styles.micTitle, color: micLabel.color }}>{micLabel.title}</strong>
              <span style={styles.micText}>{micLabel.text}</span>
            </div>
          </div>

          <div style={styles.statusCard}>
            <div style={styles.voiceIcon} aria-hidden="true">
              <Icon name="graphic_eq" />
            </div>
            <div style={styles.micCopy}>
              <span style={styles.cardKicker}>{copy.voiceLabel}</span>
              <strong style={styles.voiceTitle}>{copy.voiceStatus}</strong>
              <span style={styles.micText}>{copy.voiceText}</span>
            </div>
          </div>
        </section>

        <div style={styles.debugRow}>
          <button type="button" style={styles.debugToggle} onClick={() => setIsDebugOpen((isOpen) => !isOpen)}>
            <Icon name="bug_report" />
            <span>{isDebugOpen ? copy.hideDebugButton : copy.debugButton}</span>
          </button>
        </div>

        {isDebugOpen ? (
          <form style={styles.smokePanel} onSubmit={(event) => void handleSmokeSubmit(event)}>
            <div style={styles.sectionHead}>
              <div>
                <h2 style={styles.sectionTitle}>{copy.fallbackTitle}</h2>
                <p style={styles.sectionSubcopy}>{copy.fallbackDescription}</p>
              </div>
              <button type="submit" style={sendButtonStyle} disabled={!canSendText}>
                <Icon name="send" />
                <span>{isSendingText ? copy.sendingButton : copy.sendButton}</span>
              </button>
            </div>

            <label htmlFor={smokeInputId} style={styles.inputLabel}>
              {copy.fallbackInputLabel}
            </label>
            <textarea
              id={smokeInputId}
              value={smokeText}
              onChange={(event) => setSmokeText(event.currentTarget.value)}
              placeholder={copy.fallbackPlaceholder}
              rows={3}
              style={styles.textarea}
            />
          </form>
        ) : null}

        <section style={styles.eventsPanel} aria-label={copy.eventsTitle}>
          <div style={styles.sectionHead}>
            <div>
              <h2 style={styles.sectionTitle}>{copy.eventsTitle}</h2>
              <p style={styles.sectionSubcopy}>
                {bootstrap ? currentStatusCopy.help : copy.eventsPending}
              </p>
            </div>
          </div>

          {eventSummaries.length === 0 ? (
            <p style={styles.emptyState}>{copy.eventsEmpty}</p>
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

function summarizeAdkEvent(payload: unknown, language: SurfaceLanguage): string {
  if (typeof payload === "string") {
    return clip(payload, 140);
  }

  if (!isRecord(payload)) {
    return language === "ja" ? "通話の更新を受信しました。" : "Call update received.";
  }

  if (payload.type === "binary" && typeof payload.byteLength === "number") {
    return language === "ja" ? "音声データを受信しました。" : "Voice data received.";
  }

  const errorText = findStringForKeys(payload, new Set(["error", "message"]), 2);
  if (errorText && ("error" in payload || payload.type === "error")) {
    return language === "ja"
      ? `接続エラー: ${clip(errorText, 120)}`
      : `Connection error: ${clip(errorText, 120)}`;
  }

  const functionCalls = collectFunctionNames(payload, "functionCall");
  if (functionCalls.length > 0) {
    return language === "ja" ? "ケア情報を確認しています。" : "Checking care context.";
  }

  const functionResponses = collectFunctionNames(payload, "functionResponse");
  if (functionResponses.length > 0) {
    return language === "ja" ? "ケア情報を更新しました。" : "Care context updated.";
  }

  const audioPackets = collectInlineAudioPackets(payload);
  if (audioPackets.length > 0) {
    return language === "ja" ? "音声の返答を受信しました。" : "Voice response received.";
  }

  const partTexts = collectPartTexts(payload);
  if (partTexts.length > 0) {
    return language === "ja"
      ? `返答: ${clip(partTexts.join(" "), 140)}`
      : `Response: ${clip(partTexts.join(" "), 140)}`;
  }

  const transcription = collectTranscriptionTexts(payload);
  if (transcription.length > 0) {
    return language === "ja"
      ? `聞き取り: ${clip(transcription.join(" "), 140)}`
      : `Heard: ${clip(transcription.join(" "), 140)}`;
  }

  const flags = [
    hasTruthyKey(payload, "turnComplete") ? "turn complete" : null,
    hasTruthyKey(payload, "interrupted") ? "interrupted" : null,
    hasTruthyKey(payload, "partial") ? "partial" : null
  ].filter(Boolean);

  if (flags.length > 0) {
    return language === "ja" ? "会話の状態を更新しました。" : "Conversation state updated.";
  }

  return language === "ja" ? "通話アクティビティを更新しました。" : "Call activity updated.";
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

function collectInlineAudioPackets(value: unknown, depth = 0): AdkAudioPacket[] {
  if (depth > 6 || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectInlineAudioPackets(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const packets: AdkAudioPacket[] = [];
  const inlineData = value.inlineData ?? value.inline_data;

  if (isRecord(inlineData)) {
    const data = inlineData.data;
    const mimeType = inlineData.mimeType ?? inlineData.mime_type;

    if (
      typeof data === "string" &&
      typeof mimeType === "string" &&
      (mimeType.includes("audio") || mimeType.includes("pcm"))
    ) {
      packets.push({
        data,
        sampleRate: parseAudioSampleRate(mimeType) ?? 24000
      });
    }
  }

  for (const item of Object.values(value)) {
    packets.push(...collectInlineAudioPackets(item, depth + 1));
  }

  return packets;
}

function parseAudioSampleRate(mimeType: string): number | null {
  const match = /rate=(\d+)/i.exec(mimeType);
  if (!match) {
    return null;
  }

  const sampleRate = Number(match[1]);
  return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null;
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
    background:
      "radial-gradient(circle at top left, rgba(242, 126, 74, 0.16), transparent 30%), linear-gradient(180deg, #f9faf6 0%, #eef4ef 100%)",
    color: "#172019",
    padding: "32px 24px",
    boxSizing: "border-box",
    fontFamily: "Inter, Geist, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
  },
  surface: {
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 16
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap"
  },
  headerText: {
    display: "grid",
    gap: 5,
    minWidth: 260
  },
  eyebrow: {
    margin: 0,
    color: "#51745c",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    margin: 0,
    fontSize: 36,
    lineHeight: 1.12,
    letterSpacing: 0
  },
  subtitle: {
    margin: 0,
    color: "#627067",
    fontSize: 15,
    lineHeight: 1.45
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap"
  },
  languageSwitch: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: "1px solid #dbe4d8",
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.76)",
    padding: 4,
    boxShadow: "0 8px 22px rgba(61, 74, 54, 0.08)"
  },
  languageButton: {
    minHeight: 34,
    border: "0",
    borderRadius: 999,
    background: "transparent",
    color: "#59685e",
    padding: "0 13px",
    fontSize: 13,
    fontWeight: 850,
    cursor: "pointer"
  },
  languageButtonActive: {
    background: "#172019",
    color: "#ffffff",
    boxShadow: "0 6px 16px rgba(23, 32, 25, 0.18)"
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid",
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.82)",
    padding: "10px 12px",
    fontSize: 15,
    fontWeight: 800,
    boxShadow: "0 8px 22px rgba(61, 74, 54, 0.08)"
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  iconButton: {
    width: 44,
    height: 44,
    border: "1px solid #d8ddd2",
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.82)",
    color: "#172019",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 8px 22px rgba(61, 74, 54, 0.08)"
  },
  callStage: {
    display: "grid",
    gridTemplateColumns: "minmax(128px, 180px) minmax(0, 1fr)",
    gap: 26,
    alignItems: "center",
    background:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(250, 253, 247, 0.98)), radial-gradient(circle at 78% 10%, rgba(70, 123, 85, 0.18), transparent 34%)",
    border: "1px solid rgba(214, 225, 209, 0.96)",
    borderRadius: 8,
    padding: 30,
    boxShadow: "0 22px 60px rgba(50, 65, 38, 0.13)"
  },
  avatarPanel: {
    display: "grid",
    gap: 12,
    justifyItems: "center"
  },
  avatar: {
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: 8,
    background:
      "linear-gradient(145deg, #2d7453 0%, #1f5e45 70%), radial-gradient(circle at 25% 20%, rgba(255, 255, 255, 0.34), transparent 32%)",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontSize: 44,
    fontWeight: 900,
    letterSpacing: 0,
    boxShadow: "0 18px 34px rgba(31, 94, 69, 0.24)"
  },
  voiceReady: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 30,
    border: "1px solid #d9e5d5",
    borderRadius: 999,
    background: "#ffffff",
    color: "#49604f",
    padding: "0 10px",
    fontSize: 12,
    fontWeight: 850,
    textAlign: "center"
  },
  softDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "#f27e4a",
    boxShadow: "0 0 0 4px rgba(242, 126, 74, 0.16)"
  },
  callCopy: {
    display: "grid",
    gap: 12,
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
    fontSize: 32,
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
  contextPills: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  contextPill: {
    border: "1px solid #dce6d8",
    borderRadius: 999,
    background: "#f7faf5",
    color: "#52605a",
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 800
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
    gridTemplateColumns: "minmax(220px, 1.45fr) minmax(180px, 0.55fr)",
    gap: 12
  },
  primaryButton: {
    minHeight: 70,
    border: "1px solid #1f694a",
    borderRadius: 8,
    background: "linear-gradient(135deg, #247b55 0%, #1d6d4c 100%)",
    color: "#ffffff",
    fontSize: 22,
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    cursor: "pointer",
    boxShadow: "0 16px 34px rgba(31, 105, 74, 0.24)"
  },
  secondaryButton: {
    minHeight: 70,
    border: "1px solid #d4d8d0",
    borderRadius: 8,
    background: "rgba(255, 255, 255, 0.82)",
    color: "#334139",
    fontSize: 18,
    fontWeight: 850,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(61, 74, 54, 0.08)"
  },
  disabledButton: {
    opacity: 0.48,
    cursor: "not-allowed"
  },
  connectionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12
  },
  statusCard: {
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr)",
    gap: 12,
    alignItems: "center",
    background: "rgba(255, 255, 255, 0.86)",
    border: "1px solid #dfe7d9",
    borderRadius: 8,
    padding: 14,
    boxShadow: "0 10px 24px rgba(61, 74, 54, 0.08)"
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
  voiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    background: "#edf5ff",
    color: "#235f71",
    display: "grid",
    placeItems: "center"
  },
  micCopy: {
    display: "grid",
    gap: 3,
    minWidth: 0
  },
  cardKicker: {
    color: "#8a9a90",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  micTitle: {
    color: "#3d2b14",
    fontSize: 15,
    lineHeight: 1.35
  },
  voiceTitle: {
    color: "#235f71",
    fontSize: 15,
    lineHeight: 1.35,
    overflowWrap: "anywhere"
  },
  micText: {
    color: "#705637",
    fontSize: 14,
    lineHeight: 1.45
  },
  smokePanel: {
    display: "grid",
    gap: 12,
    background: "rgba(255, 255, 255, 0.9)",
    border: "1px solid #dfe5d8",
    borderRadius: 8,
    padding: 18,
    boxShadow: "0 10px 24px rgba(61, 74, 54, 0.08)"
  },
  eventsPanel: {
    display: "grid",
    gap: 12,
    background: "rgba(255, 255, 255, 0.84)",
    border: "1px solid #dfe5d8",
    borderRadius: 8,
    padding: 18,
    boxShadow: "0 10px 24px rgba(61, 74, 54, 0.08)"
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
    lineHeight: 1.45,
    maxWidth: 620
  },
  sendButton: {
    minHeight: 42,
    border: "1px solid #2d6678",
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
