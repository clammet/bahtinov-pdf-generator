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

  it("rejects a mask that cannot fit, and enlarges only custom paper", () => {
    const large = { ...defaults, patternDiameter: 180, outerDiameter: 190 };
    expect(validate(large).join(" ")).toContain("173 mm");
    expect(validate({ ...large, calibration: false })).toEqual([]);
    expect(validate({ ...large, paper: "a3" })).toEqual([]);
    expect(validate({ ...large, paper: "custom" })).toEqual([]);
    expect(pageSize({ ...large, paper: "custom" })).toEqual([210, 314]);
    const sheet = buildSheet({ ...large, paper: "custom" });
    expect(sheet.shapes.find((s) => s.type === "circle")).toMatchObject({
      r: 95,
    });
  });

  it("preserves absolute calibration dimensions and removes targets when disabled", () => {
    const sheet = buildSheet(defaults);
    const lines = sheet.shapes.filter((s) => s.type === "line");
    expect(lines.some((s) => s.x2 - s.x === 50 && s.y === s.y2)).toBe(true);
    expect(lines.some((s) => s.y2 - s.y === 50 && s.x === s.x2)).toBe(true);
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
    expect(patches.some((s) => Math.abs(s.w - width) < 1e-9 && s.h === 5)).toBe(true);
    expect(patches.some((s) => s.w === 5 && Math.abs(s.h - width) < 1e-9)).toBe(true);
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
      const sheet = buildSheet({ ...defaults, paper, maskType });
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
  });
});
