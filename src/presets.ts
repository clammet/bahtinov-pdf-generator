// Manufacturer specifications; source links are recorded in README.md.
export const cameraPresets = [
  { id: "canon-6d", label: "Canon EOS 6D", pixelSize: 6.55 },
  { id: "canon-5d-iv", label: "Canon EOS 5D Mark IV", pixelSize: 5.36 },
  // Approximate pitch from Nikon's 35.9 mm width / 6016 image pixels.
  { id: "nikon-d750", label: "Nikon D750", pixelSize: 5.97 },
  { id: "zwo-533", label: "ZWO ASI533 MC/MM Pro", pixelSize: 3.76 },
] as const;

export const printerPresets = [300, 600, 1200, 2400] as const;

// Optical/layout starting point only. Never infer mounting dimensions or
// a printer's capabilities from the lens model.
const lensStartingSettings = {
  apertureMode: "estimated",
  fabrication: "film",
  pitchMode: "auto",
  factor: 180,
  openPercent: 50,
  angle: 20,
  obstruction: 0,
} as const;

// Keep IDs stable so saved profiles and shared links retain their selection.
export const lensPresets = [
  { id: "sigma-14", label: "Sigma 14 mm f/1.8 DG HSM Art (Canon EF)", focalLength: 14, fStop: 1.8 },
  { id: "samyang-14", label: "Samyang / Rokinon 14 mm f/2.8 ED AS IF UMC", focalLength: 14, fStop: 2.8 },
  { id: "sigma-14-dg-dn", label: "Sigma 14 mm f/1.4 DG DN Art", focalLength: 14, fStop: 1.4 },
  { id: "sigma-20-dg-dn", label: "Sigma 20 mm f/1.4 DG DN Art", focalLength: 20, fStop: 1.4 },
  { id: "nikon-20", label: "Nikon AF-S NIKKOR 20 mm f/1.8G ED", focalLength: 20, fStop: 1.8 },
  { id: "sony-24-gm", label: "Sony FE 24 mm f/1.4 GM", focalLength: 24, fStop: 1.4 },
  { id: "sigma-35-dg-dn", label: "Sigma 35 mm f/1.4 DG DN Art", focalLength: 35, fStop: 1.4 },
  { id: "canon-50-stm", label: "Canon EF 50 mm f/1.8 STM", focalLength: 50, fStop: 1.8 },
  { id: "samyang-135", label: "Samyang / Rokinon 135 mm f/2 ED UMC", focalLength: 135, fStop: 2 },
  { id: "canon-200", label: "Canon EF 200 mm f/2.8L II USM", focalLength: 200, fStop: 2.8 },
].map(({ id, label, focalLength, fStop }) => ({
  id,
  label,
  settings: { ...lensStartingSettings, focalLength, fStop },
}));

export const sigma14Preset = lensPresets[0].settings;

// Three printer dots is a starting estimate, not a fabrication guarantee.
// Round up so the editable value never understates that minimum.
export const printerMinimumWidth = (dpi: number) =>
  Math.ceil(((3 * 25.4) / dpi) * 10000) / 10000;
