import type { MoonPhase } from "@/types/calendar";

interface Props {
  phase: MoonPhase;
  size?: number;
  className?: string;
  title?: string;
}

// Simple SVG moon phase icons using clip circles
export function MoonPhaseIcon({ phase, size = 16, className = "", title }: Props) {
  const r = size / 2;
  const cx = r;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-label={title ?? phase}
    >
      {title && <title>{title}</title>}
      <MoonShape phase={phase} size={size} cx={cx} r={r} />
    </svg>
  );
}

function MoonShape({ phase, size, cx, r }: { phase: MoonPhase; size: number; cx: number; r: number }) {
  const fill = "currentColor";
  const bg = "transparent";

  switch (phase) {
    case "new":
      return <circle cx={cx} cy={cx} r={r - 1} fill={fill} />;

    case "full":
      return <circle cx={cx} cy={cx} r={r - 1} fill={bg} stroke={fill} strokeWidth={1} />;

    case "first_quarter":
      // Right half lit — fill the LEFT (shadow) half
      return (
        <>
          <circle cx={cx} cy={cx} r={r - 1} fill={bg} stroke={fill} strokeWidth={1} />
          <path d={`M${cx},${1} A${r - 1},${r - 1} 0 0 0 ${cx},${size - 1}`} fill={fill} />
        </>
      );

    case "last_quarter":
      // Left half lit — fill the RIGHT (shadow) half
      return (
        <>
          <circle cx={cx} cy={cx} r={r - 1} fill={bg} stroke={fill} strokeWidth={1} />
          <path d={`M${cx},${1} A${r - 1},${r - 1} 0 0 1 ${cx},${size - 1}`} fill={fill} />
        </>
      );

    case "waxing_crescent":
      return <WaxingCrescent cx={cx} r={r} fill={fill} />;

    case "waxing_gibbous":
      return <WaxingGibbous cx={cx} r={r} fill={fill} />;

    case "waning_gibbous":
      return <WaningGibbous cx={cx} r={r} fill={fill} />;

    case "waning_crescent":
      return <WaningCrescent cx={cx} r={r} fill={fill} />;

    default:
      return <circle cx={cx} cy={cx} r={r - 1} fill={bg} stroke={fill} strokeWidth={1} />;
  }
}

// Each function fills the SHADOW (unlit) portion so the icon reads correctly
// on a light background: dark = shadow, transparent = lit.

// All four functions fill the SHADOW (unlit) region.
// Outer arc sweep: 0 = left semicircle, 1 = right semicircle.
// Inner ellipse sweep (bottom→top): 0 = bows right, 1 = bows left.
// The shadow is the region enclosed between the outer arc and the inner ellipse.

function WaxingCrescent({ cx, r, fill }: { cx: number; r: number; fill: string }) {
  const ri = r - 1;
  return (
    <>
      <circle cx={cx} cy={cx} r={ri} fill="transparent" stroke={fill} strokeWidth={1} />
      <path d={`M${cx},${cx - ri} A${ri},${ri} 0 0 0 ${cx},${cx + ri} A${ri * 0.5},${ri} 0 0 0 ${cx},${cx - ri}`} fill={fill} />
    </>
  );
}

function WaxingGibbous({ cx, r, fill }: { cx: number; r: number; fill: string }) {
  const ri = r - 1;
  return (
    <>
      <circle cx={cx} cy={cx} r={ri} fill="transparent" stroke={fill} strokeWidth={1} />
      <path d={`M${cx},${cx - ri} A${ri},${ri} 0 0 0 ${cx},${cx + ri} A${ri * 0.5},${ri} 0 0 1 ${cx},${cx - ri}`} fill={fill} />
    </>
  );
}

function WaningGibbous({ cx, r, fill }: { cx: number; r: number; fill: string }) {
  const ri = r - 1;
  return (
    <>
      <circle cx={cx} cy={cx} r={ri} fill="transparent" stroke={fill} strokeWidth={1} />
      <path d={`M${cx},${cx - ri} A${ri},${ri} 0 0 1 ${cx},${cx + ri} A${ri * 0.5},${ri} 0 0 0 ${cx},${cx - ri}`} fill={fill} />
    </>
  );
}

function WaningCrescent({ cx, r, fill }: { cx: number; r: number; fill: string }) {
  const ri = r - 1;
  return (
    <>
      <circle cx={cx} cy={cx} r={ri} fill="transparent" stroke={fill} strokeWidth={1} />
      <path d={`M${cx},${cx - ri} A${ri},${ri} 0 0 1 ${cx},${cx + ri} A${ri * 0.5},${ri} 0 0 1 ${cx},${cx - ri}`} fill={fill} />
    </>
  );
}
