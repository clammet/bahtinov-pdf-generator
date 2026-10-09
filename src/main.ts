import "./style.css";
import {
  buildSheet,
  apertureFor,
  defaults,
  diffractionOffsetFor,
  fmt,
  pageSize,
  pitchFor,
  referenceFeatureFor,
  referenceDpiFor,
  isShortLens,
  validate,
  warnings,
} from "./pattern";
import type { Settings, Sheet } from "./pattern";
import { download, toPdf, toSvg } from "./export";
import { cameraPresets, printerPresets, printerMinimumWidth, sigma14Preset } from "./presets";

const input = (
  key: keyof Settings,
  label: string,
  unit: string,
  min: number,
  max: number,
  step = "any",
) =>
  `<label class="field" for="${key}"><span>${label}</span><span class="input-wrap"><input id="${key}" name="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${defaults[key]}" required/><span class="unit">${unit}</span></span></label>`;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="masthead"><h1>Bahtinov mask</h1></header>
  <main>
    <div class="workspace">
      <form id="controls" novalidate>
        <section class="control-section"><div class="section-title"><h2>Optics</h2><button class="text-button" id="reset-settings" type="button">Reset</button></div>
          <label class="field" for="lens-preset"><span>Lens starting point</span><select id="lens-preset"><option value="custom">Custom lens / telescope</option><option value="sigma-14">Sigma 14 mm f/1.8 DG HSM Art (Canon EF)</option></select></label>
          <p class="helper" id="lens-help" hidden>Sigma preset: 14 mm, f/1.8, 50% open, factor 180, transparency layout. Your mask dimensions, camera and printer limits are preserved. Sigma lists an 80 mm front element and no front filter thread; neither the glass diameter nor the 95.4 mm body diameter specifies a mask fit. Measure your hood/holder and keep the film clear of the curved glass. <a href="https://www.sigma-global.com/en/lenses/a017_14_18/" target="_blank" rel="noreferrer">Lens specifications</a>.</p>
          <div class="spaced">${input("focalLength", "Focal length", "mm", 1, 20000)}</div>
          <p class="helper">Use the focal length of your optical setup, including reducers or Barlows. Do not apply sensor crop factor.</p>
          <label class="field spaced" for="apertureMode"><span>Optical aperture source</span><select id="apertureMode" name="apertureMode"><option value="estimated">Estimate from f-number</option><option value="manual">Known aperture / telescope override</option></select></label>
          <div class="spaced" id="f-stop-field">${input("fStop", "F-number", "f/", 0.5, 100)}</div>
          <div class="spaced" id="optical-aperture-field" hidden>${input("opticalAperture", "Clear optical aperture", "mm", 1, 1000)}</div>
          <div class="aperture-row"><span id="aperture-label">Estimated entrance pupil</span><strong id="aperture"></strong></div>
          <p class="helper aperture-help">Optical estimate only. This is not the front-element diameter or a suggested mask size.</p>
          <div class="field-grid">${input("patternDiameter", "Pattern diameter", "mm", 5, 1000)}${input("outerDiameter", "Outside diameter", "mm", 6, 1100)}</div>
          <p class="helper">Pattern = slotted area covering the usable opening at the mounting position. Outside diameter = physical fit, including the border. Initial dimensions are examples; measure your lens hood, holder or telescope. Optical settings never resize the mask.</p>
          <p class="helper" id="wide-angle-help" hidden>Wide-angle lenses: use a centred star; off-axis rays can miss one or more grating regions. Mount ahead of the hood with clearance from protruding glass. The pupil estimate does not model the hood, pupil position or off-axis vignetting.</p>
        </section>
        <section class="control-section"><h2>Camera <span class="optional">optional</span></h2>
          <label class="field" for="camera"><span>Camera model</span><select id="camera" name="camera"><option value="none">Not specified / visual use</option>${cameraPresets.map((preset) => `<option value="${preset.id}">${preset.label} · ${preset.pixelSize} µm</option>`).join("")}<option value="custom">Custom pixel size</option></select></label>
          <div class="spaced" id="pixel-size-field" hidden>${input("pixelSize", "Camera pixel size", "µm", 0.1, 100)}</div>
          <p class="helper">Predicts diffraction spacing on the sensor; does not change pitch. Custom accepts other cameras or effective pixel size after binning.</p>
        </section>
        <section class="control-section"><h2>Pattern</h2>
          <label class="field" for="fabrication"><span>Fabrication layout</span><select id="fabrication" name="fabrication"><option value="cutout">Cut-out mask · support ribs</option><option value="film">Transparency · no support ribs</option></select></label>
          <p class="helper" id="layout-help"></p>
          <div class="spaced">
          <label class="field" for="pitchMode"><span>Slit spacing</span><select id="pitchMode" name="pitchMode"><option value="auto">Automatic</option><option value="manual">Manual pitch</option></select></label>
          </div>
          <div class="field-grid"><div id="factor-field">${input("factor", "Bahtinov factor", "", 50, 1000)}</div><div id="manual-field" hidden>${input("manualPitch", "Pitch (slit + bar)", "mm", 0.05, 100)}</div>${input("angle", "Slit angle", "°", 5, 45)}</div>
          <p class="helper" id="factor-help">Higher factor = finer slits and bars, with diffraction features farther from the star, but harder to print or cut. Lower factor = coarser slits and bars, easier fabrication, and diffraction features closer to the star. Once the minimum slit/bar width is reached, increasing the factor has no further effect.</p>
          <p class="helper" id="pitch-help">Pitch = focal length ÷ factor, increased if needed to meet the minimum slit/bar width.</p>
          <p class="helper" id="reference-help" hidden></p>
          <details><summary>Advanced</summary><div class="field-grid advanced">${input("openPercent", "Open fraction", "%", 10, 90)}<div id="support-field">${input("bridge", "Support width", "mm", 0.2, 20)}</div>${input("obstruction", "Central obstruction", "mm", 0, 990)}</div></details>
        </section>
        <section class="control-section"><h2>Print & fabrication</h2>
          <label class="field" for="printer-preset"><span>Printer preset</span><select id="printer-preset">${printerPresets.map((dpi) => `<option value="${dpi}" ${dpi === defaults.dpi ? "selected" : ""}>${dpi} DPI · ${fmt(printerMinimumWidth(dpi), 4)} mm minimum</option>`).join("")}<option value="custom">Custom / cutting template</option></select></label>
          <div class="field-grid spaced">${input("minimumWidth", "Minimum slit/bar width", "mm", 0.001, 20)}${input("dpi", "Printer resolution", "DPI", 72, 9600)}</div>
          <p class="helper">Presets allow at least 3 printer dots per slit/bar; 600 DPI is the default starting estimate. Choose the printer's real resolution (lower axis if unequal), not image PPI or an interpolated setting. Presets do not establish cutting strength or optical usefulness. Check both actual-pitch calibration samples; increase the width if gaps merge or bars are fragile. For cutting, enter your reliable minimum width. Slit ends at the rim can be narrower.</p>
          <div class="field-grid spaced"><label class="field" for="paper"><span>Paper size</span><select id="paper" name="paper"><option value="a4">A4 · 210 × 297 mm</option><option value="letter">US Letter</option><option value="a3">A3 · 297 × 420 mm</option><option value="custom">Custom · fits mask</option></select></label>${input("margin", "Page margin", "mm", 5, 40)}</div>
          <label class="check-row"><input type="checkbox" id="calibration" name="calibration" checked/><span><strong>Print calibration</strong></span></label>
        </section>
      </form>
      <section class="preview-panel" aria-labelledby="preview-title">
        <div class="preview-toolbar"><div><h2 id="preview-title">Preview</h2><span id="page-size"></span></div><div class="zoom-control" aria-label="Preview zoom"><button id="zoom-out" type="button" aria-label="Zoom out">−</button><output id="zoom-label">Fit</output><button id="zoom-in" type="button" aria-label="Zoom in">+</button></div></div>
        <div class="metrics" aria-live="polite"><div><span>Pattern pitch</span><strong id="pitch-value">—</strong></div><div><span>Slit / bar</span><strong id="slit-value">—</strong></div><div><span>Border width</span><strong id="border-value">—</strong></div></div>
        <p id="diffraction-value" class="optical-result" aria-live="polite" hidden></p>
        <div id="messages" aria-live="polite"></div>
        <div class="preview-stage" id="preview-stage"><div class="paper" id="preview"></div></div>
        <div class="download-bar"><p>Print at <strong>100% / Actual size</strong>.<br>Disable “Fit to page”. Check calibration marks.</p><div class="download-actions"><button type="button" id="svg-button" class="secondary">Download SVG</button><button type="button" id="pdf-button" class="primary">Download PDF <span aria-hidden="true">↓</span></button></div></div>
        <p id="export-status" class="export-status" role="status"></p>
      </section>
    </div>
  </main>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
el("factor").setAttribute("aria-describedby", "factor-help");
const form = el<HTMLFormElement>("controls");
let sheet: Sheet | undefined;
let settings = { ...defaults };
let zoom = 1;
let exporting = false;
function readSettings(): Settings {
  const values = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    const field = form.elements.namedItem(key) as
      | HTMLInputElement
      | HTMLSelectElement;
    const value =
      typeof defaults[key] === "number"
        ? Number(field.value || NaN)
        : typeof defaults[key] === "boolean"
          ? (field as HTMLInputElement).checked
          : field.value;
    Object.assign(values, { [key]: value });
  }
  return values;
}
function setButtons() {
  el<HTMLButtonElement>("pdf-button").disabled = !sheet || exporting;
  el<HTMLButtonElement>("svg-button").disabled = !sheet || exporting;
}
function update() {
  settings = readSettings();
  const automatic = settings.pitchMode === "auto";
  const film = settings.fabrication === "film";
  el("support-field").hidden = film;
  el<HTMLInputElement>("bridge").disabled = film;
  el("layout-help").textContent = film
    ? "For opaque printing on optically clear film. The film supports the bars, so no ribs cross the small pupil. This layout is not a cut-out template. Ordinary paper cannot transmit the star's light."
    : "Ribs hold the cut-out bars together. Set slit/bar and support widths for your material and cutting method.";
  el("lens-help").hidden = el<HTMLSelectElement>("lens-preset").value !== "sigma-14";
  el("wide-angle-help").hidden = !isShortLens(settings);
  el("factor-field").hidden = !automatic;
  el("factor-help").hidden = !automatic;
  el("manual-field").hidden = automatic;
  el("pitch-help").textContent = automatic
    ? "Pitch = focal length ÷ factor, increased if needed to meet the minimum slit/bar width."
    : "Pitch = slit + bar. Both must meet the minimum slit/bar width.";
  const estimated = settings.apertureMode === "estimated";
  el("f-stop-field").hidden = !estimated;
  el<HTMLInputElement>("fStop").disabled = !estimated;
  el("optical-aperture-field").hidden = estimated;
  el<HTMLInputElement>("opticalAperture").disabled = estimated;
  el("aperture-label").textContent = estimated
    ? "Estimated entrance pupil"
    : "Optical aperture";
  el("pixel-size-field").hidden = settings.camera === "none";
  el<HTMLInputElement>("pixelSize").disabled = settings.camera === "none";
  el<HTMLInputElement>("pixelSize").readOnly = settings.camera !== "custom";
  const aperture = apertureFor(settings);
  el("aperture").textContent = Number.isFinite(aperture)
    ? `${fmt(aperture, 2)} mm`
    : "—";
  const border = (settings.outerDiameter - settings.patternDiameter) / 2;
  const errors = validate(settings);
  el("reference-help").hidden = !automatic || errors.length > 0;
  el("reference-help").textContent = !automatic || errors.length > 0 ? "" :
    `Before fabrication limits: ${fmt(settings.focalLength / settings.factor, 4)} mm pitch; smallest slit/bar ${fmt(referenceFeatureFor(settings), 4)} mm. Three dots across that feature would require at least ${referenceDpiFor(settings).toLocaleString()} DPI in both axes. This is a resolution estimate, not a promise of print or focus quality.`;
  const offset = errors.length ? null : diffractionOffsetFor(settings);
  el("diffraction-value").hidden = offset === null;
  el("diffraction-value").textContent = offset === null
    ? ""
    : `First-order diffraction offset: ≈ ${fmt(offset, 1)} sensor pixels from the star centre at 550 nm. Estimate, not full spike length; live-view scaling and filters affect appearance.`;
  const messages = el("messages");
  messages.replaceChildren();
  for (const message of errors.length ? errors : warnings(settings)) {
    const p = document.createElement("p");
    p.className = errors.length ? "error" : "warning";
    p.textContent = message;
    messages.append(p);
  }
  el("export-status").textContent = "";
  if (errors.length) {
    sheet = undefined;
    el("preview").replaceChildren();
    el("preview").classList.add("invalid");
    el("preview").textContent = "Correct the settings to preview.";
    el("page-size").textContent = "Check settings";
    for (const id of ["pitch-value", "slit-value", "border-value"])
      el(id).textContent = "—";
  } else {
    sheet = buildSheet(settings);
    el("preview").classList.remove("invalid");
    el("preview").innerHTML = toSvg(sheet);
    const [w, h] = pageSize(settings),
      pitch = pitchFor(settings),
      slit = (pitch * settings.openPercent) / 100;
    el("page-size").textContent =
      `${settings.paper === "custom" ? "Custom sheet" : settings.paper.toUpperCase()} · ${fmt(w, 1)} × ${fmt(h, 1)} mm`;
    el("pitch-value").textContent = `${fmt(pitch)} mm`;
    el("slit-value").textContent = `${fmt(slit)} / ${fmt(pitch - slit)} mm`;
    el("border-value").textContent = `${fmt(border)} mm`;
  }
  setButtons();
}
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", (event) => {
  const id = (event.target as HTMLElement).id;
  if (id === "lens-preset" && el<HTMLSelectElement>("lens-preset").value === "sigma-14") {
    for (const [key, value] of Object.entries(sigma14Preset))
      (form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement).value = String(value);
  }
  if (Object.keys(sigma14Preset).includes(id))
    el<HTMLSelectElement>("lens-preset").value = "custom";
  if (id === "camera") {
    const preset = cameraPresets.find(
      (p) => p.id === el<HTMLSelectElement>("camera").value,
    );
    if (preset) el<HTMLInputElement>("pixelSize").value = String(preset.pixelSize);
  }
  if (id === "printer-preset") {
    const value = el<HTMLSelectElement>("printer-preset").value;
    if (value !== "custom") {
      el<HTMLInputElement>("dpi").value = value;
      el<HTMLInputElement>("minimumWidth").value = String(
        printerMinimumWidth(Number(value)),
      );
    }
  }
  if (id === "dpi" || id === "minimumWidth")
    el<HTMLSelectElement>("printer-preset").value = "custom";
  update();
});
el("reset-settings").addEventListener("click", () => {
  form.reset();
  update();
});
function changeZoom(delta: number) {
  zoom = Math.max(1, Math.min(3, zoom + delta));
  el("preview").style.width = `${zoom * 100}%`;
  el("preview").style.maxWidth = `${zoom * 520}px`;
  el("zoom-label").textContent =
    zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`;
  el<HTMLButtonElement>("zoom-out").disabled = zoom === 1;
  el<HTMLButtonElement>("zoom-in").disabled = zoom === 3;
}
el("zoom-in").addEventListener("click", () => changeZoom(0.5));
el("zoom-out").addEventListener("click", () => changeZoom(-0.5));
function filename() {
  return `bahtinov-${fmt(settings.focalLength)}mm-${fmt(settings.outerDiameter)}mm`;
}
el("svg-button").addEventListener("click", () => {
  if (!sheet) return;
  download(
    new Blob([toSvg(sheet)], { type: "image/svg+xml;charset=utf-8" }),
    `${filename()}.svg`,
  );
  el("export-status").textContent = "SVG downloaded.";
});
el("pdf-button").addEventListener("click", async () => {
  if (!sheet || exporting) return;
  const snapshot = sheet,
    name = filename();
  exporting = true;
  setButtons();
  el("export-status").textContent = "Preparing PDF…";
  try {
    download(await toPdf(snapshot), `${name}.pdf`);
    el("export-status").textContent = "PDF downloaded.";
  } catch (error) {
    console.error(error);
    el("export-status").textContent = "PDF failed. Retry or download SVG.";
  } finally {
    exporting = false;
    setButtons();
  }
});
update();
changeZoom(0);
