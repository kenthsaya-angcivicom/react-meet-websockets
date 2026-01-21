import { useCallback, useEffect, useRef, useState } from "react";

type RecallWsMsg = any;

function base64ToUint8Array(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Recall is little-endian PCM16 mono
function pcm16BytesToFloat32(bytes: Uint8Array) {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const lo = bytes[i * 2]!;
    const hi = bytes[i * 2 + 1]!;
    let v = (hi << 8) | lo;
    if (v & 0x8000) v = v - 0x10000; // signed
    out[i] = v / 32768;
  }

  return out;
}

function getPcmBase64FromMessage(msg: RecallWsMsg): string | null {
  // supports both shapes you’ve seen:
  // A) simplified: msg.bufferBase64
  // B) wrapped Recall payload: msg.msg.data.data.buffer
  return msg?.bufferBase64 ?? msg?.msg?.data?.data?.buffer ?? null;
}

export function useRecallWebmStreamPlayer(args: {
  wsUrl: string | null;
  sampleRate?: number; // Recall is typically 16kHz
  recorderTimesliceMs?: number;
  onPcmFloat32?: (pcm: Float32Array, meta: { sampleRate: number; msg: RecallWsMsg }) => void;
}) {
  const { wsUrl, sampleRate = 16000, recorderTimesliceMs = 1000, onPcmFloat32 } = args;

  const [isRunning, setIsRunning] = useState(false);
  const [lastWebmUrl, setLastWebmUrl] = useState<string | null>(null);
  const [webmChunkCount, setWebmChunkCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const playAtRef = useRef<number>(0);
  const lastUrlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    setIsRunning(false);

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    } catch {}
    recorderRef.current = null;

    try {
      audioCtxRef.current?.close();
    } catch {}
    audioCtxRef.current = null;

    gainRef.current = null;
    destRef.current = null;

    if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    lastUrlRef.current = null;

    setLastWebmUrl(null);
  }, []);

  // Must be triggered from a user gesture (e.g. button click) in most browsers.
  // Call this FIRST in your "one click" flow, before any awaits (fetch, etc).
  const prepareAudio = useCallback(async () => {
    if (audioCtxRef.current) return;

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    await audioCtx.resume();

    const gain = audioCtx.createGain();
    gain.gain.value = 1.0;

    // Playback + record
    const dest = audioCtx.createMediaStreamDestination();
    gain.connect(audioCtx.destination);
    gain.connect(dest);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 128000 });

    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;

      const url = URL.createObjectURL(e.data);
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;

      setLastWebmUrl(url);
      setWebmChunkCount((n) => n + 1);
    };

    recorder.onerror = (e) => {
      console.error("MediaRecorder error", e);
    };

    recorder.start(recorderTimesliceMs);

    audioCtxRef.current = audioCtx;
    gainRef.current = gain;
    destRef.current = dest;
    recorderRef.current = recorder;
    playAtRef.current = audioCtx.currentTime;
  }, [recorderTimesliceMs]);

  // Connect the websocket after you have a URL (can be after awaits).
  // Requires prepareAudio() to have been called first.
  const connect = useCallback(
    (url: string) => {
      if (!url) throw new Error("connect(url): url is required");

      const audioCtx = audioCtxRef.current;
      const gain = gainRef.current;
      if (!audioCtx || !gain) {
        throw new Error("Call prepareAudio() before connect()");
      }

      // If already connected, stop first
      if (wsRef.current) stop();

      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("Recall stream ws open");
        setIsRunning(true);
      };

      ws.onclose = () => {
        console.log("Recall stream ws closed");
        stop();
      };

      ws.onerror = (e) => {
        console.error("Recall stream ws error", e);
        stop();
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        const b64 = getPcmBase64FromMessage(msg);
        if (!b64) return;

        const bytes = base64ToUint8Array(b64);
        if (bytes.byteLength < 2) return;

        const floats = pcm16BytesToFloat32(bytes);

        onPcmFloat32?.(floats, { sampleRate, msg });

        const buf = audioCtx.createBuffer(1, floats.length, sampleRate);
        buf.copyToChannel(floats, 0);

        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(gain);

        const now = audioCtx.currentTime;
        if (playAtRef.current < now) playAtRef.current = now; // catch up if we fall behind
        src.start(playAtRef.current);
        playAtRef.current += buf.duration;
      };

      wsRef.current = ws;
    },
    [onPcmFloat32, sampleRate, stop],
  );

  // Convenience: old API “start()” still works.
  // If you want one-click seamless: call prepareAudio() first (same click), then call start(urlFromBot).
  const start = useCallback(
    async (overrideWsUrl?: string) => {
      const url = overrideWsUrl ?? wsUrl;
      if (!url) throw new Error("wsUrl is required");

      await prepareAudio();
      connect(url);
    },
    [wsUrl, prepareAudio, connect],
  );

  const clear = useCallback(() => {
    setIsRunning(false);
    setLastWebmUrl(null);
    setWebmChunkCount(0);
  }, []);

  // cleanup on unmount
  useEffect(() => stop, [stop]);

  return {
    // for one-click flows:
    prepareAudio,
    connect,

    // convenient combined call:
    start,

    stop,
    clear,
    isRunning,
    lastWebmUrl,
    webmChunkCount,
  };
}