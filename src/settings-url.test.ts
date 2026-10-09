import { describe, expect, it } from "vitest";
import { parseSettingsUrl, settingsUrl, withoutSettingsUrl } from "./settings-url";

describe("settings links", () => {
  const base = "https://example.com/masks/?source=shared";

  it("round-trips every value type, empty edits and encoded characters", () => {
    const settings = {
      maskType: "carey", focalLength: "14", fStop: "1.8", angle: "",
      calibration: false, "lens-preset": "sigma-14", "printer-preset": "custom",
      custom: "space + & = # % / µm",
    };
    const url = settingsUrl(`${base}#previous-section`, settings);
    expect(new URL(url).pathname).toBe("/masks/");
    expect(new URL(url).search).toBe("?source=shared");
    expect(parseSettingsUrl(url)).toEqual({ status: "loaded", settings });
  });

  it("distinguishes absent links from damaged or unsupported payloads", () => {
    expect(parseSettingsUrl(base)).toEqual({ status: "absent" });
    expect(parseSettingsUrl(`${base}#section`)).toEqual({ status: "absent" });
    for (const data of ["", "{broken", "null", "[]", "42", '{"dpi":600}', '{"paper":{}}']) {
      const hash = new URLSearchParams({ settings: data });
      expect(parseSettingsUrl(`${base}#${hash}`)).toEqual({ status: "invalid" });
    }
  });

  it("consumes imported settings without losing the site path, query or other fragment parameters", () => {
    const url = settingsUrl(base, { focalLength: "400" });
    expect(withoutSettingsUrl(url)).toBe(base);
    expect(parseSettingsUrl(withoutSettingsUrl(url))).toEqual({ status: "absent" });
    expect(withoutSettingsUrl(`${url}&section=preview`)).toBe(`${base}#section=preview`);
  });
});
