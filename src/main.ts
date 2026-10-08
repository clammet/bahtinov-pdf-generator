import "./style.css";
import {
  buildSheet,
  defaults,
  fmt,
  pageSize,
  pitchFor,
  validate,
  warnings,
} from "./pattern";
import type { Settings, Sheet } from "./pattern";
import { download, toPdf, toSvg } from "./export";

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
  <header class="masthead"><a class="brand" href="./"><span class="brand-icon" aria-hidden="true">✳</span> BAHTINOV<span class="brand-sub">MASK STUDIO</span></a><a href="https://github.com/clammet/bahtinov-pdf-generator" target="_blank" rel="noreferrer">Source on GitHub <span aria-hidden="true">↗</span></a></header>
  <main>
    <div class="intro"><div><p class="eyebrow">PRECISION FOCUSING / PRINTABLE TOOLS</p><h1>A sharper starting point.</h1><p>Design a Bahtinov mask for your optics. Preview, download, and print at actual size.</p></div><span class="local-note"><span aria-hidden="true">◇</span> Generated in your browser</span></div>
    <div class="workspace">
      <form id="controls" novalidate>
        <section class="control-section"><div class="section-title"><h2><span>01</span> Optics & dimensions</h2><button class="text-button" id="reset-settings" type="button">Reset</button></div>
          <div class="field-grid">${input("focalLength", "Focal length", "mm", 1, 20000)}${input("fStop", "F-stop", "f/", 0.5, 100)}</div>
          <p class="helper">Use actual focal length, without sensor crop factor.</p>
          <div class="aperture-row"><span>Estimated aperture</span><strong id="aperture"></strong><button type="button" class="text-button" id="use-aperture">Use for pattern</button></div>
          <div class="field-grid">${input("patternDiameter", "Pattern diameter", "mm", 5, 1000)}${input("outerDiameter", "Final diameter", "mm", 6, 1100)}</div>
          <p class="helper">Pattern = slotted area. Final = outside edge, including the solid border. <span id="border"></span></p>
        </section>
        <section class="control-section"><h2><span>02</span> Pattern geometry</h2>
          <label class="field" for="pitchMode"><span>Slit spacing</span><select id="pitchMode" name="pitchMode"><option value="auto">Calculated from focal length</option><option value="manual">Manual pitch</option></select></label>
          <div class="field-grid"><div id="factor-field">${input("factor", "Bahtinov factor", "", 50, 1000)}</div><div id="manual-field" hidden>${input("manualPitch", "Pitch (slit + bar)", "mm", 0.05, 100)}</div>${input("angle", "Slit angle", "°", 5, 45)}</div>
          <p class="helper" id="pitch-help">Pitch = focal length ÷ factor. A factor of 150–200 is a useful starting range.</p>
          <details><summary>Fine-tune the mask</summary><div class="field-grid advanced">${input("openPercent", "Open fraction", "%", 10, 90)}${input("bridge", "Support width", "mm", 0.2, 20)}${input("obstruction", "Central obstruction", "mm", 0, 990)}${input("dpi", "Printer resolution", "DPI", 72, 9600)}</div><p class="helper">Obstruction adds a solid central disk. DPI is used for printability advice; exports stay vector.</p></details>
        </section>
        <section class="control-section"><h2><span>03</span> Print setup</h2><div class="field-grid"><label class="field" for="paper"><span>Paper size</span><select id="paper" name="paper"><option value="a4">A4 · 210 × 297 mm</option><option value="letter">US Letter</option><option value="a3">A3 · 297 × 420 mm</option><option value="custom">Custom · fits mask</option></select></label>${input("margin", "Page margin", "mm", 5, 40)}</div>
          <label class="check-row"><input type="checkbox" id="calibration" name="calibration" checked/><span><strong>Include print calibration</strong><small>Two-axis scale, 20 mm square, and line/gap targets.</small></span></label>
        </section>
      </form>
      <section class="preview-panel" aria-labelledby="preview-title">
        <div class="preview-toolbar"><div><h2 id="preview-title">Page preview</h2><span id="page-size"></span></div><div class="zoom-control" aria-label="Preview zoom"><button id="zoom-out" type="button" aria-label="Zoom out">−</button><output id="zoom-label">Fit</output><button id="zoom-in" type="button" aria-label="Zoom in">+</button></div></div>
        <div class="metrics" aria-live="polite"><div><span>Pattern pitch</span><strong id="pitch-value">—</strong></div><div><span>Slit / bar</span><strong id="slit-value">—</strong></div><div><span>Border width</span><strong id="border-value">—</strong></div></div>
        <div id="messages" aria-live="polite"></div>
        <div class="preview-stage" id="preview-stage"><div class="paper" id="preview"></div></div>
        <div class="download-bar"><p><strong>Ready for a real-size print.</strong><span>Preview is scaled to your screen. Exports use millimetres.</span></p><div class="download-actions"><button type="button" id="svg-button" class="secondary">Download SVG</button><button type="button" id="pdf-button" class="primary">Download PDF <span aria-hidden="true">↓</span></button></div></div>
        <p id="export-status" class="export-status" role="status"></p>
      </section>
    </div>
    <section class="print-notes"><div class="note-number">100<span>%</span></div><div><h2>Keep your printer honest.</h2><p>Print the downloaded PDF using <strong>Actual size / 100%</strong>, with “Fit to page” disabled. Measure both 50 mm rulers and the 20 mm square; a circle should stay circular. Inspect horizontal and vertical line samples for merged gaps.</p><p>Black areas must block light; white areas must transmit it. Use a cut-out opaque sheet or suitably opaque printing on clear film. Ordinary printed paper is a cutting template. Remove the mask after focusing.</p></div></section>
    <footer><span>BAHTINOV / Built for the night sky.</span><details><summary>How the pattern is calculated</summary><p>Three gratings at 0° and ± the selected angle create the focusing spikes. Pitch means one open slit plus one opaque bar. The default is focal length / 180 with a 50% open fraction. F-stop estimates entrance-pupil diameter; it does not set pitch. Measure your actual optics for the mechanical fit.</p><p>The pitch convention follows the <a href="https://github.com/satakagi/tribahtinovWebApps/blob/master/Bahtinov.html" target="_blank" rel="noreferrer">Bahtinov generator by Satoru Takagi</a>. This generator uses its own geometry implementation. Calibration checks print size and detail, not optical performance; confirm the result on a bright star.</p></details></footer>
  </main>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
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
  el("factor-field").hidden = !automatic;
  el("manual-field").hidden = automatic;
  el("pitch-help").textContent = automatic
    ? "Pitch = focal length ÷ factor. A factor of 150–200 is a useful starting range."
    : "Pitch is one open slit plus one opaque bar, measured perpendicular to the slits.";
  const aperture = settings.focalLength / settings.fStop;
  el("aperture").textContent = Number.isFinite(aperture)
    ? `${fmt(aperture, 2)} mm`
    : "—";
  const border = (settings.outerDiameter - settings.patternDiameter) / 2;
  el("border").textContent =
    Number.isFinite(border) && border > 0
      ? `Border: ${fmt(border)} mm per side.`
      : "";
  const errors = validate(settings);
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
    el("preview").textContent =
      "Adjust the settings above to generate a print sheet.";
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
form.addEventListener("input", update);
el("reset-settings").addEventListener("click", () => {
  form.reset();
  update();
});
el("use-aperture").addEventListener("click", () => {
  const diameter = settings.focalLength / settings.fStop;
  if (!Number.isFinite(diameter) || diameter < 5 || diameter > 1000) return;
  el<HTMLInputElement>("patternDiameter").value = fmt(diameter, 2);
  if (settings.outerDiameter <= diameter)
    el<HTMLInputElement>("outerDiameter").value = fmt(diameter + 10, 2);
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
  el("export-status").textContent =
    "SVG downloaded. Preserve its millimetre dimensions when importing into another app.";
});
el("pdf-button").addEventListener("click", async () => {
  if (!sheet || exporting) return;
  const snapshot = sheet,
    name = filename();
  exporting = true;
  setButtons();
  el("export-status").textContent = "Preparing vector PDF…";
  try {
    download(await toPdf(snapshot), `${name}.pdf`);
    el("export-status").textContent =
      "PDF downloaded. Print at Actual size / 100%.";
  } catch (error) {
    console.error(error);
    el("export-status").textContent =
      "The PDF could not be generated. Please retry, or download the SVG.";
  } finally {
    exporting = false;
    setButtons();
  }
});
update();
changeZoom(0);
