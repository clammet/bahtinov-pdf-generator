import { cameraPresets, printerMinimumWidth } from "./presets";

export type Paper = "a4" | "letter" | "a3" | "custom";
export type MaskType = "bahtinov" | "carey";
export const maskNames: Record<MaskType, string> = { bahtinov: "Bahtinov", carey: "Carey" };
export interface Settings {
  maskType: MaskType;
  focalLength: number;
  fStop: number;
  apertureMode: "estimated" | "manual";
  opticalAperture: number;
  camera: "none" | "custom" | (typeof cameraPresets)[number]["id"];
  pixelSize: number;
  minimumWidth: number;
  fabrication: "cutout" | "film";
  patternDiameter: number;
  borderShape: "circle" | "square";
  // Circle diameter or square side length; retain the key for saved settings.
  outerDiameter: number;
  factor: number;
  pitchMode: "auto" | "manual";
  manualPitch: number;
  openPercent: number;
  angle: number;
  // Full included angles between each side's upper and lower gratings.
  careyLeftAngle: number;
  careyRightAngle: number;
  bridge: number;
  obstruction: number;
  paper: Paper;
  margin: number;
  calibration: boolean;
  dpi: number;
}
export const defaults: Settings = {
  maskType: "bahtinov",
  focalLength: 400,
  fStop: 4,
  apertureMode: "estimated",
  opticalAperture: 100,
  camera: "none",
  pixelSize: 6.55,
  minimumWidth: printerMinimumWidth(600),
  fabrication: "cutout",
  patternDiameter: 100,
  borderShape: "circle",
  outerDiameter: 110,
  factor: 180,
  pitchMode: "auto",
  manualPitch: 2.222,
  openPercent: 50,
  angle: 20,
  careyLeftAngle: 12,
  careyRightAngle: 10,
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
      font?: "courier";
    };
export interface Sheet {
  maskType: MaskType;
  patternCount: number;
  width: number;
  height: number;
  shapes: Shape[];
}
export const fmt = (n: number, digits = 3) =>
  Number(n.toFixed(digits)).toString();
export const pitchFor = (s: Settings) =>
  s.pitchMode === "auto"
    ? Math.max(s.focalLength / s.factor, minimumPitchFor(s))
    : s.manualPitch;
export const minimumPitchFor = (s: Settings) =>
  s.minimumWidth / (Math.min(s.openPercent, 100 - s.openPercent) / 100);
export const apertureFor = (s: Settings) =>
  s.apertureMode === "manual" ? s.opticalAperture : s.focalLength / s.fStop;
export const illuminatedDiameterFor = (s: Settings) =>
  Math.min(s.patternDiameter, apertureFor(s));
export const supportWidthFor = (s: Settings) =>
  s.fabrication === "film" ? 0 : s.bridge;
// A conventional starting point, not an independently optimized optical design.
export const referenceFeatureFor = (s: Settings) =>
  (s.focalLength / s.factor) * Math.min(s.openPercent, 100 - s.openPercent) / 100;
export const referenceDpiFor = (s: Settings) =>
  Math.ceil(3 * 25.4 / referenceFeatureFor(s));
// Advisory UI threshold only; not a physical limit on Bahtinov focusing.
export const isShortLens = (s: Settings) =>
  s.apertureMode === "estimated" && s.focalLength <= 50;
// First diffraction order, normal incidence, small angles, 550 nm light.
// Focal length and pitch are mm; wavelength and camera pixels are micrometres.
export const diffractionOffsetFor = (s: Settings): number | null =>
  s.camera === "none" ? null : (s.focalLength * 0.55) / (pitchFor(s) * s.pixelSize);
const LABEL_SPACE = 3;
const GAP = 3;
const FOOTER_SIZE = 2.1;
const FOOTER_LEADING = 2.4;
export const MAX_PATTERNS = 12;
const calibrationHeight = (patterns: Settings[]) =>
  patterns[0].calibration ? 30 + 8 * (Math.ceil(patterns.length / 2) - 1) : 0;

// Courier has a fixed advance of 0.6 em in both the SVG and standard PDF font.
export function wrapMetadata(value: string, width: number): string[] {
  const limit = Math.max(1, Math.floor(width / (FOOTER_SIZE * 0.6)));
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    if (line && line.length + word.length + 1 > limit) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}
export function patternMetadata(s: Settings, index: number): string {
  const pitch = pitchFor(s), slit = pitch * s.openPercent / 100;
  return [
    `${index + 1}. ${maskNames[s.maskType]}`,
    `Focal ${fmt(s.focalLength)} mm`,
    `${s.apertureMode === "estimated" ? `f/${fmt(s.fStop)}; pupil` : "Aperture"} ${fmt(apertureFor(s))} mm`,
    `Pattern ${fmt(s.patternDiameter)} mm`,
    `${s.borderShape === "square" ? "Square side" : "Circle diameter"} ${fmt(s.outerDiameter)} mm`,
    `Pitch ${fmt(pitch, 4)} mm (${s.pitchMode === "auto" ? `auto; factor ${fmt(s.factor)}` : "manual"})`,
    `Slit/bar ${fmt(slit, 4)}/${fmt(pitch - slit, 4)} mm; ${fmt(s.openPercent)}% open`,
    s.maskType === "carey"
      ? `Included L/R ${fmt(s.careyLeftAngle)}/${fmt(s.careyRightAngle)} deg`
      : `Angle +/-${fmt(s.angle)} deg`,
    s.fabrication === "film" ? "Transparency; no ribs; white = clear film"
      : `Cut-out; support ${fmt(s.bridge)} mm; white = open`,
    `Obstruction ${fmt(s.obstruction)} mm`,
    `Min feature ${fmt(s.minimumWidth, 4)} mm; ${fmt(s.dpi)} DPI`,
    ...(s.camera === "none" ? [] : [`Camera ${s.camera}; pixel ${fmt(s.pixelSize)} um`]),
    "Black = opaque / keep",
  ].join(" | ");
}
const metadataLines = (patterns: Settings[], width: number) =>
  patterns.map((s, i) => wrapMetadata(patternMetadata(s, i), width));
const footerHeight = (patterns: Settings[], width: number) =>
  metadataLines(patterns, width).reduce((sum, lines) => sum + lines.length * FOOTER_LEADING + 0.6, 1.5);

// Place physical bounding squares in rows, largest first, without scaling masks.
function packPatterns(patterns: Settings[], width: number) {
  const placements = patterns.map((s, index) => ({ index, size: s.outerDiameter, x: 0, y: 0 }));
  let x = 0, y = 0, rowHeight = 0;
  for (const item of [...placements].sort((a, b) => b.size - a.size)) {
    if (x > 0 && x + item.size > width + 1e-8) {
      y += rowHeight + GAP;
      x = 0;
      rowHeight = 0;
    }
    item.x = x;
    item.y = y;
    x += item.size + GAP;
    rowHeight = Math.max(rowHeight, item.size);
  }
  for (const rowY of new Set(placements.map((item) => item.y))) {
    const row = placements.filter((item) => item.y === rowY);
    const rowWidth = Math.max(...row.map((item) => item.x + item.size));
    for (const item of row) item.x += (width - rowWidth) / 2;
  }
  return { placements, height: y + rowHeight };
}
export function pageSize(input: Settings | Settings[]): [number, number] {
  const patterns = Array.isArray(input) ? input : [input];
  const s = patterns[0];
  const sizes = { a4: [210, 297], letter: [215.9, 279.4], a3: [297, 420] } as const;
  if (s.paper !== "custom") return [...sizes[s.paper]];
  const usableWidth = Math.max(160, ...patterns.map((p) => p.outerDiameter),
    Math.sqrt(patterns.reduce((sum, p) => sum + p.outerDiameter ** 2, 0)) + GAP * (Math.ceil(Math.sqrt(patterns.length)) - 1));
  const width = Math.ceil(usableWidth + 2 * s.margin);
  return [width, Math.ceil(packPatterns(patterns, width - 2 * s.margin).height +
    2 * s.margin + LABEL_SPACE + calibrationHeight(patterns) + footerHeight(patterns, width - 2 * s.margin))];
}
export function validate(s: Settings, checkPage = true): string[] {
  const errors: string[] = [];
  const ranges: [keyof Settings, string, number, number][] = [
    ["focalLength", "Focal length", 1, 20000],
    ["fStop", "F-number", 0.5, 100],
    ["opticalAperture", "Optical aperture", 1, 1000],
    ["pixelSize", "Camera pixel size", 0.1, 100],
    ["minimumWidth", "Minimum slit/bar width", 0.001, 20],
    ["patternDiameter", "Pattern diameter", 5, 1000],
    ["outerDiameter", s.borderShape === "square" ? "Outside side length" : "Outside diameter", 6, 1100],
    ["factor", "Spacing factor", 50, 1000],
    ["manualPitch", "Manual pitch", 0.05, 100],
    ["openPercent", "Open fraction", 10, 90],
    ["angle", "Slit angle", 5, 45],
    ["careyLeftAngle", "Carey left included angle", 2, 90],
    ["careyRightAngle", "Carey right included angle", 2, 90],
    ["bridge", "Support width", 0.2, 20],
    ["obstruction", "Central obstruction", 0, 990],
    ["margin", "Page margin", 5, 40],
    ["dpi", "Printer resolution", 72, 9600],
  ];
  for (const [key, label, min, max] of ranges) {
    if (key === "angle" && s.maskType === "carey") continue;
    if ((key === "careyLeftAngle" || key === "careyRightAngle") && s.maskType === "bahtinov") continue;
    if (key === "bridge" && s.fabrication === "film") continue;
    if (key === "fStop" && s.apertureMode === "manual") continue;
    if (key === "opticalAperture" && s.apertureMode === "estimated") continue;
    if (key === "pixelSize" && s.camera === "none") continue;
    if (key === "manualPitch" && s.pitchMode === "auto") continue;
    if (key === "factor" && s.pitchMode === "manual") continue;
    const value = s[key] as number;
    if (!Number.isFinite(value) || value < min || value > max)
      errors.push(`${label} must be between ${min} and ${max}.`);
  }
  if (!Object.hasOwn(maskNames, s.maskType))
    errors.push("Choose a valid mask type.");
  if (!["circle", "square"].includes(s.borderShape))
    errors.push("Choose a valid border shape.");
  if (!["a4", "a3", "letter", "custom"].includes(s.paper))
    errors.push("Choose a valid paper size.");
  if (!["auto", "manual"].includes(s.pitchMode))
    errors.push("Choose a valid pitch mode.");
  if (!["estimated", "manual"].includes(s.apertureMode))
    errors.push("Choose a valid optical aperture source.");
  if (!["cutout", "film"].includes(s.fabrication))
    errors.push("Choose a valid fabrication layout.");
  if (
    s.camera !== "none" &&
    s.camera !== "custom" &&
    !cameraPresets.some((preset) => preset.id === s.camera)
  )
    errors.push("Choose a valid camera preset or Custom.");
  if (errors.length) return errors;
  if (s.maskType === "carey" && Math.abs(s.careyLeftAngle - s.careyRightAngle) < 1e-8)
    errors.push("Carey left and right angles must differ to produce two distinct X patterns.");
  if (s.outerDiameter <= s.patternDiameter)
    errors.push(
      `${s.borderShape === "square" ? "Outside side length" : "Outside diameter"} must be larger than the pattern diameter to leave a border.`,
    );
  if (s.obstruction >= s.patternDiameter - 2 * supportWidthFor(s))
    errors.push(
      "Central obstruction must leave room for the slits and supports.",
    );
  if (supportWidthFor(s) >= s.patternDiameter / 4)
    errors.push(
      "Support width must be less than one quarter of the pattern diameter.",
    );
  const pitch = pitchFor(s);
  if (pitch + 1e-9 < minimumPitchFor(s))
    errors.push(
      `Manual pitch makes a slit or bar narrower than the minimum width. Use a pitch of at least ${fmt(Math.ceil(minimumPitchFor(s) * 10000) / 10000, 4)} mm or reduce the minimum width.`,
    );
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
  if (checkPage && !errors.length) errors.push(...validatePage([s]));
  return errors;
}
function validatePage(patterns: Settings[]): string[] {
  const s = patterns[0];
  const [width, height] = pageSize(patterns);
  const usableWidth = width - 2 * s.margin;
  if (usableWidth < 160)
    return ["Reduce the page margin to leave at least 160 mm for the sheet labels and calibration targets."];
  if (width > 5000 || height > 5000)
    return ["This sheet exceeds the 5,000 mm export limit. Use fewer or smaller patterns."];
  const availableHeight = height - 2 * s.margin - LABEL_SPACE - calibrationHeight(patterns) - footerHeight(patterns, usableWidth);
  const packed = packPatterns(patterns, usableWidth);
  if (patterns.some((p) => p.outerDiameter > usableWidth + 1e-8) || packed.height > availableHeight + 1e-8)
    return ["The patterns do not fit on this sheet at actual size, including calibration and footer settings. Choose larger paper, a custom sheet, remove a pattern, or turn off calibration. The masks will not be scaled."];
  return [];
}
export function validatePatterns(patterns: Settings[]): string[] {
  if (!patterns.length || patterns.length > MAX_PATTERNS)
    return [`Use between 1 and ${MAX_PATTERNS} patterns per sheet.`];
  const errors = patterns.flatMap((s, i) =>
    validate({ ...s, paper: patterns[0].paper, margin: patterns[0].margin, calibration: patterns[0].calibration }, false)
      .map((error) => `Pattern ${i + 1}: ${error}`));
  return errors.length ? errors : validatePage(patterns);
}
export function warnings(s: Settings): string[] {
  const result: string[] = [];
  const pitch = pitchFor(s);
  const minFeature =
    (pitch * Math.min(s.openPercent, 100 - s.openPercent)) / 100;
  const dots = (minFeature * s.dpi) / 25.4;
  if (s.pitchMode === "auto" && minimumPitchFor(s) > s.focalLength / s.factor)
    result.push(
      `Pitch increased from ${fmt(s.focalLength / s.factor, 4)} to ${fmt(pitch, 4)} mm to meet the minimum slit/bar width. First-order separation is about ${fmt(100 * (s.focalLength / s.factor) / pitch, 0)}% of the optical starting value. A larger pattern diameter will not restore that separation.`,
    );
  if (isShortLens(s)) {
    result.push(
      `Short-focal-length lens: centre the mask carefully and use a star near the image centre so light samples all ${s.maskType === "carey" ? "four" : "three"} gratings. Inspect a full-resolution exposure. A larger front mask does not enlarge the entrance pupil or guarantee usable spikes. If spikes remain unclear, use magnified live view or a purpose-made fine-pattern focusing aid.`,
    );
    if (s.fabrication === "cutout")
      result.push(
        "Fine slits and bars can be impractical to cut at this focal length. Consider the transparency layout, which omits support ribs; use optically clear film with opaque bars. Verify actual print detail rather than lowering the minimum width just to remove a warning.",
      );
  }
  const offset = diffractionOffsetFor(s);
  if (offset !== null && offset < 5)
    result.push(
      `First-order offset is only ${fmt(offset, 1)} sensor pixels at 550 nm. This triggers a 5-pixel advisory threshold, not a pass/fail optical limit; live-view downsampling may hide the pattern.`,
    );
  if (supportWidthFor(s) > illuminatedDiameterFor(s) * 0.1)
    result.push(
      "Support ribs exceed 10% of the estimated illuminated diameter and may obscure much of a small pupil. Consider a transparency layout; do not weaken a cut-out mask beyond your material's capability.",
    );
  if (dots + 1e-9 < 3)
    result.push(
      `The smallest slit/bar is only ${fmt(dots, 1)} printer dots wide at ${s.dpi} DPI. Inspect the fine-line targets; consider a larger pitch or higher resolution.`,
    );
  if (s.patternDiameter < apertureFor(s) - 0.1)
    result.push(
      "The pattern is smaller than the optical aperture and may stop down the optics. Confirm the physical clear aperture.",
    );
  if (s.fabrication === "cutout" && (s.outerDiameter - s.patternDiameter) / 2 < 1)
    result.push(
      "The border is under 1 mm wide. A cut-out mask may need a stronger rim.",
    );
  if (illuminatedDiameterFor(s) / pitch < 10)
    result.push(
      "There are fewer than ten periods across the illuminated aperture; diffraction spikes may be less distinct.",
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
    halfBridge = supportWidthFor(s) / 2;
  // Inscribed circle approximation: maximum radial error < 0.005 mm.
  const segments = Math.max(180, Math.ceil(Math.PI / Math.acos(1 - 0.005 / r)));
  const circle = Array.from({ length: segments }, (_, i) => ({
    x: r * Math.cos((i * 2 * Math.PI) / segments),
    y: r * Math.sin((i * 2 * Math.PI) / segments),
  }));
  const top = clip(circle, 0, 1, -halfBridge);
  const bottom = clip(circle, 0, -1, -halfBridge);
  const regions = s.maskType === "carey" ? [
    { points: clip(top, 1, 0, -halfBridge), angle: -s.careyLeftAngle / 2 },
    { points: clip(top, -1, 0, -halfBridge), angle: s.careyRightAngle / 2 },
    { points: clip(bottom, 1, 0, -halfBridge), angle: s.careyLeftAngle / 2 },
    { points: clip(bottom, -1, 0, -halfBridge), angle: -s.careyRightAngle / 2 },
  ] : [
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

export function buildSheet(input: Settings | Settings[]): Sheet {
  const patterns = Array.isArray(input) ? input : [input];
  const errors = validatePatterns(patterns);
  if (errors.length) throw new Error(errors.join(" "));
  const s = patterns[0];
  const [width, height] = pageSize(patterns), m = s.margin;
  const footer = footerHeight(patterns, width - 2 * m);
  const calibration = calibrationHeight(patterns);
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
  const bottom = height - m - calibration - footer;
  const packed = packPatterns(patterns, width - 2 * m);
  const top = m + LABEL_SPACE;
  for (const item of packed.placements) {
    const pattern = patterns[item.index];
    const cx = m + item.x + item.size / 2, cy = top + item.y + item.size / 2;

    if (pattern.borderShape === "square")
      rect(cx - item.size / 2, cy - item.size / 2, item.size, item.size);
    else shapes.push({ type: "circle", x: cx, y: cy, r: item.size / 2, fill: "#000000" });
    for (const points of slitPolygons(pattern))
      shapes.push({ type: "polygon", points: points.map((p) => ({ x: p.x + cx, y: p.y + cy })), fill: "#ffffff" });
    if (pattern.obstruction > 0)
      shapes.push({ type: "circle", x: cx, y: cy, r: pattern.obstruction / 2, fill: "#000000" });
    text(cx - item.size / 2, cy - item.size / 2 - 0.6, 1.8, `${item.index + 1}. ${maskNames[pattern.maskType]}`);
  }
  if (s.calibration) {
    const y = bottom;
    line(m, y, width - m, y);
    const rx = m + 1, ry = y + 3;
    // Shorten the Y ruler's extent; all ticks still represent exactly 1 mm.
    line(rx, ry, rx + 50, ry);
    line(rx, ry, rx, ry + 25);
    for (let i = 0; i <= 50; i++) {
      const tick = i % 10 === 0 ? 1.5 : i % 5 === 0 ? 1 : 0.5;
      line(rx + i, ry, rx + i, ry + tick);
      if (i <= 25) line(rx, ry + i, rx + tick, ry + i);
    }
    text(rx, ry - 0.8, 1.8, "0");
    text(rx + 17, ry - 0.8, 1.8, "X: 50 mm");
    text(rx + 48, ry - 0.8, 1.8, "50");
    text(rx + 3, ry + 24, 1.8, "Y: 25 mm");
    rect(rx + 22, ry + 5, 20, 20, "none", "#000000");
    shapes.push({
      type: "circle", x: rx + 32, y: ry + 15, r: 10,
      fill: "none", stroke: "#000000", weight: 0.15,
    });
    text(rx + 22, ry + 4, 1.8, "20 x 20 mm");
    const sx = m + 64;
    text(sx, y + 2.2, 1.8, "LINE / GAP (mm)", true);
    [0.1, 0.2, 0.3, 0.5, 1].forEach((gap, i) => {
      const x = sx + i * 16;
      // Reduce patch footprints, preserving every physical line/gap width.
      for (let pos = 0; pos < 8; pos += 2 * gap) {
        rect(x + pos, y + 4, Math.min(gap, 8 - pos), 4);
        rect(x, y + 10 + pos, 4, Math.min(gap, 8 - pos));
      }
      text(x, y + 20, 1.8, fmt(gap));
    });
    const columnWidth = (width - 2 * m - 64) / 2;
    patterns.forEach((pattern, i) => {
      const pitch = pitchFor(pattern), slit = pitch * pattern.openPercent / 100;
      const sampleY = y + 23 + Math.floor(i / 2) * 8;
      const sampleX = sx + (i % 2) * columnWidth;
      text(sampleX, sampleY, 1.8, `${i + 1}. Pitch ${fmt(pitch, 4)} mm`);
      const sampleWidth = Math.min(32, columnWidth - 10);
      for (let pos = 0; pos < sampleWidth; pos += pitch)
        rect(sampleX + pos, sampleY + 1, Math.min(pitch - slit, sampleWidth - pos), 3);
      for (let pos = 0; pos < 3; pos += pitch)
        rect(sampleX + sampleWidth + 2, sampleY + 1 + pos, 3, Math.min(pitch - slit, 3 - pos));
    });
  }
  let footerY = height - m - footer + 3.1;
  line(m, height - m - footer, width - m, height - m - footer);
  for (const lines of metadataLines(patterns, width - 2 * m)) {
    for (const value of lines) {
      shapes.push({ type: "text", x: m, y: footerY, size: FOOTER_SIZE, text: value, font: "courier" });
      footerY += FOOTER_LEADING;
    }
    footerY += 0.6;
  }
  return { maskType: s.maskType, patternCount: patterns.length, width, height, shapes };
}
