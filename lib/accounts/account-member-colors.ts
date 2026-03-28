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
  redPink: { kind: "wrap", start: 322, len: 62 },
  yellowOrange: { kind: "linear", a: 24, b: 102 },
  greenTeal: { kind: "linear", a: 98, b: 199 },
  bluePurple: { kind: "linear", a: 200, b: 308 },
};

function classifyHueFamily(hDeg: number, s: number): HueFamily {
  if (s < NEUTRAL_S_MAX) return "neutral";
  if (hDeg >= 322 || hDeg < 22) return "redPink";
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
  /** ~0.2 t ≈ 20–24° on typical bands — visible on small swatches; alternate ± so we use both ends. */
  const stepT = 0.2;
  const k = i;
  const dir = k % 2 === 1 ? 1 : -1;
  const wave = Math.ceil(k / 2);
  const t = clamp(t0 + dir * wave * stepT, 0, 1);
  const hOutDeg = hueFromT(family, t);
  const hNorm = hOutDeg / 360;

  const j = i - 1;
  const l = clamp(
    hsl.l + 0.055 * (j % 4) - 0.03 * Math.floor(j / 4),
    0.22,
    0.88,
  );
  const s = clamp(hsl.s - 0.045 * (j % 3), 0.25, 0.95);
  const out = hslToRgb(hNorm, s, l);
  return rgbToHex(out.r, out.g, out.b);
}

/**
 * Preview swatches for the same hue-family derivation as automatic grouped accounts (indices 0…count-1).
 */
export function listDerivedAccountMemberColors(
  baseHex: string,
  count: number,
): string[] {
  const n = Math.max(1, Math.min(count, 16));
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    result.push(deriveAccountGroupMemberColor(baseHex, i));
  }
  return result;
}
