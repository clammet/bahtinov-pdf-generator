const storageKey = "focusing-mask-generator.settings.v1";
const profilesKey = "focusing-mask-generator.profiles.v1";

export type SavedSettings = Record<string, string | boolean>;

export function isSavedSettings(value: unknown): value is SavedSettings {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "string" || typeof entry === "boolean",
    );
}

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

export interface SettingsProfile {
  name: string;
  settings: SavedSettings;
}

export function loadProfiles(): SettingsProfile[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(profilesKey) ?? "[]");
    if (!Array.isArray(stored)) return [];
    const profiles: SettingsProfile[] = [];
    for (const entry of stored) {
      if (!entry || typeof entry !== "object" ||
          typeof entry.name !== "string" || !entry.name.trim() ||
          entry.name.length > 80 || !isSavedSettings(entry.settings)) continue;
      const name = entry.name.trim();
      if (!profiles.some((profile) => profile.name === name))
        profiles.push({ name, settings: entry.settings });
    }
    return profiles;
  } catch {
    return [];
  }
}

export function saveProfile(
  name: string,
  settings: SavedSettings,
  replace = false,
): "saved" | "exists" | "invalid-name" | "unavailable" {
  name = name.trim();
  if (!name || name.length > 80) return "invalid-name";
  const profiles = loadProfiles();
  const index = profiles.findIndex((profile) => profile.name === name);
  if (index !== -1 && !replace) return "exists";
  const profile = { name, settings };
  if (index === -1) profiles.push(profile);
  else profiles[index] = profile;
  try {
    localStorage.setItem(profilesKey, JSON.stringify(profiles));
    return "saved";
  } catch {
    return "unavailable";
  }
}

export function saveSettings(values: SavedSettings): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    // Continue working when storage is blocked or its quota is exhausted.
  }
}
