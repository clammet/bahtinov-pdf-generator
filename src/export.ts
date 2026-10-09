import type { Sheet, Shape } from "./pattern";
import { fmt, maskNames } from "./pattern";

const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function svgShape(s: Shape): string {
  switch (s.type) {
    case "polygon":
      return `<polygon points="${s.points.map((p) => `${fmt(p.x, 5)},${fmt(p.y, 5)}`).join(" ")}" fill="${s.fill}"/>`;
    case "circle":
      return `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.fill}" stroke="${s.stroke ?? "none"}" stroke-width="${s.weight ?? 0}"/>`;
    case "rect":
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.fill}" stroke="${s.stroke ?? "none"}" stroke-width="${s.weight ?? 0}"/>`;
    case "line":
      return `<line x1="${s.x}" y1="${s.y}" x2="${s.x2}" y2="${s.y2}" stroke="#000000" stroke-width="${s.weight}"/>`;
    case "text":
      return `<text x="${s.x}" y="${s.y}" font-family="Helvetica, Arial, sans-serif" font-size="${s.size}" font-weight="${s.bold ? 700 : 400}" fill="#000000">${esc(s.text)}</text>`;
  }
}
export function toSvg(sheet: Sheet): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" viewBox="0 0 ${sheet.width} ${sheet.height}" role="img" aria-label="${maskNames[sheet.maskType]} mask print sheet"><title>${maskNames[sheet.maskType]} mask — print at actual size</title><rect width="100%" height="100%" fill="white"/>${sheet.shapes.map(svgShape).join("")}</svg>`;
}
export async function toPdf(sheet: Sheet): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: sheet.width > sheet.height ? "landscape" : "portrait",
    unit: "mm",
    format: [sheet.width, sheet.height],
    compress: true,
    floatPrecision: 8,
  });
  doc.setProperties({
    title: `${maskNames[sheet.maskType]} focusing mask`,
    subject: "Print at 100% / Actual size",
    creator: "Focusing mask generator",
  });
  doc.setDisplayMode("fullpage");
  doc.viewerPreferences({ PrintScaling: "None" });
  for (const s of sheet.shapes) {
    if (s.type === "text") {
      doc.setFont("helvetica", s.bold ? "bold" : "normal");
      doc.setFontSize((s.size * 72) / 25.4);
      doc.setTextColor("#000000");
      doc.text(s.text, s.x, s.y);
    } else if (s.type === "line") {
      doc.setDrawColor("#000000");
      doc.setLineWidth(s.weight);
      doc.line(s.x, s.y, s.x2, s.y2);
    } else {
      doc.setFillColor(s.fill === "none" ? "#ffffff" : s.fill);
      if (s.type === "polygon") {
        doc.path([
          ...s.points.map((p, i) => ({
            op: i === 0 ? "m" : "l",
            c: [p.x, p.y],
          })),
          { op: "h", c: [] },
        ]);
        doc.fill();
      } else {
        doc.setDrawColor(s.stroke ?? "#000000");
        doc.setLineWidth(s.weight ?? 0);
        const style = s.fill === "none" ? "S" : s.stroke ? "FD" : "F";
        if (s.type === "circle") doc.circle(s.x, s.y, s.r, style);
        else doc.rect(s.x, s.y, s.w, s.h, style);
      }
    }
  }
  return doc.output("blob");
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
