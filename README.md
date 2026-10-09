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

1. Enter the actual focal length of the optical setup, including reducers or Barlows. Sensor crop factor does not change focal length. Estimate the entrance pupil using `focal length / f-number`, or select **Known aperture / telescope override** to enter a clear aperture directly without needing an f-number. The estimate is not the front-element diameter or a recommended physical mask size. Optical settings never resize the mask.
2. Set the slotted **pattern diameter** to cover the usable opening at the mounting position and the **outside diameter** for physical fit, including the solid outer ring. Radial border width is `(outside diameter - pattern diameter) / 2`. Initial dimensions are examples, not a verified lens fit. Measure your hood, holder or telescope before fabrication.
3. Optionally select a camera preset or enter a custom pixel size to predict diffraction spacing. Choose automatic or manual pitch. Under **Print & fabrication**, select a printer preset or enter a minimum slit/bar width. Advanced pattern controls set open fraction, slit angle, supports, and central obstruction.
4. Choose A4, US Letter, A3, or a custom sheet sized to the mask. Calibration is optional. A mask that does not fit blocks export: it is never silently resized. Custom paper may require a large-format printer or external PDF poster tiling at 100%; the app does not tile pages.
5. Download a vector PDF or a full-page SVG. SVG dimensions explicitly use millimetres. The preview fits the screen and is not a physical-size reference.

### Geometry and optical assumptions

The mask has one half-aperture grating at 0 degrees and two quarter-aperture gratings at plus/minus the selected angle (20 degrees by default). In **Cut-out mask** layout, a horizontal support and a lower vertical support connect the slats to the border. In **Transparency** layout, these ribs are omitted: opaque bars must be printed on optically clear film, which supports the pattern. This layout is not a cut-out template; ordinary paper will not work as a transmissive mask. The inactive cut-out support width is preserved when switching layouts. A central obstruction adds an opaque disk, not a cut-out hole.

Automatic pitch starts at `focal length / Bahtinov factor`, with a default factor of 180. **Pitch means the complete open-slit plus opaque-bar period**, not just the slit width. Slit width is `pitch * open fraction`; bar width is the remainder. Factors of 150–200 are a conventional starting range. F-number affects the aperture estimate, not the pitch formula.

The minimum permitted pitch is `minimum width / min(open fraction, 1 - open fraction)`. Automatic mode increases pitch to meet this constraint and explains the adjustment. Manual mode preserves the requested pitch but blocks export if either the slit or bar is below the minimum. These widths describe the grating's full-width interior features; clipped slit ends can taper below the minimum at the rim or supports. The low-period warning uses `min(pattern diameter, optical aperture) / pitch` as an approximate illuminated-period count, rather than the full mask diameter. Central obstruction and support geometry can further reduce usable grating area.

Printer presets use at least three dots per slit/bar: `3 * 25.4 / DPI` mm, rounded up to four decimal places. Available presets are 300, 600, 1200, and 2400 DPI; the default is 600 DPI (0.127 mm). This is a starting estimate, not a guarantee of resolved gaps or structural strength. Changing either width or DPI selects Custom. For cutting templates, set width to the reliable capability of the tool/material. Inspect the calibration targets and adjust accordingly.

### Wide-angle camera lenses

The **Sigma 14 mm f/1.8 DG HSM Art (Canon EF)** starting point sets 14 mm, f/1.8, factor 180, 50% open, ±20° slits, no central obstruction, automatic pitch and the transparency layout. It preserves camera, printer capabilities, minimum feature width and physical dimensions. Selecting a finer printer preset is a separate choice; use real printer resolution (the lower axis if unequal), not interpolated resolution or image PPI.

[Sigma's specifications](https://www.sigma-global.com/en/lenses/a017_14_18/) describe an 80 mm front element, list no front filter size, and give a 95.4 mm body diameter. None of these establishes the needed mask diameter at your chosen mounting position. Measure the hood/holder and mount with clearance from the protruding front element. No mounting diameter is inferred from the model. The 7.78 mm entrance-pupil estimate is kept separate from these mechanical measurements.

At 14 mm and factor 180, the optical starting pitch is approximately 0.0778 mm, with 0.0389 mm slits/bars at 50% open. Three dots across those features requires approximately 1,960 DPI in both axes; actual print quality and opacity still need verification. The default 600 DPI minimum instead produces 0.254 mm pitch: roughly 31% of the starting first-order separation, or 4.6 pixels on a Canon 6D at 550 nm. Increasing physical pattern diameter does not restore that separation. The UI shows the starting feature width and estimated DPI requirement before fabrication constraints, plus the resulting separation when camera pixel size is known.

Guidance appears for estimated-aperture lenses at 50 mm or shorter. This is an advisory interface threshold, not a physical cutoff. It recommends careful mask centring and a star near the image centre so the small pupil samples all three grating regions, with inspection at full image resolution. The aperture/period model does not simulate pupil position, hood clipping or off-axis vignetting. Additional advisory warnings flag less than 5 pixels of first-order offset and support ribs wider than 10% of the estimated illuminated diameter. None is a pass/fail performance test. If useful spikes cannot be resolved, use magnified live view or a purpose-made fine-pattern aid; [Lonely Speck's SharpStar](https://www.lonelyspeck.com/sharpstar/) illustrates a commercial approach to wide-angle lens focusing, not a validation of this generator.

### Camera prediction

Camera selection does not change pitch or impose an arbitrary target separation. The predicted first-order offset from the star centre is `focal length * 0.55 / (pitch * pixel size)` sensor pixels, with focal length and pitch in millimetres and pixel size in micrometres. It uses the actual pitch after fabrication constraints, assumes 550 nm light and small diffraction angles, and is not the full visible spike length or a guarantee of focus quality. Filters and live-view rescaling affect appearance. Presets are unbinned; use Custom for another camera or effective pixel size after binning. The calculation follows the [diffraction-grating equation](https://openstax.org/books/university-physics-volume-3/pages/4-4-diffraction-gratings).

Preset sources:

- [Canon EOS 6D](https://www.usa.canon.com/support/p/eos-6d): 6.55 µm.
- [Canon EOS 5D Mark IV](https://www.canon.ca/en/product?name=EOS_5D_Mark_IV): 5.36 µm.
- [Nikon D750](https://nij.nikon.com/products/lineup/slr/d750/spec.html): approximately 5.97 µm, calculated from 35.9 mm / 6016 pixels.
- [ZWO ASI533 MC/MM Pro](https://us.zwoastro.com/collections/dso_cooled_cameras/products/asi533-pro-series): 3.76 µm.

The period convention and typical angle can be checked against [Satoru Takagi's Bahtinov generator](https://github.com/satakagi/tribahtinovWebApps/blob/master/Bahtinov.html). No implementation code was copied. The geometry here is independently implemented using convex polygon clipping. Circular slit boundaries are approximated with a maximum radial deviation below 0.005 mm; the outer edge is a vector circle.

The SVG preview and both exports share one scene in millimetres. PDF content consists of vector paths, shapes, and text, rather than a raster screenshot. Printer presets set physical feature limits; DPI also controls printability advice, never export resolution. Finite ranges and a 2,000-period limit bound generation cost.

### Print calibration

Print the **downloaded PDF** using **Actual size / 100%**, with **Fit to page disabled**. PDF viewer preferences also request no print scaling, but printer settings must still be checked. The optional calibration area includes:

- Separate 50 mm horizontal and vertical rulers with 1 mm ticks, to detect unequal X/Y scaling.
- A 20 × 20 mm square with an inscribed circle, to check scale and distortion.
- Horizontal and vertical equal line/gap patches at 0.1, 0.2, 0.3, 0.5, and 1 mm.
- Samples in both printer axes at the actual mask pitch and open fraction, including features below 0.1 mm.

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
- `src/presets.ts`: camera pixel sizes and printer minimum-width presets.
- `src/style.css`: responsive interface.
- `src/pattern.test.ts`: physical geometry and export regression tests.

The UI loads optional Google Fonts, with local sans-serif fallbacks. Interface icons use Lucide, bundled locally with only the selected icons. PDF fonts are standard Helvetica. No analytics or backend is used.
