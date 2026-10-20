import type { SavedSettings } from "./settings-storage";
import { describe, expect, it } from "vitest";
import { parseSettingsUrl, settingsUrl, withoutSettingsUrl } from "./settings-url";
import { defaults, MAX_PATTERNS } from "./pattern";

describe("settings links", () => {
  const base = "https://example.com/masks/?source=shared";

  it("round-trips every value type, empty edits and encoded characters", () => {
    const settings: SavedSettings = {
      maskType: "carey", focalLength: "14", fStop: "1.8", angle: "",
      calibration: false, "lens-preset": "sigma-14", "printer-preset": "custom",
      custom: "space + & = # % / µm , ~ : ! $ ' ( ) * 😀",
      activePattern: "1",
      patterns: [
        { maskType: "bahtinov", focalLength: "400", calibration: false },
        { maskType: "carey", focalLength: "14", "lens-preset": "sigma-14" },
      ],
    };
    const url = settingsUrl(`${base}#previous-section`, settings);
    expect(new URL(url).pathname).toBe("/masks/");
    expect(new URL(url).search).toBe("?source=shared");
    expect(parseSettingsUrl(url)).toEqual({ status: "loaded", settings });
  });

  it("keeps a complete default sheet below 160 characters on the published site", () => {
    const pattern = {
      ...Object.fromEntries(Object.entries(defaults).map(([key, value]) =>
        [key, typeof value === "number" ? String(value) : value])),
      "lens-preset": "custom", "printer-preset": "600",
    };
    const settings: SavedSettings = { ...pattern, patterns: [pattern], activePattern: "0" };
    const site = "https://clammet.github.io/bahtinov-pdf-generator/";
    const url = settingsUrl(site, settings);
    const legacy = `${site}#${new URLSearchParams({ settings: JSON.stringify(settings) })}`;
    expect(url.length).toBeLessThan(160);
    expect(url.length).toBeLessThan(legacy.length / 10);
    expect(parseSettingsUrl(url)).toEqual({ status: "loaded", settings });
    expect(parseSettingsUrl(legacy)).toEqual({ status: "loaded", settings });

    const repeated = { ...settings, patterns: Array.from({ length: MAX_PATTERNS }, () => ({ ...pattern })) };
    const repeatedUrl = settingsUrl(site, repeated);
    expect(repeatedUrl.length).toBe(url.length + MAX_PATTERNS - 1);
    expect(parseSettingsUrl(repeatedUrl)).toEqual({ status: "loaded", settings: repeated });
  });

  it("decodes a fixed version 1 link independently of changing application defaults", () => {
    const pattern = { maskType: "bahtinov", focalLength: "400", calibration: true };
    expect(parseSettingsUrl(`${base}#s=1~r~0,1,n`)).toEqual({
      status: "loaded", settings: { ...pattern, activePattern: "0", patterns: [pattern] },
    });
  });

  it("preserves missing fields, exact strings, unknown keys and pattern differences", () => {
    const special = Object.fromEntries([
      ["__proto__", "safe"], ["constructor", false], ["", ""],
      ["new,key~:!&=%µ", "0"], ["calibration", "false"],
    ]);
    for (const settings of [
      {}, { focalLength: "0400.00", angle: "", calibration: false }, special,
      { patterns: [{}, {}, {}], activePattern: "2" },
      { patterns: [special, { focalLength: "14" }, {}, special], activePattern: "3" },
    ]) {
      expect(parseSettingsUrl(settingsUrl(base, settings))).toEqual({ status: "loaded", settings });
    }
  });

  it("continues loading original JSON links for single patterns and full sheets", () => {
    for (const settings of [
      { focalLength: "400", calibration: false },
      { patterns: [{ maskType: "bahtinov" }, { maskType: "carey" }], activePattern: "1" },
    ]) {
      const url = `${base}#${new URLSearchParams({ settings: JSON.stringify(settings) })}`;
      expect(parseSettingsUrl(url)).toEqual({ status: "loaded", settings });
      expect(withoutSettingsUrl(`${url}&section=preview`)).toBe(`${base}#section=preview`);
    }
  });

  it("distinguishes absent links from damaged or unsupported payloads", () => {
    expect(parseSettingsUrl(base)).toEqual({ status: "absent" });
    expect(parseSettingsUrl(`${base}#section`)).toEqual({ status: "absent" });
    for (const data of ["", "{broken", "null", "[]", "42", '{"dpi":600}', '{"paper":{}}', '{"patterns":[]}', '{"patterns":[{"dpi":600}]}', '{"other":[{}]}']) {
      const hash = new URLSearchParams({ settings: data });
      expect(parseSettingsUrl(`${base}#${hash}`)).toEqual({ status: "invalid" });
    }
  });

  it("rejects damaged compact fields, unsupported versions and oversized sheets", () => {
    for (const data of [
      "", "1", "2~", "1~z", "1~0,0", "1~0!2", "1~0:%", "1~$unknown",
      "1~$bad%:x", "1~0,$maskType:carey", `1~${"~".repeat(MAX_PATTERNS + 1)}`,
      "1~0&s=1~1",
    ]) expect(parseSettingsUrl(`${base}#s=${data}`)).toEqual({ status: "invalid" });
    // A broken new payload must not silently fall back to unrelated legacy data.
    expect(parseSettingsUrl(`${base}#s=2~&settings=%7B%7D`)).toEqual({ status: "invalid" });
  });

  it("consumes imported settings without losing the site path, query or other fragment parameters", () => {
    const url = settingsUrl(base, { focalLength: "400" });
    expect(withoutSettingsUrl(url)).toBe(base);
    expect(parseSettingsUrl(withoutSettingsUrl(url))).toEqual({ status: "absent" });
    expect(withoutSettingsUrl(`${url}&section=preview`)).toBe(`${base}#section=preview`);
  });
});
