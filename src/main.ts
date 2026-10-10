import "./style.css";
import {
  createElement,
  createIcons,
  ChevronDown,
  ChevronRight,
  CircleQuestionMark,
  Download,
  FolderOpen,
  Link,
  Minus,
  Plus,
  Save,
  X,
} from "lucide";
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
  maskNames,
  validate,
  warnings,
} from "./pattern";
import type { Settings, Sheet } from "./pattern";
import { download, toPdf, toSvg } from "./export";
import { cameraPresets, lensPresets, printerPresets, printerMinimumWidth } from "./presets";
import { anglePreview, setupHoverPreview } from "./angle-preview";
import { loadProfiles, loadSettings, saveProfile, saveSettings } from "./settings-storage";
import type { SavedSettings } from "./settings-storage";
import { parseSettingsUrl, settingsUrl, withoutSettingsUrl } from "./settings-url";

const maskExamples = {
  bahtinov: { src: "./images/bahtinov.jpg", width: 640, height: 375 },
  carey: { src: "./images/carey.jpg", width: 678, height: 768 },
};

const input = (
  key: keyof Settings,
  label: string,
  unit: string,
  min: number,
  max: number,
  step = "any",
) =>
  `<label class="field" for="${key}"><span>${label}</span><span class="input-wrap"><input id="${key}" name="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${defaults[key]}" required/><span class="unit">${unit}</span></span></label>`;
const notice = (id: string) =>
  `<div id="${id}" class="notice ${id}" hidden><p role="status"></p><button type="button" class="notice-dismiss" aria-label="Dismiss notification"><span data-lucide="x"></span></button></div>`;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="masthead"><h1>Focusing mask generator</h1><div class="settings-actions" aria-label="Settings actions">
    <button type="button" id="copy-link" class="secondary"><span data-lucide="link"></span>Copy link</button>
    <button type="button" id="save-profile" class="secondary"><span data-lucide="save"></span>Save</button>
    <button type="button" id="load-profile" class="secondary"><span data-lucide="folder-open"></span>Load</button>
  </div></header>
  <main>
    ${notice("settings-status")}
    <section class="mask-picker" aria-label="Mask selection">
      <label class="field" for="maskType"><span>Mask type</span><select id="maskType" name="maskType" form="controls" aria-describedby="mask-help"><option value="bahtinov">Bahtinov mask</option><option value="carey">Carey mask</option></select></label>
      <p class="helper" id="mask-help"></p>
      <div class="mask-example">
        <button type="button" id="mask-image-button" class="mask-image-button" aria-label="Enlarge Bahtinov focusing example" aria-controls="mask-image-preview" aria-expanded="false" popovertarget="mask-image-preview" popovertargetaction="show">
          <img id="mask-image" src="./images/bahtinov.jpg" width="640" height="375" alt="Bahtinov diffraction spikes at three focus positions"/>
        </button>
        <span class="mask-image-hint">Hover or tap to enlarge</span>
      </div>
      <div id="mask-image-preview" class="mask-image-preview" popover aria-label="Full-resolution focusing example">
        <img id="mask-image-full" src="./images/bahtinov.jpg" width="640" height="375" alt="Bahtinov diffraction spikes at three focus positions"/>
      </div>
    </section>
    <div class="workspace">
      <form id="controls" novalidate>
        <section class="control-section"><div class="section-title"><h2>Optics</h2><button class="text-button" id="reset-settings" type="button">Reset</button></div>
          <label class="field" for="lens-preset"><span>Lens starting point</span><select id="lens-preset" aria-describedby="lens-help"><option value="custom">Custom lens / telescope</option>${lensPresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join("")}</select></label>
          <p class="helper" id="lens-help" hidden></p>
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
          <div class="field-grid"><div id="factor-field">${input("factor", "Spacing factor", "", 50, 1000)}</div><div id="manual-field" hidden>${input("manualPitch", "Pitch (slit + bar)", "mm", 0.05, 100)}</div><div class="angle-field" id="bahtinov-angle-field">${input("angle", "Slit angle", "°", 5, 45)}<button type="button" class="help-button" id="angle-preview-button" aria-label="Show slit angle star examples" aria-describedby="angle-preview" aria-controls="angle-preview" aria-expanded="false" popovertarget="angle-preview" popovertargetaction="show"><span data-lucide="circle-question-mark"></span></button></div></div>
          <div class="field-grid spaced" id="carey-angle-fields" hidden>${input("careyLeftAngle", "Left included angle", "°", 2, 90)}${input("careyRightAngle", "Right included angle", "°", 2, 90)}</div>
          <p class="helper" id="carey-angle-help" hidden>Angles between the upper and lower slits on each side: 12° left means ±6°; 10° right means ±5°. Keep the two angles different to form two distinct X patterns.</p>
          <div id="angle-preview" class="angle-preview" role="tooltip" popover>${anglePreview}</div>
          <p class="helper" id="factor-help">Higher factor = finer slits and bars, with diffraction features farther from the star, but harder to print or cut. Lower factor = coarser slits and bars, easier fabrication, and diffraction features closer to the star. Once the minimum slit/bar width is reached, increasing the factor has no further effect.</p>
          <p class="helper" id="angle-help">Higher slit angle = a wider X between the two angled diffraction spikes. Lower angle = a narrower X, with the spikes closer together. The angle is applied in both directions: 20° means ±20°, or 40° between the angled spikes. This changes their directions, not the pitch or slit/bar widths.</p>
          <p class="helper" id="pitch-help">Pitch = focal length ÷ factor, increased if needed to meet the minimum slit/bar width.</p>
          <p class="helper" id="reference-help" hidden></p>
          <details><summary><span data-lucide="chevron-right"></span>Advanced</summary><div class="field-grid advanced">${input("openPercent", "Open fraction", "%", 10, 90)}<div id="support-field">${input("bridge", "Support width", "mm", 0.2, 20)}</div>${input("obstruction", "Central obstruction", "mm", 0, 990)}</div></details>
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
        <div class="preview-toolbar"><div><h2 id="preview-title">Preview</h2><span id="page-size"></span></div><div class="zoom-control" aria-label="Preview zoom"><button id="zoom-out" type="button" aria-label="Zoom out"><span data-lucide="minus"></span></button><output id="zoom-label">Fit</output><button id="zoom-in" type="button" aria-label="Zoom in"><span data-lucide="plus"></span></button></div></div>
        <div class="metrics" aria-live="polite"><div><span>Pattern pitch</span><strong id="pitch-value">—</strong></div><div><span>Slit / bar</span><strong id="slit-value">—</strong></div><div><span>Border width</span><strong id="border-value">—</strong></div></div>
        <p id="diffraction-value" class="optical-result" aria-live="polite" hidden></p>
        <div id="messages" aria-live="polite"></div>
        <div class="preview-stage" id="preview-stage"><div class="paper" id="preview"></div></div>
        <div class="download-bar"><p>Print at <strong>100% / Actual size</strong>.<br>Disable “Fit to page”. Check calibration marks.</p><div class="download-actions"><button type="button" id="svg-button" class="secondary">Download SVG <span data-lucide="download"></span></button><button type="button" id="pdf-button" class="primary">Download PDF <span data-lucide="download"></span></button></div></div>
        ${notice("export-status")}
      </section>
    </div>
  </main>
  <dialog id="save-profile-dialog" class="settings-dialog" aria-labelledby="save-profile-title">
    <form id="save-profile-form">
      <h2 id="save-profile-title">Save settings profile</h2>
      <p class="helper">Save the current settings in this browser.</p>
      <label class="field spaced" for="profile-name"><span>Profile name</span><input id="profile-name" type="text" maxlength="80" required autocomplete="off"/></label>
      <label class="check-row" id="replace-profile-row" hidden><input id="replace-profile" type="checkbox"/><span><strong>Replace the existing profile with this name</strong></span></label>
      <p id="save-profile-status" class="dialog-status" role="status"></p>
      <div class="dialog-actions"><button type="button" class="secondary" id="cancel-save-profile">Cancel</button><button type="submit" class="primary">Save profile</button></div>
    </form>
  </dialog>
  <dialog id="load-profile-dialog" class="settings-dialog" aria-labelledby="load-profile-title">
    <form id="load-profile-form">
      <h2 id="load-profile-title">Load settings profile</h2>
      <p class="helper">Loading a profile replaces your current settings.</p>
      <label class="field spaced" for="profile-selection"><span>Saved profile</span><select id="profile-selection" required></select></label>
      <p id="load-profile-status" class="dialog-status" role="status"></p>
      <div class="dialog-actions"><button type="button" class="secondary" id="cancel-load-profile">Cancel</button><button type="submit" class="primary" id="confirm-load-profile">Load selected profile</button></div>
    </form>
  </dialog>
  <dialog id="copy-link-dialog" class="settings-dialog" aria-labelledby="copy-link-title">
    <h2 id="copy-link-title">Copy settings link</h2>
    <p class="helper">Automatic copying is unavailable. Copy this link manually.</p>
    <label class="field spaced" for="settings-link"><span>Settings URL</span><textarea id="settings-link" rows="4" readonly></textarea></label>
    <div class="dialog-actions"><button type="button" class="secondary" id="close-copy-link">Close</button></div>
  </dialog>`;
createIcons({
  icons: { CircleQuestionMark, ChevronRight, Download, FolderOpen, Link, Minus, Plus, Save, X },
  attrs: { class: "icon", "aria-hidden": "true", focusable: "false" },
  root: app,
});
// Keep native select behavior while using the same icon set for its arrow.
const selectArrow = encodeURIComponent(
  createElement(ChevronDown, { stroke: "#9aa8b6" }).outerHTML,
);
for (const select of app.querySelectorAll("select"))
  select.style.backgroundImage = `url("data:image/svg+xml,${selectArrow}")`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
function setupNotice(id: string) {
  const container = el(id);
  const message = container.querySelector("p")!;
  let timer: number | undefined;
  function dismiss() {
    window.clearTimeout(timer);
    timer = undefined;
    container.hidden = true;
    message.textContent = "";
  }
  container.querySelector("button")!.addEventListener("click", dismiss);
  return {
    dismiss,
    show(text: string, error = false) {
      dismiss();
      container.dataset.error = String(error);
      message.setAttribute("role", error ? "alert" : "status");
      message.textContent = text;
      container.hidden = false;
      if (!error) timer = window.setTimeout(dismiss, 5000);
    },
  };
}
const settingsNotice = setupNotice("settings-status");
const exportNotice = setupNotice("export-status");
el("factor").setAttribute("aria-describedby", "factor-help");
el("angle").setAttribute("aria-describedby", "angle-help");
for (const key of ["careyLeftAngle", "careyRightAngle"])
  el(key).setAttribute("aria-describedby", "carey-angle-help");
setupHoverPreview(el<HTMLButtonElement>("angle-preview-button"), el("angle-preview"));
setupHoverPreview(el<HTMLButtonElement>("mask-image-button"), el("mask-image-preview"));
const form = el<HTMLFormElement>("controls");
// Includes the associated mask selector outside the form and inactive fields.
const settingFields = Array.from(form.elements).filter(
  (field): field is HTMLInputElement | HTMLSelectElement =>
    field instanceof HTMLInputElement || field instanceof HTMLSelectElement,
);
function restoreSettings(values: SavedSettings) {
  form.reset();
  for (const field of settingFields) {
    const value = values[field.id];
    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      if (typeof value === "boolean") field.checked = value;
    } else if (typeof value === "string") {
      // Removed or invalid options fall back to the current default selection.
      if (field instanceof HTMLSelectElement &&
          !Array.from(field.options).some((option) => option.value === value)) continue;
      field.value = value;
    }
  }
}
function snapshotSettings(): SavedSettings {
  const values: SavedSettings = {};
  for (const field of settingFields)
    values[field.id] = field instanceof HTMLInputElement && field.type === "checkbox"
      ? field.checked
      : field.value;
  // Keep raw values so blank/invalid edits and preset selections survive reloads.
  return values;
}
function persistSettings() {
  saveSettings(snapshotSettings());
}
restoreSettings(loadSettings());
function importSettingsLink(): boolean {
  const sharedSettings = parseSettingsUrl(window.location.href);
  if (sharedSettings.status === "absent") return false;
  // Consume imported settings once; later reloads retain the user's new edits.
  window.history.replaceState(window.history.state, "", withoutSettingsUrl(window.location.href));
  if (sharedSettings.status === "loaded") {
    restoreSettings(sharedSettings.settings);
    update();
    persistSettings();
    settingsNotice.show("Settings loaded from link.");
    return true;
  } else {
    settingsNotice.show("This settings link is invalid. Your local settings were kept.", true);
    return false;
  }
}
window.addEventListener("hashchange", importSettingsLink);

el("copy-link").addEventListener("click", async () => {
  const url = settingsUrl(window.location.href, snapshotSettings());
  const button = el<HTMLButtonElement>("copy-link");
  button.disabled = true;
  try {
    await navigator.clipboard.writeText(url);
    settingsNotice.show("Settings link copied.");
  } catch {
    const field = el<HTMLTextAreaElement>("settings-link");
    field.value = url;
    el<HTMLDialogElement>("copy-link-dialog").showModal();
    field.focus();
    field.select();
  } finally {
    button.disabled = false;
  }
});
el("close-copy-link").addEventListener("click", () => el<HTMLDialogElement>("copy-link-dialog").close());

el("save-profile").addEventListener("click", () => {
  el<HTMLFormElement>("save-profile-form").reset();
  el("replace-profile-row").hidden = true;
  el("save-profile-status").textContent = "";
  el<HTMLDialogElement>("save-profile-dialog").showModal();
});
el("profile-name").addEventListener("input", () => {
  const name = el<HTMLInputElement>("profile-name").value.trim();
  el("replace-profile-row").hidden = !loadProfiles().some((profile) => profile.name === name);
  el<HTMLInputElement>("replace-profile").checked = false;
  el("save-profile-status").textContent = "";
});
el("cancel-save-profile").addEventListener("click", () => el<HTMLDialogElement>("save-profile-dialog").close());
el("save-profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = el<HTMLInputElement>("profile-name").value.trim();
  const result = saveProfile(name, snapshotSettings(), el<HTMLInputElement>("replace-profile").checked);
  if (result === "saved") {
    el<HTMLDialogElement>("save-profile-dialog").close();
    settingsNotice.show(`Profile “${name}” saved.`);
  } else {
    el("save-profile-status").textContent = result === "exists"
      ? "This name already exists. Confirm replacement or choose another name."
      : result === "invalid-name"
        ? "Enter a profile name of 1–80 characters."
        : "The profile could not be saved. Browser storage is unavailable or full.";
    if (result === "exists") el("replace-profile-row").hidden = false;
  }
});

el("load-profile").addEventListener("click", () => {
  const profiles = loadProfiles().sort((a, b) => a.name.localeCompare(b.name));
  const select = el<HTMLSelectElement>("profile-selection");
  select.replaceChildren(new Option("Select a saved profile", ""));
  for (const profile of profiles) select.add(new Option(profile.name, profile.name));
  select.disabled = profiles.length === 0;
  el<HTMLButtonElement>("confirm-load-profile").disabled = true;
  el("load-profile-status").textContent = profiles.length ? "" : "No saved profiles yet. Use Save to create one.";
  el<HTMLDialogElement>("load-profile-dialog").showModal();
});
el("profile-selection").addEventListener("change", () => {
  el<HTMLButtonElement>("confirm-load-profile").disabled = !el<HTMLSelectElement>("profile-selection").value;
});
el("cancel-load-profile").addEventListener("click", () => el<HTMLDialogElement>("load-profile-dialog").close());
el("load-profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = el<HTMLSelectElement>("profile-selection").value;
  const profile = loadProfiles().find((profile) => profile.name === name);
  if (!profile) {
    el("load-profile-status").textContent = "This profile is unavailable. Reopen Load to refresh the list.";
    return;
  }
  restoreSettings(profile.settings);
  update();
  persistSettings();
  el<HTMLDialogElement>("load-profile-dialog").close();
  settingsNotice.show(`Profile “${name}” loaded.`);
});
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
  const carey = settings.maskType === "carey";
  const example = maskExamples[settings.maskType];
  // Preserve the originals; only the inline thumbnail is scaled by CSS.
  for (const id of ["mask-image", "mask-image-full"]) {
    const img = el<HTMLImageElement>(id);
    if (img.getAttribute("src") !== example.src) {
      if (el("mask-image-preview").matches(":popover-open"))
        el("mask-image-preview").hidePopover();
      img.src = example.src;
      img.width = example.width;
      img.height = example.height;
      img.alt = `${maskNames[settings.maskType]} diffraction spikes at three focus positions`;
    }
  }
  el("mask-image-button").setAttribute("aria-label", `Enlarge ${maskNames[settings.maskType]} focusing example`);
  document.title = `${maskNames[settings.maskType]} — focusing mask generator`;
  el("mask-help").textContent = carey
    ? "Four grating regions form two overlapping X patterns. Adjust focus until their spike spacing is symmetrical. Keep the mask orientation consistent between uses."
    : "Three grating regions form a central spike and an X. Adjust focus until the central spike crosses the centre of the X.";
  el("bahtinov-angle-field").hidden = carey;
  el<HTMLInputElement>("angle").disabled = carey;
  el("angle-help").hidden = carey;
  el("carey-angle-fields").hidden = !carey;
  el("carey-angle-help").hidden = !carey;
  for (const key of ["careyLeftAngle", "careyRightAngle"])
    el<HTMLInputElement>(key).disabled = !carey;
  if (carey && el("angle-preview").matches(":popover-open"))
    el("angle-preview").hidePopover();
  const automatic = settings.pitchMode === "auto";
  el<HTMLInputElement>("factor").disabled = !automatic;
  el<HTMLInputElement>("manualPitch").disabled = automatic;
  const film = settings.fabrication === "film";
  el("support-field").hidden = film;
  el<HTMLInputElement>("bridge").disabled = film;
  el("layout-help").textContent = film
    ? "For opaque printing on optically clear film. The film supports the bars, so no ribs cross the small pupil. This layout is not a cut-out template. Ordinary paper cannot transmit the star's light."
    : "Ribs hold the cut-out bars together. Set slit/bar and support widths for your material and cutting method.";
  const lensPreset = lensPresets.find(
    (preset) => preset.id === el<HTMLSelectElement>("lens-preset").value,
  );
  el("lens-help").hidden = !lensPreset;
  el("lens-help").textContent = lensPreset
    ? `Starting point: ${lensPreset.settings.focalLength} mm, f/${lensPreset.settings.fStop}, 50% open, factor 180, transparency layout. Adjust the f-number if focusing stopped down; measure your mounting dimensions separately.`
    : "";
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
  exportNotice.dismiss();
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
el("maskType").addEventListener("input", () => {
  update();
  persistSettings();
});
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", (event) => {
  const id = (event.target as HTMLElement).id;
  if (id === "lens-preset") {
    const preset = lensPresets.find(
      (preset) => preset.id === el<HTMLSelectElement>("lens-preset").value,
    );
    if (preset) {
      for (const [key, value] of Object.entries(preset.settings))
        (form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement).value = String(value);
    }
  }
  if (Object.keys(lensPresets[0].settings).includes(id))
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
  persistSettings();
});
el("reset-settings").addEventListener("click", () => {
  form.reset();
  update();
  persistSettings();
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
  return `${settings.maskType}-${fmt(settings.focalLength)}mm-${fmt(settings.outerDiameter)}mm`;
}
el("svg-button").addEventListener("click", () => {
  if (!sheet) return;
  download(
    new Blob([toSvg(sheet)], { type: "image/svg+xml;charset=utf-8" }),
    `${filename()}.svg`,
  );
  exportNotice.show("SVG downloaded.");
});
el("pdf-button").addEventListener("click", async () => {
  if (!sheet || exporting) return;
  const snapshot = sheet,
    name = filename();
  exporting = true;
  setButtons();
  exportNotice.show("Preparing PDF…");
  try {
    download(await toPdf(snapshot), `${name}.pdf`);
    exportNotice.show("PDF downloaded.");
  } catch (error) {
    console.error(error);
    exportNotice.show("PDF failed. Retry or download SVG.", true);
  } finally {
    exporting = false;
    setButtons();
  }
});
if (!importSettingsLink()) update();
changeZoom(0);
