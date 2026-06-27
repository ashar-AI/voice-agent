export type MicrophoneStreamer = {
  stop: () => void;
};

export async function startPcm16MicrophoneStream(
  onChunk: (chunk: ArrayBuffer) => void
): Promise<MicrophoneStreamer> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not available in this browser.");
  }

  const audioContext = new AudioContext({ sampleRate: 16000 });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    onChunk(float32ToPcm16(input));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    stop: () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close();
    }
  };
}

export type PcmAudioPlayer = {
  playBase64Pcm: (base64: string) => void;
  stop: () => void;
};

export function createPcmAudioPlayer(sampleRate = 24000): PcmAudioPlayer {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass({ sampleRate });
  let scheduledAt = audioContext.currentTime;

  return {
    playBase64Pcm: (base64: string) => {
      const pcm = base64ToInt16Array(base64);
      const buffer = audioContext.createBuffer(1, pcm.length, sampleRate);
      const channel = buffer.getChannelData(0);

      for (let index = 0; index < pcm.length; index += 1) {
        channel[index] = (pcm[index] ?? 0) / 32768;
      }

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);

      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      scheduledAt = Math.max(scheduledAt, audioContext.currentTime);
      source.start(scheduledAt);
      scheduledAt += buffer.duration;
    },
    stop: () => {
      void audioContext.close();
    }
  };
}

function float32ToPcm16(input: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return pcm.buffer;
}

function base64ToInt16Array(base64: string): Int16Array {
  const normalized = normalizeBase64(base64);
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Int16Array(bytes.buffer);
}

function normalizeBase64(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  const remainder = base64.length % 4;

  if (remainder === 0) {
    return base64;
  }

  if (remainder === 1) {
    throw new Error("Invalid PCM audio payload.");
  }

  return `${base64}${"=".repeat(4 - remainder)}`;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
