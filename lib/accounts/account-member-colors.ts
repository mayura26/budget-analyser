import {
  clamp,
  deriveSubcategoryColor,
  hexToRgb,
  hslToRgb,
  rgbToHex,
  rgbToHsl,
} from "@/lib/categories/colors";

/** Low-saturation anchors: keep same-hue stepping (readability on greys). */
const NEUTRAL_S_MAX = 0.12;

type HueFamily =
  | "redPink"
  | "yellowOrange"
  | "greenTeal"
  | "bluePurple"
  | "neutral";

/** Arc endpoints in degrees [0, 360). Non-wrap families use linear interpolation. */
const FAMILY_ARCS: Record<
  Exclude<HueFamily, "neutral">,
  | { kind: "linear"; a: number; b: number }
  | { kind: "wrap"; start: number; len: number }
> = {
  redPink: { kind: "wrap", start: 325, len: 57 },
  yellowOrange: { kind: "linear", a: 28, b: 98 },
  greenTeal: { kind: "linear", a: 102, b: 198 },
  bluePurple: { kind: "linear", a: 205, b: 318 },
};

function classifyHueFamily(hDeg: number, s: number): HueFamily {
  if (s < NEUTRAL_S_MAX) return "neutral";
  if (hDeg >= 325 || hDeg < 22) return "redPink";
  if (hDeg < 100) return "yellowOrange";
  if (hDeg < 200) return "greenTeal";
  return "bluePurple";
}

function anchorTOnArc(
  family: Exclude<HueFamily, "neutral">,
  hDeg: number,
): number {
  const arc = FAMILY_ARCS[family];
  if (arc.kind === "linear") {
    if (hDeg < arc.a || hDeg > arc.b) {
      const dA = Math.min(Math.abs(hDeg - arc.a), 360 - Math.abs(hDeg - arc.a));
      const dB = Math.min(Math.abs(hDeg - arc.b), 360 - Math.abs(hDeg - arc.b));
      return dA <= dB ? 0 : 1;
    }
    return (hDeg - arc.a) / (arc.b - arc.a);
  }
  let dist = 0;
  if (hDeg >= arc.start) dist = hDeg - arc.start;
  else dist = 360 - arc.start + hDeg;
  return clamp(dist / arc.len, 0, 1);
}

function hueFromT(family: Exclude<HueFamily, "neutral">, t: number): number {
  const arc = FAMILY_ARCS[family];
  const tt = clamp(t, 0, 1);
  if (arc.kind === "linear") {
    return arc.a + tt * (arc.b - arc.a);
  }
  let h = arc.start + tt * arc.len;
  if (h >= 360) h -= 360;
  return h;
}

/**
 * Derive a per-account swatch from the group's colour by moving within a related hue band
 * (yellow–orange, green–teal, blue–purple, red–pink). Index 0 matches the group anchor.
 */
export function deriveAccountGroupMemberColor(
  baseHex: string,
  siblingIndex: number,
): string {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return baseHex;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const i = Math.max(0, siblingIndex);

  if (i === 0) return baseHex;

  if (hsl.s < NEUTRAL_S_MAX) {
    return deriveSubcategoryColor(baseHex, i);
  }

  const hDeg = hsl.h * 360;
  const family = classifyHueFamily(hDeg, hsl.s);

  if (family === "neutral") {
    return deriveSubcategoryColor(baseHex, i);
  }

  const t0 = anchorTOnArc(family, hDeg);
  const step = 0.085;
  const t = clamp(t0 + i * step, 0, 1);
  const hOutDeg = hueFromT(family, t);
  const hNorm = hOutDeg / 360;

  const j = i - 1;
  const l = clamp(
    hsl.l + 0.04 * (j % 4) - 0.02 * Math.floor(j / 4),
    0.22,
    0.88,
  );
  const s = clamp(hsl.s - 0.03 * (j % 3), 0.25, 0.95);
  const out = hslToRgb(hNorm, s, l);
  return rgbToHex(out.r, out.g, out.b);
}
