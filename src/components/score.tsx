import { cn } from "@/lib/utils";

export function scoreColor(score: number) {
  if (score >= 7.5) return "var(--signal-strong)";
  if (score >= 5) return "var(--signal-mid)";
  return "var(--signal-weak)";
}

export function ScoreRing({
  value,
  size = 84,
  label,
}: {
  value: number; // 0-100
  size?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const color = scoreColor(clamped / 10);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`Score ${clamped} out of 100`}
    >
      <div
        className="h-full w-full rounded-full"
        style={{
          background: `conic-gradient(${color} ${clamped * 3.6}deg, var(--color-muted) 0deg)`,
        }}
      />
      <div className="absolute inset-[7px] flex flex-col items-center justify-center rounded-full bg-card">
        <span className="font-display text-2xl leading-none" style={{ color }}>
          {clamped}
        </span>
        {label ? (
          <span className="mt-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ScoreBar({
  score,
  weight,
  className,
}: {
  score: number;
  weight?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(10, score)) * 10;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: scoreColor(score) }}
        />
      </div>
      <span
        className="w-12 shrink-0 text-right font-mono text-sm"
        style={{ color: scoreColor(score) }}
      >
        {score.toFixed(1)}
      </span>
      {typeof weight === "number" ? (
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
          ×{weight}
        </span>
      ) : null}
    </div>
  );
}
