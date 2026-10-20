import { MAX_PATTERNS } from "./pattern";
import { isSavedSettings } from "./settings-storage";
import type { RawSettings, SavedSettings } from "./settings-storage";

// Version 1 wire dictionary: keep both order and values fixed, even when the
// application's defaults change. A field code alone represents this value.
const fields: readonly (readonly [string, string | boolean])[] = [
  ["maskType", "bahtinov"], ["focalLength", "400"], ["fStop", "4"],
  ["apertureMode", "estimated"], ["opticalAperture", "100"], ["camera", "none"],
  ["pixelSize", "6.55"], ["minimumWidth", "0.127"], ["fabrication", "cutout"],
  ["patternDiameter", "100"], ["borderShape", "circle"], ["outerDiameter", "110"],
  ["factor", "180"], ["pitchMode", "auto"], ["manualPitch", "2.222"],
  ["openPercent", "50"], ["angle", "20"], ["careyLeftAngle", "12"],
  ["careyRightAngle", "10"], ["bridge", "1"], ["obstruction", "0"],
  ["paper", "a4"], ["margin", "10"], ["calibration", true], ["dpi", "600"],
  ["lens-preset", "custom"], ["printer-preset", "600"], ["activePattern", "0"],
];
const codes = new Map(fields.map(([key], index) => [key, index.toString(36)]));

// Escape the record/group separators as well as characters encodeURIComponent
// leaves untouched. The outer fragment stays unescaped to avoid JSON's URL tax.
function escape(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*~]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Records contain only differences from their base. Missing fields are distinct
// from default-valued fields, empty strings, and unchecked checkboxes.
function encodeRecord(values: RawSettings, base: RawSettings = {}): string {
  const tokens: string[] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(values)])) {
    const present = Object.hasOwn(values, key);
    const value = values[key];
    if (present && Object.hasOwn(base, key) && value === base[key]) continue;
    const code = codes.get(key);
    const name = code ?? `$${escape(key)}`;
    if (!present) tokens.push(`${name}!`);
    else if (code !== undefined && value === fields[parseInt(code, 36)][1]) tokens.push(name);
    else if (typeof value === "boolean") tokens.push(`${name}!${value ? 1 : 0}`);
    else tokens.push(`${name}:${escape(value)}`);
  }
  return tokens.join(",");
}

function decodeRecord(record: string, base: RawSettings = {}): RawSettings {
  const values = new Map(Object.entries(base));
  const seen = new Set<string>();
  for (const token of record ? record.split(",") : []) {
    const match = /^(\$[^:!]*|[0-9a-z])(?:(:)(.*)|(!)([01]?))?$/.exec(token);
    if (!match) throw new Error("Invalid settings field");
    const [, name, stringMarker, stringValue, booleanMarker, booleanValue] = match;
    const field = fields[parseInt(name, 36)];
    const key = name.startsWith("$") ? decodeURIComponent(name.slice(1)) : field?.[0];
    if (key === undefined || seen.has(key)) throw new Error("Unknown or repeated settings field");
    seen.add(key);
    if (stringMarker) values.set(key, decodeURIComponent(stringValue));
    else if (booleanMarker) {
      if (booleanValue === "") values.delete(key);
      else values.set(key, booleanValue === "1");
    } else {
      if (!field) throw new Error("Missing settings value");
      values.set(key, field[1]);
    }
  }
  return Object.fromEntries(values);
}

export function settingsUrl(url: string, settings: SavedSettings): string {
  const shared = new URL(url);
  const patterns = Array.isArray(settings.patterns) ? settings.patterns : [];
  const root = Object.fromEntries(Object.entries(settings).filter(([key]) =>
    key !== "patterns" || patterns.length === 0)) as RawSettings;
  const records = [encodeRecord(root, patterns[0])];
  for (let index = 0; index < patterns.length; index++)
    records.push(encodeRecord(patterns[index], patterns[index - 1]));
  shared.hash = `s=1~${records.join("~")}`;
  return shared.href;
}

export type ParsedSettingsUrl =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "loaded"; settings: SavedSettings };

export function parseSettingsUrl(url: string): ParsedSettingsUrl {
  const hash = new URL(url).hash.slice(1);
  const params = new URLSearchParams(hash);
  if (!params.has("s") && !params.has("settings")) return { status: "absent" };
  try {
    let settings: unknown;
    if (params.has("s")) {
      // Split before percent-decoding so escaped delimiters stay inside values.
      const payloads = hash.split("&").filter((part) => part.startsWith("s="));
      if (payloads.length !== 1) throw new Error("Invalid settings payload");
      const [version, root, ...records] = payloads[0].slice(2).split("~");
      if (version !== "1" || root === undefined || records.length > MAX_PATTERNS)
        throw new Error("Unsupported settings format");
      const patterns: RawSettings[] = [];
      for (const record of records) patterns.push(decodeRecord(record, patterns.at(-1)));
      settings = decodeRecord(root, patterns[0]);
      if (patterns.length) (settings as SavedSettings).patterns = patterns;
    } else {
      // Continue accepting the original percent-encoded JSON links.
      settings = JSON.parse(params.get("settings")!);
    }
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
  params.delete("s");
  clean.hash = params.toString();
  return clean.href;
}
