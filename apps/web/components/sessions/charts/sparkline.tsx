interface SparklineProps {
  readonly data: readonly number[];
  readonly color?: string;
  readonly height?: number;
  readonly ariaLabel?: string;
}

/**
 * Minimal inline-SVG polyline sparkline — no axes, no tooltip — suitable for
 * stat cards rendered on the server. Hand-rolled to keep Recharts out of the
 * initial bundle; the above-the-fold stat-card path no longer pulls it in.
 *
 * A single-point input is duplicated so the polyline draws a flat segment
 * instead of nothing, matching the previous Recharts behavior.
 */
export function Sparkline({
  data,
  color = "rgb(143 124 255)",
  height = 36,
  ariaLabel,
}: SparklineProps) {
  if (data.length === 0) {
    return <div aria-hidden className="h-full w-full" style={{ height }} />;
  }

  const values = data.length === 1 ? [data[0], data[0]] : [...data];
  const width = 100; // viewBox units — stretched by preserveAspectRatio="none"
  const padY = 2;
  const innerH = Math.max(1, height - padY * 2);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = padY + innerH - ((v - min) / span) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div role="img" aria-label={ariaLabel ?? "sparkline"} style={{ height }} className="w-full">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
