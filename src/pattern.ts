export type Paper = "a4" | "letter" | "a3" | "custom";
export interface Settings {
  focalLength: number;
  fStop: number;
  patternDiameter: number;
  outerDiameter: number;
  factor: number;
  pitchMode: "auto" | "manual";
  manualPitch: number;
  openPercent: number;
  angle: number;
  bridge: number;
  obstruction: number;
  paper: Paper;
  margin: number;
  calibration: boolean;
  dpi: number;
}
export const defaults: Settings = {
  focalLength: 400,
  fStop: 4,
  patternDiameter: 100,
  outerDiameter: 110,
  factor: 180,
  pitchMode: "auto",
  manualPitch: 2.222,
  openPercent: 50,
  angle: 20,
  bridge: 1,
  obstruction: 0,
  paper: "a4",
  margin: 10,
  calibration: true,
  dpi: 600,
};
export type Point = { x: number; y: number };
export type Shape =
  | { type: "polygon"; points: Point[]; fill: string }
  | {
      type: "circle";
      x: number;
      y: number;
      r: number;
      fill: string;
      stroke?: string;
      weight?: number;
    }
  | {
      type: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      fill: string;
      stroke?: string;
      weight?: number;
    }
  | {
      type: "line";
      x: number;
      y: number;
      x2: number;
      y2: number;
      weight: number;
    }
  | {
      type: "text";
      x: number;
      y: number;
      size: number;
      text: string;
      bold?: boolean;
    };
export interface Sheet {
  width: number;
  height: number;
  shapes: Shape[];
}
export const fmt = (n: number, digits = 3) =>
  Number(n.toFixed(digits)).toString();
export const pitchFor = (s: Settings) =>
  s.pitchMode === "auto" ? s.focalLength / s.factor : s.manualPitch;
const HEADER = 28;
const FOOTER = 12;
const CALIBRATION = 76;
export function pageSize(s: Settings): [number, number] {
  const sizes = {
    a4: [210, 297],
    letter: [215.9, 279.4],
    a3: [297, 420],
  } as const;
  if (s.paper !== "custom") return [...sizes[s.paper]];
  return [
    Math.max(160 + 2 * s.margin, s.outerDiameter + 2 * s.margin),
    s.outerDiameter +
      2 * s.margin +
      HEADER +
      (s.calibration ? CALIBRATION : FOOTER),
  ];
}
export function validate(s: Settings): string[] {
  const errors: string[] = [];
  const ranges: [keyof Settings, string, number, number][] = [
    ["focalLength", "Focal length", 1, 20000],
    ["fStop", "F-stop", 0.5, 100],
    ["patternDiameter", "Pattern diameter", 5, 1000],
    ["outerDiameter", "Final diameter", 6, 1100],
    ["factor", "Bahtinov factor", 50, 1000],
    ["manualPitch", "Manual pitch", 0.05, 100],
    ["openPercent", "Open fraction", 10, 90],
    ["angle", "Slit angle", 5, 45],
    ["bridge", "Support width", 0.2, 20],
    ["obstruction", "Central obstruction", 0, 990],
    ["margin", "Page margin", 5, 40],
    ["dpi", "Printer resolution", 72, 9600],
  ];
  for (const [key, label, min, max] of ranges) {
    if (key === "manualPitch" && s.pitchMode === "auto") continue;
    if (key === "factor" && s.pitchMode === "manual") continue;
    const value = s[key] as number;
    if (!Number.isFinite(value) || value < min || value > max)
      errors.push(`${label} must be between ${min} and ${max}.`);
  }
  if (!["a4", "a3", "letter", "custom"].includes(s.paper))
    errors.push("Choose a valid paper size.");
  if (!["auto", "manual"].includes(s.pitchMode))
    errors.push("Choose a valid pitch mode.");
  if (errors.length) return errors;
  if (s.outerDiameter <= s.patternDiameter)
    errors.push(
      "Final diameter must be larger than the pattern diameter to leave a border.",
    );
  if (s.obstruction >= s.patternDiameter - 2 * s.bridge)
    errors.push(
      "Central obstruction must leave room for the slits and supports.",
    );
  if (s.bridge >= s.patternDiameter / 4)
    errors.push(
      "Support width must be less than one quarter of the pattern diameter.",
    );
  const pitch = pitchFor(s);
  if (pitch < 0.05)
    errors.push(
      "Pitch is below 0.05 mm. Reduce the factor or use a larger manual pitch.",
    );
  if (pitch > s.patternDiameter / 4)
    errors.push(
      "Pitch is too large for this pattern. Use at least four periods across the diameter.",
    );
  if (s.patternDiameter / pitch > 2000)
    errors.push(
      "More than 2,000 periods across the mask. Increase the pitch or reduce the diameter.",
    );
  const [width, height] = pageSize(s);
  if (width - 2 * s.margin < 160)
    errors.push(
      "Reduce the page margin to leave at least 160 mm for the sheet labels and calibration targets.",
    );
  const maxDiameter = Math.min(
    width - 2 * s.margin,
    height - 2 * s.margin - HEADER - (s.calibration ? CALIBRATION : FOOTER),
  );
  if (s.outerDiameter > maxDiameter + 1e-8)
    errors.push(
      `This sheet fits a final diameter up to ${fmt(maxDiameter, 1)} mm. Choose larger paper, a custom sheet, or turn off calibration. The mask will not be scaled.`,
    );
  return errors;
}
export function warnings(s: Settings): string[] {
  const result: string[] = [];
  const pitch = pitchFor(s);
  const minFeature =
    (pitch * Math.min(s.openPercent, 100 - s.openPercent)) / 100;
  const dots = (minFeature * s.dpi) / 25.4;
  if (dots < 3)
    result.push(
      `The smallest slit/bar is only ${fmt(dots, 1)} printer dots wide at ${s.dpi} DPI. Inspect the fine-line targets; consider a larger pitch or higher resolution.`,
    );
  if (s.patternDiameter < s.focalLength / s.fStop - 0.1)
    result.push(
      "The pattern is smaller than the estimated aperture and may stop down the optics. Confirm the physical clear aperture.",
    );
  if ((s.outerDiameter - s.patternDiameter) / 2 < 1)
    result.push(
      "The border is under 1 mm wide. A cut-out mask may need a stronger rim.",
    );
  if (s.patternDiameter / pitch < 10)
    result.push(
      "There are fewer than ten periods across the pattern; diffraction spikes may be less distinct.",
    );
  return result;
}

// Clip a convex polygon against a half-plane, retaining a*x + b*y <= c.
export function clip(
  points: Point[],
  a: number,
  b: number,
  c: number,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length];
    const dp = a * p.x + b * p.y - c,
      dq = a * q.x + b * q.y - c;
    if (dp <= 0) out.push(p);
    if (dp <= 0 !== dq <= 0) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  return out;
}
export function slitPolygons(s: Settings): Point[][] {
  const r = s.patternDiameter / 2,
    halfBridge = s.bridge / 2;
  // Inscribed circle approximation: maximum radial error < 0.005 mm.
  const segments = Math.max(180, Math.ceil(Math.PI / Math.acos(1 - 0.005 / r)));
  const circle = Array.from({ length: segments }, (_, i) => ({
    x: r * Math.cos((i * 2 * Math.PI) / segments),
    y: r * Math.sin((i * 2 * Math.PI) / segments),
  }));
  const top = clip(circle, 0, 1, -halfBridge);
  const bottom = clip(circle, 0, -1, -halfBridge);
  const regions = [
    { points: top, angle: 0 },
    { points: clip(bottom, 1, 0, -halfBridge), angle: s.angle },
    { points: clip(bottom, -1, 0, -halfBridge), angle: -s.angle },
  ];
  const pitch = pitchFor(s),
    slit = (pitch * s.openPercent) / 100;
  const polygons: Point[][] = [];
  for (const region of regions) {
    const angle = (region.angle * Math.PI) / 180;
    const nx = -Math.sin(angle),
      ny = Math.cos(angle);
    for (let k = -Math.ceil(r / pitch); k <= Math.ceil(r / pitch); k++) {
      const lo = k * pitch - slit / 2,
        hi = lo + slit;
      const polygon = clip(clip(region.points, nx, ny, hi), -nx, -ny, -lo);
      if (polygon.length >= 3) polygons.push(polygon);
    }
  }
  return polygons;
}

export function buildSheet(s: Settings): Sheet {
  const errors = validate(s);
  if (errors.length) throw new Error(errors.join(" "));
  const [width, height] = pageSize(s),
    m = s.margin;
  const pitch = pitchFor(s),
    slit = (pitch * s.openPercent) / 100;
  const shapes: Shape[] = [];
  const text = (
    x: number,
    y: number,
    size: number,
    value: string,
    bold = false,
  ) => shapes.push({ type: "text", x, y, size, text: value, bold });
  const line = (x: number, y: number, x2: number, y2: number, weight = 0.15) =>
    shapes.push({ type: "line", x, y, x2, y2, weight });
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill = "#000000",
    stroke?: string,
  ) => shapes.push({ type: "rect", x, y, w, h, fill, stroke, weight: 0.15 });
  text(m, m + 4, 4, "BAHTINOV / FOCUSING MASK", true);
  text(
    m,
    m + 10,
    2.6,
    `${fmt(s.focalLength)} mm  |  f/${fmt(s.fStop)}  |  Pattern ${fmt(s.patternDiameter)} mm  |  Final ${fmt(s.outerDiameter)} mm`,
  );
  text(
    m,
    m + 15,
    2.6,
    `Pitch ${fmt(pitch)} mm  |  Open ${fmt(slit)} mm  |  Bar ${fmt(pitch - slit)} mm  |  Angle +/-${fmt(s.angle)} deg`,
  );
  text(
    m,
    m + 20,
    2.6,
    `Support ${fmt(s.bridge)} mm  |  Obstruction ${fmt(s.obstruction)} mm  |  Black = opaque / keep; white = open`,
  );
  const bottom = height - m - (s.calibration ? CALIBRATION : FOOTER);
  const cx = width / 2,
    cy = (m + HEADER + bottom) / 2;
  shapes.push({
    type: "circle",
    x: cx,
    y: cy,
    r: s.outerDiameter / 2,
    fill: "#000000",
  });
  for (const points of slitPolygons(s))
    shapes.push({
      type: "polygon",
      points: points.map((p) => ({ x: p.x + cx, y: p.y + cy })),
      fill: "#ffffff",
    });
  if (s.obstruction > 0)
    shapes.push({
      type: "circle",
      x: cx,
      y: cy,
      r: s.obstruction / 2,
      fill: "#000000",
    });
  if (s.calibration) {
    const y = height - m - CALIBRATION + 5;
    line(m, y, width - m, y);
    text(m, y + 6, 3, "PRINT CALIBRATION", true);
    const rx = m + 5,
      ry = y + 13;
    // Two independent 50 mm axes expose non-uniform print scaling.
    line(rx, ry, rx + 50, ry);
    line(rx, ry, rx, ry + 50);
    for (let i = 0; i <= 50; i++) {
      const tick = i % 10 === 0 ? 3 : i % 5 === 0 ? 2 : 1;
      line(rx + i, ry, rx + i, ry + tick);
      line(rx, ry + i, rx + tick, ry + i);
      if (i % 10 === 0) {
        text(rx + i - 1.5, ry + 6, 2, `${i}`);
        if (i > 0) text(rx + 4, ry + i + 0.7, 2, `${i}`);
      }
    }
    text(rx + 18, ry - 2, 2.3, "X: 50 mm");
    text(rx + 12, ry + 48, 2.3, "Y: 50 mm");
    rect(rx + 20, ry + 17, 20, 20, "none", "#000000");
    shapes.push({
      type: "circle",
      x: rx + 30,
      y: ry + 27,
      r: 10,
      fill: "none",
      stroke: "#000000",
      weight: 0.15,
    });
    text(rx + 18, ry + 42, 2.3, "20 x 20 mm");
    const sx = m + 69;
    text(sx, ry, 2.5, "LINE / GAP WIDTH (mm)", true);
    [0.1, 0.2, 0.3, 0.5, 1].forEach((gap, i) => {
      const x = sx + i * 16;
      for (let j = 0; j < 12 / (2 * gap); j++) {
        rect(x + j * gap * 2, ry + 3, gap, 6);
        rect(x, ry + 12 + j * gap * 2, 6, gap);
      }
      text(x, ry + 28, 2.3, fmt(gap));
    });
    text(sx, ry + 34, 2.4, `MASK PITCH: ${fmt(pitch)} mm`);
    // Show actual duty cycle, with no rescaling, in both printer axes.
    const sampleWidth = Math.min(75, width - m - sx);
    for (let pos = 0; pos < sampleWidth; pos += pitch)
      rect(sx + pos, ry + 37, Math.min(pitch - slit, sampleWidth - pos), 5);
    text(sx, ry + 47, 2.3, "Fine lines should remain separate in both axes.");
  }
  text(
    m,
    height - m - 2,
    2.6,
    "Print at 100% / Actual size. Disable Fit to page. Measure the calibration targets before use.",
  );
  return { width, height, shapes };
}
