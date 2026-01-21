import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseAudioVisualizerOptions = {
  sampleRate: number;
  maxBufferSeconds?: number; // how much history to keep
  targetFps?: number; // canvas draw rate
  waveformColor?: string;
  backgroundColor?: string;
  centerLineColor?: string;
  /**
   * When true, prints verbose debug logs like:
   *   [amp-visualizer] 1 - pushPcm16Base64 called
   */
  debug?: boolean;
};

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pcm16BytesToFloat32(bytes: Uint8Array): Float32Array {
  // assume little-endian PCM16 packed into bytes
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const pcm16 = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const lo = bytes[i * 2]!;
    const hi = bytes[i * 2 + 1]!;
    const v = (hi << 8) | lo;
    pcm16[i] = v > 0x7fff ? v - 0x10000 : v;
  }

  const floats = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) floats[i] = pcm16[i] / 32768;
  return floats;
}

export function useAudioVisualizer(options: UseAudioVisualizerOptions) {
  const {
    sampleRate,
    maxBufferSeconds = 2,
    targetFps = 30,
    waveformColor = "#3b82f6",
    backgroundColor = "rgba(0,0,0,0)",
    centerLineColor = "rgba(148,163,184,0.35)",
    debug = false,
  } = options;

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvas(node);
  }, []);

  // [amp-visualizer] debug logger (keeps noise controllable)
  const log = useCallback(
    (...args: any[]) => {
      if (!debug) return;
      // eslint-disable-next-line no-console
      console.log("[amp-visualizer]", ...args);
    },
    [debug],
  );

  const maxSamples = useMemo(() => {
    const s = Math.max(0.25, maxBufferSeconds) * sampleRate;
    return Math.max(1024, Math.floor(s));
  }, [maxBufferSeconds, sampleRate]);

  const ringRef = useRef<{
    buf: Float32Array;
    writePos: number; // next write index
    filled: number; // number of valid samples (<= maxSamples)
  } | null>(null);

  // HMR/TDZ guard: route cross-callback calls through refs so initialization order can't break.
  const pushFloat32Ref = useRef<((samples: Float32Array<ArrayBufferLike>) => void) | null>(null);

  const clear = useCallback(() => {
    const r = ringRef.current;
    if (!r) return;
    r.buf.fill(0);
    r.writePos = 0;
    r.filled = 0;
  }, []);

  const pushFloat32 = useCallback((samples: Float32Array<ArrayBufferLike>) => {
    // [amp-visualizer] 1 - pushFloat32 called (already-decoded PCM)
    log("1 - pushFloat32 called");

    // [amp-visualizer] 2 - ensure ring buffer exists (and matches current maxSamples)
    if (!ringRef.current || ringRef.current.buf.length !== maxSamples) {
      ringRef.current = {
        buf: new Float32Array(maxSamples),
        writePos: 0,
        filled: 0,
      };
      log("2 - initialized ring buffer", { maxSamples });
    }

    const r = ringRef.current!;
    const N = r.buf.length;

    if (samples.length >= N) {
      // keep only the last N samples
      samples = samples.subarray(samples.length - N);
    }

    // [amp-visualizer] NOTE: normalize backing store to satisfy lib.dom types (ArrayBuffer vs SharedArrayBuffer)
    const f32 = new Float32Array(samples);

    let wp = r.writePos;
    const len = f32.length;

    const firstPart = Math.min(N - wp, len);
    r.buf.set(f32.subarray(0, firstPart), wp);

    const remaining = len - firstPart;
    if (remaining > 0) {
      r.buf.set(f32.subarray(firstPart), 0);
      wp = remaining;
    } else {
      wp = wp + firstPart;
      if (wp === N) wp = 0;
    }

    r.writePos = wp;
    r.filled = Math.min(N, r.filled + len);
  }, [log, maxSamples]);
  pushFloat32Ref.current = pushFloat32;

  const pushPcm16Base64 = useCallback(
    (b64: string) => {
      if (typeof window === "undefined") return;
      log("1 - pushPcm16Base64 called");
      const bytes = base64ToUint8Array(b64);
      if (bytes.byteLength < 2) return;
      const floats = pcm16BytesToFloat32(bytes);
      // [amp-visualizer] 2 - forward decoded floats into ring buffer
      pushFloat32Ref.current?.(floats);
    },
    [log],
  );

  useEffect(() => {
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastT = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);

      const minDt = 1000 / Math.max(1, targetFps);
      if (t - lastT < minDt) return;
      lastT = t;

      const r = ringRef.current;
      if (!r) return;
      const N = Math.max(0, Math.min(r.filled, r.buf.length));
      const W = canvas.width;
      const H = canvas.height;

      // background
      ctx.clearRect(0, 0, W, H);
      if (backgroundColor !== "rgba(0,0,0,0)") {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, W, H);
      }

      // center line
      ctx.strokeStyle = centerLineColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();

      // Changed: Lower threshold from 16 to 1, or draw even with 0 samples to show center line
      if (N < 1) return;

      // oldest sample starts at:
      const startPos = (r.writePos - N + r.buf.length) % r.buf.length;

      const sampleAt = (i: number) => r.buf[(startPos + i) % r.buf.length];

      ctx.strokeStyle = waveformColor;
      ctx.lineWidth = 1;

      // min/max per x pixel (fast + looks good)
      for (let x = 0; x < W; x++) {
        const i0 = Math.floor((x / W) * N);
        const i1 = Math.min(N, Math.floor(((x + 1) / W) * N));

        let mn = 1;
        let mx = -1;

        for (let i = i0; i < i1; i++) {
          const v = sampleAt(i);
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }

        const y0 = (1 - (mx + 1) / 2) * H; // max at top
        const y1 = (1 - (mn + 1) / 2) * H; // min at bottom

        ctx.beginPath();
        ctx.moveTo(x + 0.5, y0);
        ctx.lineTo(x + 0.5, y1);
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvas, backgroundColor, centerLineColor, targetFps, waveformColor]);

  return {
    canvasRef,
    pushPcm16Base64,
    pushFloat32,
    clear,
  };
}