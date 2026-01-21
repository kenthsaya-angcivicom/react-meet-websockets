import { useEffect, useRef } from 'react';

const CONSTANTS = {
  CANVAS_WIDTH: 400,
  CANVAS_HEIGHT: 100,
  BAR_SPACING: 1,
  MAX_BAR_HEIGHT_MULTIPLIER: 0.8,
  BACKGROUND_COLOR: '#f5f5f5',
  BORDER_COLOR: '#ddd',
  BORDER_WIDTH: 1,
  BORDER_RADIUS: 4,
  MAX_AUDIO_VALUE: 255, // Max value for Uint8Array
} as const;

interface AudioFrequencyVisualizerProps {
  audioData: Uint8Array | null;
  isVisualizing: boolean;
  width?: number;
  height?: number;
  waveformColor?: string;
}

export function AudioFrequencyVisualizer({
  audioData,
  isVisualizing,
  width = CONSTANTS.CANVAS_WIDTH,
  height = CONSTANTS.CANVAS_HEIGHT,
  waveformColor = '#3b82f6', // blue-500
}: AudioFrequencyVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = CONSTANTS.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // If not visualizing or no audio data, show idle state
    if (!isVisualizing || !audioData || audioData.length === 0) {
      ctx.fillStyle = '#999';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Ready...', canvas.width / 2, canvas.height / 2);
      return;
    }

    // Set up drawing parameters
    const barWidth = canvas.width / audioData.length;
    const barSpacing = CONSTANTS.BAR_SPACING;
    const maxBarHeight = canvas.height * CONSTANTS.MAX_BAR_HEIGHT_MULTIPLIER;

    // Draw frequency bars
    ctx.fillStyle = waveformColor;
    for (let i = 0; i < audioData.length; i++) {
      const barHeight = (audioData[i]! / CONSTANTS.MAX_AUDIO_VALUE) * maxBarHeight;
      const x = i * (barWidth + barSpacing);
      const y = canvas.height - barHeight;

      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }, [audioData, isVisualizing, width, height, waveformColor]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width: '100%',
        maxWidth: `${width}px`,
        maxHeight: `${height}px`,
        backgroundColor: CONSTANTS.BACKGROUND_COLOR,
        border: `${CONSTANTS.BORDER_WIDTH}px solid ${CONSTANTS.BORDER_COLOR}`,
        borderRadius: `${CONSTANTS.BORDER_RADIUS}px`,
        display: 'block',
        margin: '0 auto',
      }}
    />
  );
}