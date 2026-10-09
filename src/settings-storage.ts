const storageKey = "focusing-mask-generator.settings.v1";

export type SavedSettings = Record<string, string | boolean>;

export function loadSettings(): SavedSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        ([, value]) => typeof value === "string" || typeof value === "boolean",
      ),
    );
  } catch {
    // Corrupt data or unavailable storage must not prevent using the generator.
    return {};
  }
}

export function saveSettings(values: SavedSettings): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    // Continue working when storage is blocked or its quota is exhausted.
  }
}
