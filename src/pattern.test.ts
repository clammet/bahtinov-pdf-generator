import { describe, expect, it } from "vitest";
import {
  buildSheet,
  defaults,
  pageSize,
  pitchFor,
  slitPolygons,
  validate,
  warnings,
} from "./pattern";
import { toPdf, toSvg } from "./export";

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
      { focalLength: 1, factor: 1000 },
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

describe("vector exports", () => {
  it("exports physical SVG units and identical shape coordinates", () => {
    const sheet = buildSheet(defaults),
      svg = toSvg(sheet);
    expect(svg).toContain('width="210mm" height="297mm" viewBox="0 0 210 297"');
    expect(svg).toContain('r="55"');
    expect(svg.match(/<polygon /g)?.length).toBe(slitPolygons(defaults).length);
    expect(svg).not.toContain("<image");
  });

  it("exports PDF with exact paper dimensions and no embedded raster mask", async () => {
    for (const paper of ["a4", "letter", "custom"] as const) {
      const sheet = buildSheet({ ...defaults, paper });
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
