import { describe, expect, it } from "vitest";
import {
  buildSheet,
  apertureFor,
  defaults,
  diffractionOffsetFor,
  illuminatedDiameterFor,
  referenceDpiFor,
  referenceFeatureFor,
  supportWidthFor,
  pageSize,
  pitchFor,
  slitPolygons,
  validate,
  validatePatterns,
  MAX_PATTERNS,
  warnings,
} from "./pattern";
import { toPdf, toSvg } from "./export";
import { lensPresets, printerMinimumWidth, sigma14Preset } from "./presets";
import type { Settings } from "./pattern";

const area = (points: { x: number; y: number }[]) =>
  Math.abs(
    points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length];
      return sum + p.x * q.y - q.x * p.y;
    }, 0),
  ) / 2;

describe("physical mask geometry", () => {
  it.each(["bahtinov", "carey"] as const)("adds an opaque square around the unchanged %s pattern", (maskType) => {
    for (const fabrication of ["cutout", "film"] as const) {
      const settings = { ...defaults, maskType, fabrication, calibration: false, obstruction: 20 };
      const circle = buildSheet(settings);
      const square = buildSheet({ ...settings, borderShape: "square" });
      const disk = circle.shapes.find((s) => s.type === "circle")!;
      const surround = square.shapes.find((s) => s.type === "rect")!;
      expect(surround).toMatchObject({
        x: disk.x - disk.r,
        w: settings.outerDiameter, h: settings.outerDiameter, fill: "#000000",
      });
      const relativeSlits = (sheet: ReturnType<typeof buildSheet>, cx: number, cy: number) =>
        sheet.shapes.filter((s) => s.type === "polygon").map((s) =>
          s.points.map((p) => [Number((p.x - cx).toFixed(8)), Number((p.y - cy).toFixed(8))]));
      expect(relativeSlits(square, surround.x + surround.w / 2, surround.y + surround.h / 2))
        .toEqual(relativeSlits(circle, disk.x, disk.y));
      expect(square.shapes.find((s) => s.type === "circle"))
        .toMatchObject({ r: 10, fill: "#000000" });
      expect(square.shapes.indexOf(surround)).toBeLessThan(
        square.shapes.findIndex((s) => s.type === "polygon"),
      );
      expect(toSvg(square)).toContain(
        `<rect x="${surround.x}" y="${surround.y}" width="110" height="110" fill="#000000"`,
      );
    }
  });

  it("uses the full grating period, independent of f-stop", () => {
    expect(pitchFor({ ...defaults, focalLength: 900, factor: 180 })).toBe(5);
    expect(
      pitchFor({ ...defaults, focalLength: 900, factor: 180, fStop: 8 }),
    ).toBe(5);
    expect(
      pitchFor({ ...defaults, pitchMode: "manual", manualPitch: 1.25 }),
    ).toBe(1.25);
  });

  it("keeps every slit inside the aperture and outside the three support arms", () => {
    const polygons = slitPolygons(defaults);
    expect(polygons.length).toBeGreaterThan(50);
    const r = defaults.patternDiameter / 2,
      bridge = defaults.bridge / 2;
    for (const points of polygons) {
      for (const p of points)
        expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(r + 1e-8);
      const top = points.every((p) => p.y <= -bridge + 1e-8);
      const left = points.every(
        (p) => p.y >= bridge - 1e-8 && p.x <= -bridge + 1e-8,
      );
      const right = points.every(
        (p) => p.y >= bridge - 1e-8 && p.x >= bridge - 1e-8,
      );
      expect(top || left || right).toBe(true);
    }
    const openArea = polygons.reduce((sum, p) => sum + area(p), 0);
    expect(openArea / (Math.PI * r * r)).toBeGreaterThan(0.45);
    expect(openArea / (Math.PI * r * r)).toBeLessThan(0.51);
  });

  it("preserves the requested slit width and pitch across all three orientations", () => {
    const settings = {
      ...defaults,
      pitchMode: "manual" as const,
      manualPitch: 2,
      openPercent: 40,
    };
    const groups = [0, settings.angle, -settings.angle].map((angle) => ({
      angle,
      centers: [] as number[],
    }));
    for (const points of slitPolygons(settings)) {
      const group = points.every((p) => p.y < 0)
        ? groups[0]
        : points.every((p) => p.x < 0)
          ? groups[1]
          : groups[2];
      const normal = (group.angle * Math.PI) / 180;
      const projections = points.map(
        (p) => -Math.sin(normal) * p.x + Math.cos(normal) * p.y,
      );
      const min = Math.min(...projections),
        max = Math.max(...projections);
      // Interior strips are untruncated by the circle or supports.
      if (Math.abs(max - min - 0.8) < 1e-7) group.centers.push((max + min) / 2);
      expect(max - min).toBeLessThanOrEqual(0.8 + 1e-7);
    }
    for (const group of groups) {
      expect(group.centers.length).toBeGreaterThan(10);
      group.centers.sort((a, b) => a - b);
      for (let i = 1; i < group.centers.length; i++)
        expect(group.centers[i] - group.centers[i - 1]).toBeCloseTo(2, 7);
    }
  });

  it("rejects invalid and excessive geometry before attempting generation", () => {
    for (const override of [
      { focalLength: NaN },
      { fStop: 0 },
      { patternDiameter: -1 },
      { outerDiameter: 99 },
      { borderShape: "triangle" as Settings["borderShape"] },
      { borderShape: "square" as const, outerDiameter: 100 },
      { obstruction: 100 },
      { bridge: 30 },
      { pitchMode: "manual" as const, manualPitch: 0 },
      { pitchMode: "manual" as const, manualPitch: 30 },
      { focalLength: 1, factor: 1000, minimumWidth: 0.001 },
      { minimumWidth: 0 },
      { minimumWidth: NaN },
      { camera: "custom" as const, pixelSize: 0 },
      { camera: "custom" as const, pixelSize: NaN },
      { apertureMode: "manual" as const, opticalAperture: 0 },
      {
        patternDiameter: 1000,
        outerDiameter: 1010,
        paper: "custom" as const,
        pitchMode: "manual" as const,
        manualPitch: 0.05,
      },
    ])
      expect(validate({ ...defaults, ...override }).length).toBeGreaterThan(0);
    expect(() => buildSheet({ ...defaults, fStop: 0 })).toThrow();
  });

  it.each(["circle", "square"] as const)("fits a large %s mask with compact calibration and enlarges only custom paper", (borderShape) => {
    const large = { ...defaults, borderShape, patternDiameter: 180, outerDiameter: 190 };
    expect(validate(large)).toEqual([]);
    expect(validate({ ...large, outerDiameter: 200 }).join(" ")).toContain("do not fit");
    expect(validate({ ...large, calibration: false })).toEqual([]);
    expect(validate({ ...large, paper: "a3" })).toEqual([]);
    expect(validate({ ...large, paper: "custom" })).toEqual([]);
    const custom = { ...large, paper: "custom" as const };
    expect(pageSize(custom)[0]).toBe(210);
    expect(pageSize(custom)[1]).toBeGreaterThan(large.outerDiameter + 2 * large.margin);
    const sheet = buildSheet({ ...large, paper: "custom" });
    if (borderShape === "circle")
      expect(sheet.shapes.find((s) => s.type === "circle")).toMatchObject({ r: 95 });
    else
      expect(sheet.shapes.find((s) => s.type === "rect")).toMatchObject({ x: 10, w: 190, h: 190 });
  });

  it("preserves absolute calibration dimensions and removes targets when disabled", () => {
    const sheet = buildSheet(defaults);
    const lines = sheet.shapes.filter((s) => s.type === "line");
    expect(lines.some((s) => s.x2 - s.x === 50 && s.y === s.y2)).toBe(true);
    expect(lines.some((s) => Math.abs(s.y2 - s.y - 25) < 1e-8 && s.x === s.x2)).toBe(true);
    expect(
      sheet.shapes.some((s) => s.type === "rect" && s.w === 20 && s.h === 20),
    ).toBe(true);
    const noCalibration = buildSheet({ ...defaults, calibration: false });
    expect(noCalibration.shapes.some((s) => s.type === "rect")).toBe(false);
  });

  it("warns when printer resolution cannot reproduce fine features", () => {
    expect(
      warnings({
        ...defaults,
        focalLength: 50,
        patternDiameter: 12.5,
        outerDiameter: 22.5,
        dpi: 300,
      }).join(" "),
    ).toContain("printer dots");
  });
});

describe("Carey mask geometry", () => {
  const carey: Settings = { ...defaults, maskType: "carey", pitchMode: "manual", manualPitch: 2, openPercent: 40 };

  it.each(["cutout", "film"] as const)("preserves four grating orientations, pitch and slit widths for %s", (fabrication) => {
    const settings = { ...carey, fabrication };
    const halfBridge = supportWidthFor(settings) / 2;
    const groups = [
      { x: -1, y: -1, angle: -6, centers: [] as number[] },
      { x: 1, y: -1, angle: 5, centers: [] as number[] },
      { x: -1, y: 1, angle: 6, centers: [] as number[] },
      { x: 1, y: 1, angle: -5, centers: [] as number[] },
    ];
    const polygons = slitPolygons(settings);
    for (const points of polygons) {
      const group = groups.find((g) => points.every((p) =>
        p.x * g.x >= halfBridge - 1e-8 && p.y * g.y >= halfBridge - 1e-8));
      expect(group).toBeDefined();
      for (const p of points)
        expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(settings.patternDiameter / 2 + 1e-8);
      const radians = group!.angle * Math.PI / 180;
      const projections = points.map((p) => -Math.sin(radians) * p.x + Math.cos(radians) * p.y);
      const min = Math.min(...projections), max = Math.max(...projections);
      expect(max - min).toBeLessThanOrEqual(0.8 + 1e-7);
      if (Math.abs(max - min - 0.8) < 1e-7) group!.centers.push((max + min) / 2);
    }
    for (const group of groups) {
      expect(group.centers.length).toBeGreaterThan(10);
      group.centers.sort((a, b) => a - b);
      for (let i = 1; i < group.centers.length; i++)
        expect(group.centers[i] - group.centers[i - 1]).toBeCloseTo(2, 7);
    }
    if (fabrication === "film") {
      expect(polygons.flat().some((p) => Math.abs(p.x) < 1e-9)).toBe(true);
      expect(polygons.flat().some((p) => Math.abs(p.y) < 1e-9)).toBe(true);
      expect(polygons.reduce((sum, p) => sum + area(p), 0)).toBeGreaterThan(
        slitPolygons(carey).reduce((sum, p) => sum + area(p), 0));
    }
  });

  it("validates only the selected mask's angles and rejects degenerate Carey patterns", () => {
    expect(validate({ ...carey, angle: NaN })).toEqual([]);
    expect(validate({ ...defaults, careyLeftAngle: NaN, careyRightAngle: 0 })).toEqual([]);
    for (const override of [
      { careyLeftAngle: NaN }, { careyRightAngle: 0 }, { careyLeftAngle: 91 },
      { careyRightAngle: 12 }, { maskType: "unknown" as Settings["maskType"] },
    ]) {
      expect(validate({ ...carey, ...override }).length).toBeGreaterThan(0);
      expect(() => buildSheet({ ...carey, ...override })).toThrow();
    }
    expect(validate({ ...carey, careyLeftAngle: 10, careyRightAngle: 12 })).toEqual([]);
    expect(slitPolygons({ ...carey, angle: NaN })).toEqual(slitPolygons(carey));
    expect(slitPolygons({ ...carey, careyLeftAngle: 16 })).not.toEqual(slitPolygons(carey));
  });

  it("shares the physical sheet, obstruction and fabrication limits", () => {
    const settings = { ...carey, obstruction: 25 };
    const sheet = buildSheet(settings);
    expect([sheet.width, sheet.height]).toEqual(pageSize(defaults));
    const circles = sheet.shapes.filter((s) => s.type === "circle");
    expect(circles[0].r).toBe(55);
    expect(circles[1].r).toBe(12.5);
    expect(sheet.shapes.filter((s) => s.type === "polygon")).toHaveLength(slitPolygons(settings).length);
    expect(validate({ ...carey, minimumWidth: 1 })).not.toEqual([]);
    expect(validate({ ...carey, outerDiameter: 200 })).not.toEqual([]);
  });
});

describe("optical inputs and fabrication constraints", () => {
  it.each(lensPresets)("preserves measured mask dimensions and printer limits for $label", (preset) => {
    const settings = {
      ...defaults,
      patternDiameter: 85,
      outerDiameter: 105,
      dpi: 300,
      minimumWidth: 0.3,
      ...preset.settings,
    };
    expect(settings.patternDiameter).toBe(85);
    expect(settings.outerDiameter).toBe(105);
    expect(settings.dpi).toBe(300);
    expect(settings.minimumWidth).toBe(0.3);
    expect(apertureFor(settings)).toBeCloseTo(preset.settings.focalLength / preset.settings.fStop);
    expect(validate(settings)).toEqual([]);
  });

  it("quantifies the 14 mm fabrication tradeoff and respects real printer capabilities", () => {
    const settings = { ...defaults, ...sigma14Preset, camera: "canon-6d" as const };
    expect(referenceFeatureFor(settings)).toBeCloseTo(0.0388889);
    expect(referenceDpiFor(settings)).toBe(1960);
    expect(pitchFor(settings)).toBeCloseTo(0.254);
    expect(diffractionOffsetFor(settings)).toBeCloseTo(4.62826);
    expect(warnings(settings).join(" ")).toContain("5-pixel advisory");
    const fine = { ...settings, dpi: 2400, minimumWidth: printerMinimumWidth(2400) };
    expect(validate(fine)).toEqual([]);
    expect(pitchFor(fine)).toBeCloseTo(14 / 180);
    expect(diffractionOffsetFor(fine)).toBeCloseTo(15.1145);
    expect(warnings(fine).join(" ")).not.toContain("Pitch increased");
    expect(warnings(fine).join(" ")).toContain("Short-focal-length lens");
    expect(referenceDpiFor({ ...fine, openPercent: 25 })).toBe(3919);
  });

  it("removes support ribs only for film, regardless of the inactive saved support width", () => {
    const film = { ...defaults, fabrication: "film" as const, bridge: NaN };
    expect(validate(film)).toEqual([]);
    expect(supportWidthFor(film)).toBe(0);
    const polygons = slitPolygons(film);
    expect(polygons.flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(polygons.some((points) => points.some((p) => Math.abs(p.y) < 1e-9))).toBe(true);
    expect(polygons.reduce((sum, points) => sum + area(points), 0)).toBeGreaterThan(
      slitPolygons(defaults).reduce((sum, points) => sum + area(points), 0),
    );
    expect(validate({ ...film, fabrication: "cutout" }).length).toBeGreaterThan(0);
    expect(buildSheet(film).shapes.filter((shape) => shape.type === "polygon")).toHaveLength(polygons.length);
    expect(warnings({ ...defaults, ...sigma14Preset, fabrication: "cutout" }).join(" ")).toContain("Support ribs exceed");
    expect(warnings({ ...defaults, ...sigma14Preset }).join(" ")).not.toContain("Support ribs exceed");
  });

  it("adds the actual fine grating in both calibration axes", () => {
    const settings = { ...defaults, ...sigma14Preset, dpi: 2400, minimumWidth: printerMinimumWidth(2400) };
    const width = pitchFor(settings) / 2;
    const patches = buildSheet(settings).shapes.filter((s) => s.type === "rect");
    expect(patches.some((s) => Math.abs(s.w - width) < 1e-9 && s.h === 3)).toBe(true);
    expect(patches.some((s) => s.w === 3 && Math.abs(s.h - width) < 1e-9)).toBe(true);
  });

  it("raises automatic pitch enough for both slits and bars at unequal open fractions", () => {
    for (const openPercent of [10, 30, 50, 70, 90]) {
      const settings = { ...defaults, focalLength: 50, minimumWidth: 0.5, openPercent };
      const pitch = pitchFor(settings);
      expect(pitch * openPercent / 100).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(pitch * (100 - openPercent) / 100).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(validate(settings)).toEqual([]);
      expect(warnings(settings).join(" ")).toContain("Pitch increased");
    }
  });

  it("rejects undersized manual features without changing the requested pitch", () => {
    const settings = { ...defaults, pitchMode: "manual" as const, manualPitch: 1, minimumWidth: 0.4, openPercent: 30 };
    expect(pitchFor(settings)).toBe(1);
    expect(validate(settings).join(" ")).toContain("minimum width");
    expect(validate({ ...settings, manualPitch: 0.4 / 0.3 })).toEqual([]);
    expect(() => buildSheet(settings)).toThrow();
  });

  it("rejects fabrication constraints that leave too few periods for a mask", () => {
    expect(validate({ ...defaults, minimumWidth: 20 }).join(" ")).toContain("Pitch is too large");
  });

  it("derives printer minimums in millimetres without rounding below three dots", () => {
    expect(printerMinimumWidth(300)).toBe(0.254);
    expect(printerMinimumWidth(600)).toBe(0.127);
    expect(printerMinimumWidth(1200)).toBe(0.0635);
    expect(printerMinimumWidth(2400)).toBe(0.0318);
    for (const dpi of [300, 600, 1200, 2400])
      expect(printerMinimumWidth(dpi) * dpi / 25.4).toBeGreaterThanOrEqual(3 - 1e-9);
  });

  it("uses telescope aperture without requiring an f-number and limits the illuminated diameter", () => {
    const settings = { ...defaults, apertureMode: "manual" as const, opticalAperture: 20, fStop: NaN };
    expect(validate(settings)).toEqual([]);
    expect(apertureFor(settings)).toBe(20);
    expect(illuminatedDiameterFor(settings)).toBe(20);
    expect(warnings(settings).join(" ")).toContain("fewer than ten periods");
    expect(illuminatedDiameterFor({ ...settings, opticalAperture: 120 })).toBe(100);
    expect(warnings({ ...settings, opticalAperture: 120 }).join(" ")).toContain("may stop down");
    expect(apertureFor({ ...defaults, opticalAperture: NaN })).toBe(100);
    expect(validate({ ...defaults, opticalAperture: NaN, pixelSize: NaN })).toEqual([]);
  });

  it("predicts sensor offset using actual constrained pitch and micrometre pixel size", () => {
    const settings = { ...defaults, camera: "custom" as const, pixelSize: 4 };
    expect(diffractionOffsetFor(defaults)).toBeNull();
    expect(diffractionOffsetFor(settings)).toBeCloseTo(24.75);
    expect(diffractionOffsetFor({ ...settings, pixelSize: 8 })).toBeCloseTo(12.375);
    expect(diffractionOffsetFor({ ...settings, minimumWidth: 2 })).toBeCloseTo(13.75);
    expect(diffractionOffsetFor({ ...settings, pitchMode: "manual", manualPitch: 2 })).toBeCloseTo(27.5);
    expect(diffractionOffsetFor({ ...settings, camera: "canon-6d", pixelSize: 6.55 })).toBeCloseTo(15.1145);
    expect(pitchFor(settings)).toBe(pitchFor(defaults));
  });
});

describe("vector exports", () => {
  it.each(["bahtinov", "carey"] as const)("exports physical SVG units and identical %s shape coordinates", (maskType) => {
    const settings = { ...defaults, maskType };
    const sheet = buildSheet(settings),
      svg = toSvg(sheet);
    expect(svg).toContain('width="210mm" height="297mm" viewBox="0 0 210 297"');
    expect(svg).toContain('r="55"');
    expect(svg.match(/<polygon /g)?.length).toBe(slitPolygons(settings).length);
    expect(svg).not.toContain("<image");
  });

  it.each(["bahtinov", "carey"] as const)("exports %s PDF with exact paper dimensions and no embedded raster mask", async (maskType) => {
    for (const paper of ["a4", "letter", "custom"] as const) {
      for (const borderShape of ["circle", "square"] as const) {
        const sheet = buildSheet({ ...defaults, paper, maskType, borderShape });
        const blob = await toPdf(sheet),
          content = await blob.text();
        expect(content.startsWith("%PDF-")).toBe(true);
        const box = content.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
        expect(box).not.toBeNull();
        expect((Number(box![1]) * 25.4) / 72).toBeCloseTo(sheet.width, 5);
        expect((Number(box![2]) * 25.4) / 72).toBeCloseTo(sheet.height, 5);
        expect(content).toContain("/PrintScaling /None");
        expect(content).not.toContain("/Subtype /Image");
      }
    }
  });
});


describe("multiple patterns on a physical sheet", () => {
  const first: Settings = { ...defaults, calibration: false, patternDiameter: 65, outerDiameter: 75 };
  const second: Settings = { ...first, maskType: "carey", focalLength: 600, borderShape: "square", patternDiameter: 80, outerDiameter: 90, obstruction: 15 };

  it("packs independent masks without overlap, resizing or changing their slits", () => {
    const patterns = [first, second, { ...first, outerDiameter: 80 }];
    const sheet = buildSheet(patterns);
    expect(sheet.patternCount).toBe(3);
    const circles = sheet.shapes.filter((s) => s.type === "circle").filter((s) => s.r > 20);
    const square = sheet.shapes.find((s) => s.type === "rect")!;
    const boxes = [
      ...circles.map((s) => ({ x: s.x - s.r, y: s.y - s.r, size: 2 * s.r })),
      { x: square.x, y: square.y, size: square.w },
    ];
    expect(boxes.map((b) => b.size).sort()).toEqual([75, 80, 90]);
    for (const [index, box] of boxes.entries()) {
      expect(box.x).toBeGreaterThanOrEqual(first.margin);
      expect(box.x + box.size).toBeLessThanOrEqual(sheet.width - first.margin);
      for (const other of boxes.slice(index + 1))
        expect(box.x + box.size <= other.x || other.x + other.size <= box.x ||
          box.y + box.size <= other.y || other.y + other.size <= box.y).toBe(true);
    }
    expect(sheet.shapes.filter((s) => s.type === "polygon")).toHaveLength(
      patterns.reduce((sum, pattern) => sum + slitPolygons(pattern).length, 0));
    const squareSlits = sheet.shapes.filter((s) => s.type === "polygon").filter((s) =>
      s.points.every((p) => p.x >= square.x && p.x <= square.x + square.w && p.y >= square.y && p.y <= square.y + square.h));
    expect(squareSlits).toHaveLength(slitPolygons(second).length);
    const expected = slitPolygons(second).flat();
    squareSlits.flatMap((s) => s.points).forEach((p, index) => {
      expect(p.x - square.x - square.w / 2).toBeCloseTo(expected[index].x, 8);
      expect(p.y - square.y - square.h / 2).toBeCloseTo(expected[index].y, 8);
    });
  });

  it("keeps all wrapped footer entries below every mask and within page margins", () => {
    const patterns = [first, second, { ...first, camera: "custom" as const, pixelSize: 3.76 }];
    const sheet = buildSheet(patterns);
    const footer = sheet.shapes.filter((s) => s.type === "text").filter((s) => s.font === "courier");
    expect(footer.filter((s) => /^\d+\. /.test(s.text))).toHaveLength(patterns.length);
    const bottom = Math.max(...sheet.shapes.flatMap((s) =>
      s.type === "circle" ? [s.y + s.r] : s.type === "rect" ? [s.y + s.h] : []));
    for (const line of footer) {
      expect(line.y - line.size).toBeGreaterThan(bottom);
      expect(line.x + line.text.length * line.size * 0.6).toBeLessThanOrEqual(sheet.width - first.margin);
      expect(line.y).toBeLessThan(sheet.height - first.margin);
    }
  });

  it.each(["circle", "square"] as const)("fits two 101 mm patterns with 5 mm borders vertically on A4 (%s)", async (borderShape) => {
    const patterns = [
      { ...defaults, borderShape, patternDiameter: 101, outerDiameter: 111, camera: "custom" as const, pixelSize: 3.76 },
      { ...defaults, borderShape, maskType: "carey" as const, patternDiameter: 101, outerDiameter: 111, focalLength: 600 },
    ];
    expect(validatePatterns(patterns)).toEqual([]);
    const sheet = buildSheet(patterns);
    expect([sheet.width, sheet.height]).toEqual([210, 297]);
    const bounds = sheet.shapes.flatMap((s) =>
      s.type === "circle" && s.r === 55.5 ? [{ x: s.x - s.r, y: s.y - s.r, size: 2 * s.r }] :
      s.type === "rect" && s.w === 111 ? [{ x: s.x, y: s.y, size: s.w }] : []);
    expect(bounds).toHaveLength(2);
    expect(bounds[0].x).toBe(bounds[1].x);
    expect(bounds[0].y).toBe(13);
    expect(bounds[1].y - bounds[0].y).toBe(114);
    const calibrationTop = sheet.shapes.find((s) => s.type === "line")!;
    expect(calibrationTop.y).toBeGreaterThan(bounds[1].y + bounds[1].size);
    const footer = sheet.shapes.filter((s) => s.type === "text").filter((s) => s.font === "courier");
    const calibrationLines = sheet.shapes.filter((s) => s.type === "line").slice(0, -1);
    const calibrationBottom = Math.max(
      ...calibrationLines.flatMap((s) => [s.y, s.y2]),
      ...sheet.shapes.flatMap((s) => s.type === "rect" && s.w !== 111 ? [s.y + s.h] : []),
    );
    for (const text of footer) {
      expect(text.y - text.size).toBeGreaterThan(calibrationBottom);
      expect(text.y).toBeLessThanOrEqual(sheet.height - defaults.margin);
    }
    const content = await (await toPdf(sheet)).text();
    expect(content).toContain("/Count 1");
    expect(content).not.toContain("/Subtype /Image");
  });

  it("rejects overflowing sheets and invalid inactive patterns, and sizes custom paper to fit", () => {
    const patterns = [defaults, { ...defaults, maskType: "carey" as const }, defaults];
    expect(validatePatterns(patterns)).not.toEqual([]);
    expect(() => buildSheet(patterns)).toThrow();
    const custom = patterns.map((s) => ({ ...s, paper: "custom" as const }));
    expect(validatePatterns(custom)).toEqual([]);
    expect(buildSheet(custom).patternCount).toBe(3);
    expect(validatePatterns([first, { ...second, fStop: 0 }])[0]).toMatch(/^Pattern 2:/);
    expect(validatePatterns([])).not.toEqual([]);
    expect(validatePatterns(Array(MAX_PATTERNS + 1).fill(first))).not.toEqual([]);
  });

  it("retains actual-pitch samples for each pattern when calibration is enabled", () => {
    const patterns = [first, { ...second, pitchMode: "manual" as const, manualPitch: 1.5, openPercent: 40 }]
      .map((s) => ({ ...s, paper: "custom" as const, calibration: true }));
    const sheet = buildSheet(patterns);
    const patches = sheet.shapes.filter((s) => s.type === "rect");
    for (const pattern of patterns) {
      const bar = pitchFor(pattern) * (100 - pattern.openPercent) / 100;
      expect(patches.some((s) => Math.abs(s.w - bar) < 1e-8 && s.h === 3)).toBe(true);
      expect(patches.some((s) => Math.abs(s.h - bar) < 1e-8 && s.w === 3)).toBe(true);
    }
  });

  it("exports multiple masks as one vector PDF page at the sheet's physical size", async () => {
    const sheet = buildSheet([first, second]);
    expect(toSvg(sheet).match(/<polygon /g)).toHaveLength(sheet.shapes.filter((s) => s.type === "polygon").length);
    const content = await (await toPdf(sheet)).text();
    expect(content).toContain("/Count 1");
    expect(content).not.toContain("/Subtype /Image");
    const box = content.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!;
    expect(Number(box[1]) * 25.4 / 72).toBeCloseTo(sheet.width, 5);
    expect(Number(box[2]) * 25.4 / 72).toBeCloseTo(sheet.height, 5);
  });
});
