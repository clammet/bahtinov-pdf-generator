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
export const sigma14Preset = {
  focalLength: 14,
  fStop: 1.8,
  apertureMode: "estimated",
  fabrication: "film",
  pitchMode: "auto",
  factor: 180,
  openPercent: 50,
  angle: 20,
  obstruction: 0,
} as const;

// Three printer dots is a starting estimate, not a fabrication guarantee.
// Round up so the editable value never understates that minimum.
export const printerMinimumWidth = (dpi: number) =>
  Math.ceil(((3 * 25.4) / dpi) * 10000) / 10000;
