import { isSavedSettings } from "./settings-storage";
import type { SavedSettings } from "./settings-storage";

export function settingsUrl(url: string, settings: SavedSettings): string {
  const shared = new URL(url);
  shared.hash = new URLSearchParams({ settings: JSON.stringify(settings) }).toString();
  return shared.href;
}

export type ParsedSettingsUrl =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "loaded"; settings: SavedSettings };

export function parseSettingsUrl(url: string): ParsedSettingsUrl {
  const params = new URLSearchParams(new URL(url).hash.slice(1));
  if (!params.has("settings")) return { status: "absent" };
  try {
    const settings: unknown = JSON.parse(params.get("settings")!);
    if (isSavedSettings(settings)) return { status: "loaded", settings };
  } catch {
    // Leave local settings usable when a shared link is damaged.
  }
  return { status: "invalid" };
}

export function withoutSettingsUrl(url: string): string {
  const clean = new URL(url);
  const params = new URLSearchParams(clean.hash.slice(1));
  params.delete("settings");
  clean.hash = params.toString();
  return clean.href;
}
