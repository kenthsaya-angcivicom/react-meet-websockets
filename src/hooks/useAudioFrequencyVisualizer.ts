import { useCallback, useEffect, useRef, useState } from 'react';

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pcm16BytesToFloat32(bytes: Uint8Array): Float32Array {
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

interface UseAudioFrequencyVisualizerOptions {
  sampleRate?: number;
  fftSize?: number; // Must be power of 2, default 256 gives 128 frequency bins
  /**
   * When true, prints verbose debug logs like:
   *   [visualizer] 1 - pushPcm16Base64 called
   */
  debug?: boolean;
}

interface UseAudioFrequencyVisualizerReturn {
  audioData: Uint8Array | null;
  isVisualizing: boolean;
  pushPcm16Base64: (b64: string) => void;
  /**
   * Push already-decoded PCM float samples (mono).
   * This is handy when another part of the app already decoded base64 -> Float32Array.
   */
  pushFloat32: (floats: Float32Array<ArrayBufferLike>) => void;
  start: () => void;
  stop: () => void;
  clear: () => void;
}

export function useAudioFrequencyVisualizer(
  options: UseAudioFrequencyVisualizerOptions = {}
): UseAudioFrequencyVisualizerReturn {
  const { sampleRate = 16000, fftSize = 256, debug = false } = options;

  // [visualizer] debug logger (keeps noise controllable)
  const log = useCallback(
    (...args: any[]) => {
      if (!debug) return;
      // eslint-disable-next-line no-console
      console.log('[visualizer]', ...args);
    },
    [debug]
  );

  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [isVisualizing, setIsVisualizing] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioBufferQueueRef = useRef<AudioBuffer[]>([]);
  const isProcessingRef = useRef(false);
  const isVisualizingRef = useRef(false); // avoids stale state in async queue loop
  // HMR/TDZ guard: route cross-callback calls through refs so initialization order can't break.
  const processAudioQueueRef = useRef<(() => Promise<void>) | null>(null);
  const pushFloat32Ref = useRef<((floats: Float32Array<ArrayBufferLike>) => void) | null>(null);

  // Process audio buffer queue and feed to analyser
  const processAudioQueue = useCallback(async () => {
    // [visualizer] 7 - this is the queue “worker”; it plays buffers (silently) into the analyser
    if (!audioContextRef.current || !analyserRef.current) {
      log('7 - processAudioQueue abort (missing audioContext/analyser)');
      return;
    }
    if (isProcessingRef.current) {
      log('7 - processAudioQueue already running');
      return;
    }

    isProcessingRef.current = true;
    log('8 - processAudioQueue started');

    while (audioBufferQueueRef.current.length > 0 && isVisualizingRef.current) {
      const buffer = audioBufferQueueRef.current.shift();
      if (!buffer) break;

      try {
        // [visualizer] 9 - create a source node from the queued buffer
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        
        // [visualizer] 10 - audio graph must be connected or the analyser may output zeros.
        // We connect: source -> analyser -> silentGain(0) -> destination
        // (silentGain makes it inaudible while keeping the graph “alive”.)
        source.connect(analyserRef.current);
        
        // Store reference
        sourceRef.current = source;

        // [visualizer] 11 - start “silent playback” so analyser has time-domain/frequency data
        source.start();
        log('11 - source started', { durationMs: Math.round(buffer.duration * 1000) });

        // Clean up after buffer duration
        source.onended = () => {
          source.disconnect();
        };

        // [visualizer] 12 - wait for this buffer to “play through” before taking next
        // (prevents overlapping buffers from smearing frequency data)
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, buffer.duration * 1000)));
      } catch (error) {
        console.error('Error processing audio buffer:', error);
      }
    }

    isProcessingRef.current = false;
    log('13 - processAudioQueue finished', { queueLen: audioBufferQueueRef.current.length });
  }, [log]);
  processAudioQueueRef.current = processAudioQueue;

  const pushFloat32 = useCallback(
    (floats: Float32Array<ArrayBufferLike>) => {
      if (typeof window === 'undefined') return;
      log('1 - pushFloat32 called');
      // [visualizer] 2 - if audio context isn’t started, we can’t create AudioBuffers yet
      if (!audioContextRef.current) {
        log('2 - ignored (call start() first to create AudioContext/Analyser)');
        return;
      }

      try {
        // [visualizer] NOTE: TypeScript/lib.dom may type AudioBuffer.copyToChannel as requiring
        // Float32Array backed by ArrayBuffer (not SharedArrayBuffer). Copying into a fresh
        // Float32Array normalizes the backing store and avoids TS type conflicts.
        const f32 = new Float32Array(floats);

        // [visualizer] 3 - wrap float PCM into an AudioBuffer
        const audioBuffer = audioContextRef.current.createBuffer(1, f32.length, sampleRate);
        audioBuffer.copyToChannel(f32, 0);

        // [visualizer] 4 - enqueue buffer; we’ll drain sequentially
        audioBufferQueueRef.current.push(audioBuffer);
        log('4 - queued AudioBuffer', {
          frames: audioBuffer.length,
          durationMs: Math.round(audioBuffer.duration * 1000),
          queueLen: audioBufferQueueRef.current.length,
        });

        // [visualizer] 5 - kick the queue worker if it’s not already running
        if (!isProcessingRef.current) {
          processAudioQueueRef.current?.();
        }
      } catch (error) {
        console.error('Error processing float PCM:', error);
      }
    },
    [sampleRate, log],
  );
  pushFloat32Ref.current = pushFloat32;

  // Process PCM chunk and add to queue
  const pushPcm16Base64 = useCallback(
    (b64: string) => {
      if (typeof window === 'undefined') return;
      log('1 - pushPcm16Base64 called');
      // [visualizer] 2 - if audio context isn’t started, we can’t create AudioBuffers yet
      if (!audioContextRef.current) {
        log('2 - ignored (call start() first to create AudioContext/Analyser)');
        return;
      }

      try {
        // [visualizer] 3 - decode base64 -> bytes -> float32 PCM
        const bytes = base64ToUint8Array(b64);
        if (bytes.byteLength < 2) return;

        const floats = pcm16BytesToFloat32(bytes);
        // [visualizer] 4 - reuse the float pipeline
        pushFloat32Ref.current?.(floats);
      } catch (error) {
        console.error('Error processing PCM chunk:', error);
      }
    },
    [log]
  );

  // Animation loop to get frequency data.
  // NOTE: do NOT depend on React state for the loop condition, otherwise the first call to
  // animate() (before state updates commit) will see stale `isVisualizing=false` and stop.
  // We use `isVisualizingRef.current` instead so this keeps running after `start()`.
  const animate = useCallback(() => {
    if (!analyserRef.current) {
      animationRef.current = null;
      return;
    }

    const analyser = analyserRef.current;
    // [visualizer] 14 - pull frequency bins (0..255) and store in React state for UI rendering
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    setAudioData(new Uint8Array(dataArray));

    if (isVisualizingRef.current) {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      animationRef.current = null;
    }
  }, []);

  // Start visualizer
  const start = useCallback(async () => {
    if (isVisualizing) return;

    try {
      log('start - creating AudioContext + Analyser');
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioContext.resume();

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0.8;

      // [visualizer] IMPORTANT: keep the analyser in a live audio graph
      // Otherwise, some browsers will yield all-zero frequency data.
      //
      // Graph: analyser -> silentGain(0) -> destination
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0; // silent
      analyser.connect(silentGain);
      silentGain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      silentGainRef.current = silentGain;

      setIsVisualizing(true);
      isVisualizingRef.current = true;

      // If a previous RAF loop is still around (HMR / fast re-click), cancel it.
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animate();
      log('start - visualizing = true', { fftSize, bins: analyser.frequencyBinCount });
    } catch (error) {
      console.error('Error starting frequency visualizer:', error);
    }
  }, [fftSize, animate, isVisualizing, log]);

  // Stop visualizer
  const stop = useCallback(() => {
    log('stop - tearing down');
    setIsVisualizing(false);
    isVisualizingRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {}
      sourceRef.current = null;
    }

    if (silentGainRef.current) {
      try {
        silentGainRef.current.disconnect();
      } catch {}
      silentGainRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setAudioData(null);
    audioBufferQueueRef.current = [];
    isProcessingRef.current = false;
  }, []);

  // Clear data
  const clear = useCallback(() => {
    log('clear - dropping buffered audio + last visual data');
    setAudioData(null);
    audioBufferQueueRef.current = [];
  }, [log]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    audioData,
    isVisualizing,
    pushPcm16Base64,
    pushFloat32,
    start,
    stop,
    clear,
  };
}