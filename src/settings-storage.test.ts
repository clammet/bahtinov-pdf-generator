import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProfiles, loadSettings, saveProfile, saveSettings } from "./settings-storage";

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

describe("named settings profiles", () => {
  function useStorage() {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
  }

  it("keeps multiple named snapshots independent of auto-saved edits", () => {
    useStorage();
    expect(loadProfiles()).toEqual([]);
    expect(saveProfile("  Telescope  ", { focalLength: "400", calibration: false })).toBe("saved");
    expect(saveProfile("Wide angle", { focalLength: "14", "lens-preset": "sigma-14" })).toBe("saved");
    saveSettings({ focalLength: "800" });
    expect(loadProfiles()).toEqual([
      { name: "Telescope", settings: { focalLength: "400", calibration: false } },
      { name: "Wide angle", settings: { focalLength: "14", "lens-preset": "sigma-14" } },
    ]);
    expect(loadSettings()).toEqual({ focalLength: "800" });
  });

  it("requires explicit replacement for an existing name", () => {
    useStorage();
    saveProfile("Lens", { focalLength: "14" });
    expect(saveProfile(" Lens ", { focalLength: "50" })).toBe("exists");
    expect(loadProfiles()[0].settings.focalLength).toBe("14");
    expect(saveProfile("Lens", { focalLength: "50" }, true)).toBe("saved");
    expect(loadProfiles()).toEqual([{ name: "Lens", settings: { focalLength: "50" } }]);
    expect(saveProfile("   ", {})).toBe("invalid-name");
    expect(saveProfile("x".repeat(81), {})).toBe("invalid-name");
    expect(saveProfile("__proto__", { focalLength: "24" })).toBe("saved");
    expect(loadProfiles()).toHaveLength(2);
  });

  it("filters corrupt profiles and duplicate names while keeping valid saves", () => {
    const getItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem });
    for (const value of ["{broken", "null", "{}"] ) {
      getItem.mockReturnValue(value);
      expect(loadProfiles()).toEqual([]);
    }
    getItem.mockReturnValue(JSON.stringify([
      null, { name: "" }, { name: "Broken", settings: { focalLength: 400 } },
      { name: "Good", settings: { focalLength: "400" } },
      { name: " Good ", settings: { focalLength: "800" } },
    ]));
    expect(loadProfiles()).toEqual([{ name: "Good", settings: { focalLength: "400" } }]);
  });

  it("reports storage failure instead of claiming a profile was saved", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("Blocked"); },
      setItem: () => { throw new Error("Blocked"); },
    });
    expect(loadProfiles()).toEqual([]);
    expect(saveProfile("Lens", { focalLength: "14" })).toBe("unavailable");
  });
});
