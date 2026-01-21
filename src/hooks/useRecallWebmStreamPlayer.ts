import { useCallback, useEffect, useRef, useState } from "react";

type RecallWsMsg = any;

function base64ToUint8Array(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pcm16BytesToFloat32(bytes: Uint8Array) {
  const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const floats = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) floats[i] = pcm16[i] / 32768;
  return floats;
}

function getPcmBase64FromMessage(msg: RecallWsMsg): string | null {
  // supports both shapes you’ve seen:
  // A) simplified: msg.bufferBase64
  // B) wrapped Recall payload: msg.msg.data.data.buffer
  return (
    msg?.bufferBase64 ??
    msg?.msg?.data?.data?.buffer ??
    null
  );
}

export function useRecallWebmStreamPlayer(args: {
  wsUrl: string | null;
  // Recall is 16kHz mono PCM16:
  sampleRate?: number;
  // How often to emit WebM chunks:
  recorderTimesliceMs?: number;
}) {
  const { wsUrl, sampleRate = 16000, recorderTimesliceMs = 1000 } = args;

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

  const start = useCallback(async () => {
    if (!wsUrl) throw new Error("wsUrl is required");
    if (isRunning) return;

    // must be called from a user gesture (button click) in most browsers
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    await audioCtx.resume();

    const gain = audioCtx.createGain();
    gain.gain.value = 1.0;

    // This is the key trick:
    // - connect audio to speakers (for playback)
    // - also connect to a MediaStreamDestination (for WebM encoding via MediaRecorder)
    const dest = audioCtx.createMediaStreamDestination();

    gain.connect(audioCtx.destination);
    gain.connect(dest);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 128000 });

    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;

      // Update a rolling URL (for quick manual download / inspection)
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

    const ws = new WebSocket(wsUrl);

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

    audioCtxRef.current = audioCtx;
    gainRef.current = gain;
    destRef.current = dest;
    recorderRef.current = recorder;
    wsRef.current = ws;
    playAtRef.current = audioCtx.currentTime;
  }, [wsUrl, isRunning, stop, sampleRate, recorderTimesliceMs]);

  const clear = useCallback(() => {
    setIsRunning(false);
    setLastWebmUrl(null);
    setWebmChunkCount(0);
  }, []);   

  // cleanup on unmount
  useEffect(() => stop, [stop]);

  return { start, stop, clear, isRunning, lastWebmUrl, webmChunkCount };
}