# Bahtinov mask generator

A browser-based Bahtinov focusing-mask generator, built with TypeScript, Vite, pnpm, and jsPDF. All pattern generation and file export happens locally in the browser.

**Website:** https://clammet.github.io/bahtinov-pdf-generator/

## Run locally

Use Node.js 24 or newer and pnpm 12.4.1 (pinned in `package.json`). If needed, install pnpm with `npm install --global pnpm@12.4.1`.

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`. Edits reload automatically.

```sh
pnpm test     # Geometry, validation, calibration, and vector export checks
pnpm build    # Type-check and create the production site in dist/
pnpm preview  # Serve the production build locally
```

## Generate a mask

1. Enter the actual focal length and working f-stop. Sensor crop factor does not change focal length. The estimated aperture is `focal length / f-stop`; **Use for pattern** copies that estimate into the pattern diameter. Measure the physical optics and mounting surface before fabrication.
2. Set the slotted **pattern diameter** and the **final diameter**, which includes a solid outer ring. Radial border width is `(final diameter - pattern diameter) / 2`.
3. Choose automatic or manual pitch. Advanced controls set open fraction, slit angle, supports, central obstruction, and printer DPI for printability warnings.
4. Choose A4, US Letter, A3, or a custom sheet sized to the mask. Calibration is optional. A mask that does not fit blocks export: it is never silently resized. Custom paper may require a large-format printer or external PDF poster tiling at 100%; the app does not tile pages.
5. Download a vector PDF or a full-page SVG. SVG dimensions explicitly use millimetres. The preview fits the screen and is not a physical-size reference.

### Geometry and optical assumptions

The mask has one half-aperture grating at 0 degrees and two quarter-aperture gratings at plus/minus the selected angle (20 degrees by default). A horizontal support and a lower vertical support connect the slats to the border. A central obstruction adds an opaque disk, not a cut-out hole.

Automatic pitch is `focal length / Bahtinov factor`, with a default factor of 180. **Pitch means the complete open-slit plus opaque-bar period**, not just the slit width. Slit width is `pitch * open fraction`; bar width is the remainder. Factors of 150–200 are a conventional starting range. F-stop affects the aperture estimate, not the pitch formula. Manual pitch provides control over manufacturing limits and optical tradeoffs.

The period convention and typical angle can be checked against [Satoru Takagi's Bahtinov generator](https://github.com/satakagi/tribahtinovWebApps/blob/master/Bahtinov.html). No implementation code was copied. The geometry here is independently implemented using convex polygon clipping. Circular slit boundaries are approximated with a maximum radial deviation below 0.005 mm; the outer edge is a vector circle.

The SVG preview and both exports share one scene in millimetres. PDF content consists of vector paths, shapes, and text, rather than a raster screenshot. Printer resolution only controls advice, not export resolution. Finite ranges and a 2,000-period limit bound generation cost.

### Print calibration

Print the **downloaded PDF** using **Actual size / 100%**, with **Fit to page disabled**. PDF viewer preferences also request no print scaling, but printer settings must still be checked. The optional calibration area includes:

- Separate 50 mm horizontal and vertical rulers with 1 mm ticks, to detect unequal X/Y scaling.
- A 20 × 20 mm square with an inscribed circle, to check scale and distortion.
- Horizontal and vertical equal line/gap patches at 0.1, 0.2, 0.3, 0.5, and 1 mm.
- A sample at the actual mask pitch and open fraction.

Measure the ruler endpoints and square line centres. Check that fine lines remain separated in both directions. Print dimensions and detail do not guarantee optical performance: try the mask on a bright star and verify that the central diffraction spike crosses the other two at focus.

Black means opaque material to retain; white means openings. Printed paper is a cutting template. A transparency requires sufficiently opaque black printing. Remove the mask after focusing. SVG is a print sheet with white openings layered over a black disk, not a cutter-ready compound path; prepare boolean cut paths in your cutter software before fabrication.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` installs from the frozen lockfile, runs tests, builds, and deploys `dist/` on every push to `main`. Pull requests run the same checks without deployment. It also supports manual dispatch.

For a fork or a repository where Pages is not yet configured:

1. Open **Settings → Pages → Build and deployment**.
2. Set **Source** to **GitHub Actions**.
3. Push to `main`, or run **Build and deploy GitHub Pages** from the Actions tab.

See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Deployment uses GitHub's built-in token and OIDC permissions; no separate deployment secret is needed. Vite uses relative asset paths so the build works below a repository subpath or at a domain root.

## Project structure

- `src/pattern.ts`: dimensions, validation, grating clipping, and shared print-sheet scene.
- `src/export.ts`: physical-size SVG and vector PDF rendering.
- `src/main.ts`: form controls, live preview, and downloads.
- `src/style.css`: responsive interface.
- `src/pattern.test.ts`: physical geometry and export regression tests.

The UI loads optional Google Fonts, with local sans-serif fallbacks. PDF fonts are standard Helvetica. No analytics or backend is used.
