export type AdkVoiceRawMessageData = string | Blob | ArrayBuffer;

export interface AdkVoiceMessage {
  event: MessageEvent;
  rawData: AdkVoiceRawMessageData;
  text: string | null;
  json: unknown | null;
  parseError: Error | null;
}

export interface AdkVoiceClientCallbacks {
  onOpen?: (event: Event, client: AdkVoiceClient) => void;
  onMessage?: (message: AdkVoiceMessage, client: AdkVoiceClient) => void;
  onError?: (event: Event, client: AdkVoiceClient) => void;
  onClose?: (event: CloseEvent, client: AdkVoiceClient) => void;
}

export interface AdkVoiceClientOptions extends AdkVoiceClientCallbacks {
  adkBaseUrl: string;
  adkWebsocketPath: string;
  protocols?: string | string[];
  binaryType?: BinaryType;
}

export function buildAdkWebSocketUrl(adkBaseUrl: string, adkWebsocketPath: string): string {
  const baseUrl = parseAdkBaseUrl(adkBaseUrl);
  const path = adkWebsocketPath.trim();
  if (!path) {
    throw new Error("ADK WebSocket path is required");
  }

  const url = new URL(path, baseUrl);

  // The API returns an HTTP base URL, but browsers need the WebSocket protocol.
  url.protocol = toWebSocketProtocol(url.protocol);

  return url.toString();
}

export function createAdkVoiceClient(options: AdkVoiceClientOptions): AdkVoiceClient {
  return new AdkVoiceClient(options);
}

export class AdkVoiceClient {
  readonly url: string;

  private readonly callbacks: AdkVoiceClientCallbacks;
  private readonly protocols: string | string[] | undefined;
  private readonly binaryType: BinaryType;
  private socket: WebSocket | null = null;

  constructor(options: AdkVoiceClientOptions) {
    this.url = buildAdkWebSocketUrl(options.adkBaseUrl, options.adkWebsocketPath);
    this.callbacks = options;
    this.protocols = options.protocols;
    this.binaryType = options.binaryType ?? "arraybuffer";
  }

  get webSocket(): WebSocket | null {
    return this.socket;
  }

  get readyState(): number | null {
    return this.socket?.readyState ?? null;
  }

  connect(): WebSocket {
    if (this.socket?.readyState === WebSocket.CONNECTING || this.socket?.readyState === WebSocket.OPEN) {
      return this.socket;
    }

    if (this.socket?.readyState === WebSocket.CLOSING) {
      throw new Error("ADK voice WebSocket is still closing");
    }

    const socket =
      this.protocols === undefined ? new WebSocket(this.url) : new WebSocket(this.url, this.protocols);
    socket.binaryType = this.binaryType;
    this.socket = socket;

    socket.addEventListener("open", (event) => {
      this.callbacks.onOpen?.(event, this);
    });

    socket.addEventListener("message", (event) => {
      this.callbacks.onMessage?.(parseAdkVoiceMessage(event), this);
    });

    socket.addEventListener("error", (event) => {
      this.callbacks.onError?.(event, this);
    });

    socket.addEventListener("close", (event) => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.callbacks.onClose?.(event, this);
    });

    return socket;
  }

  sendText(text: string): void {
    this.openSocket.send(JSON.stringify({ type: "text", text }));
  }

  sendAudioChunk(chunk: ArrayBuffer | Blob): void {
    this.openSocket.send(chunk);
  }

  close(code?: number, reason?: string): void {
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
      this.socket = null;
      return;
    }

    this.socket.close(code, reason);
  }

  private get openSocket(): WebSocket {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("ADK voice WebSocket is not open");
    }

    return this.socket;
  }
}

function parseAdkVoiceMessage(event: MessageEvent): AdkVoiceMessage {
  const rawData = event.data as AdkVoiceRawMessageData;

  if (typeof rawData !== "string") {
    return {
      event,
      rawData,
      text: null,
      json: null,
      parseError: null
    };
  }

  try {
    return {
      event,
      rawData,
      text: rawData,
      json: JSON.parse(rawData) as unknown,
      parseError: null
    };
  } catch (error) {
    return {
      event,
      rawData,
      text: rawData,
      json: null,
      parseError: toError(error)
    };
  }
}

function parseAdkBaseUrl(adkBaseUrl: string): URL {
  const trimmed = adkBaseUrl.trim();
  if (!trimmed) {
    throw new Error("ADK base URL is required");
  }

  return new URL(trimmed);
}

function toWebSocketProtocol(protocol: string): "ws:" | "wss:" {
  if (protocol === "http:" || protocol === "ws:") {
    return "ws:";
  }

  if (protocol === "https:" || protocol === "wss:") {
    return "wss:";
  }

  throw new Error(`Unsupported ADK base URL protocol: ${protocol}`);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
