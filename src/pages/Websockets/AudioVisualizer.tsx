export function AudioVisualizer({
  canvasRef,
  height = 120,
  className,
}: {
  canvasRef:  (node: HTMLCanvasElement | null) => void;
  height?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height,
          display: "block",
          borderRadius: 8,
          background: "rgba(148,163,184,0.35)", // slate-ish
        }}
      />
    </div>
  );
}