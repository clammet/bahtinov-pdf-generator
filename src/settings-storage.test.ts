import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "./settings-storage";

afterEach(() => vi.unstubAllGlobals());

describe("settings storage", () => {
  it("round-trips raw edits, checkbox values, inactive settings and presets", () => {
    const data = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => data.set(key, value));
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem,
    });
    expect(loadSettings()).toEqual({});
    expect(setItem).not.toHaveBeenCalled();

    const values = {
      maskType: "carey",
      focalLength: "",
      angle: "25",
      calibration: false,
      "lens-preset": "sigma-14",
      "printer-preset": "1200",
    };
    saveSettings(values);
    expect(loadSettings()).toEqual(values);
    expect(setItem).toHaveBeenCalledTimes(1);

    saveSettings({ ...values, focalLength: "14" });
    expect(loadSettings().focalLength).toBe("14");
  });

  it("ignores malformed stored data and unsupported value types", () => {
    const getItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem });
    for (const value of ["{broken", "null", "[]", "123", '"text"']) {
      getItem.mockReturnValue(value);
      expect(loadSettings()).toEqual({});
    }
    getItem.mockReturnValue(JSON.stringify({
      focalLength: "400", calibration: false, dpi: 600,
      camera: null, paper: { value: "a4" },
    }));
    expect(loadSettings()).toEqual({ focalLength: "400", calibration: false });
  });

  it("handles storage access and write failures without interrupting the app", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("Storage blocked"); },
      setItem: () => { throw new Error("Quota exceeded"); },
    });
    expect(loadSettings()).toEqual({});
    expect(() => saveSettings({ calibration: true })).not.toThrow();
    vi.stubGlobal("localStorage", undefined);
    expect(loadSettings()).toEqual({});
    expect(() => saveSettings({ calibration: true })).not.toThrow();
  });
});
