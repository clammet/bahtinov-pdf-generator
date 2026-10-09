const starExample = (angle: number) => {
  const ray = (tilt: number, color: string) => {
    const radians = tilt * Math.PI / 180;
    const dx = Math.sin(radians) * 43;
    const dy = Math.cos(radians) * 43;
    return `<line x1="${50 - dx}" y1="${50 - dy}" x2="${50 + dx}" y2="${50 + dy}" stroke="${color}" stroke-width="5" opacity="0.12"/>
      <line x1="${50 - dx}" y1="${50 - dy}" x2="${50 + dx}" y2="${50 + dy}" stroke="${color}" stroke-width="1.2"/>`;
  };
  return `<figure>
    <svg viewBox="0 0 100 100" role="img" aria-label="In-focus star with a ${angle} degree slit angle: the two angled spikes are ${angle * 2} degrees apart.">
      <defs><radialGradient id="star-glow-${angle}"><stop stop-color="#ffffff" stop-opacity="0.8"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>
      ${ray(-angle, "#c3ed8e")}${ray(angle, "#c3ed8e")}${ray(0, "#ffffff")}
      <circle cx="50" cy="50" r="10" fill="url(#star-glow-${angle})"/>
      <circle cx="50" cy="50" r="2.3" fill="#ffffff"/>
    </svg>
    <figcaption><strong>${angle}° slit angle</strong><span>${angle * 2}° between angled spikes</span></figcaption>
  </figure>`;
};

export const anglePreview = `
  <strong class="angle-preview-title">How slit angle changes the star</strong>
  <div class="angle-examples">${[10, 20, 35].map(starExample).join("")}</div>
  <p>Higher angle opens the X; lower angle brings the spikes closer together. At focus, all three lines meet at the star.</p>
  <p class="angle-preview-note">Schematic: white = centre spike, green = angled pair. Brightness and length are held constant to compare angles; this is not a simulated camera image.</p>`;

export function setupAnglePreview(button: HTMLButtonElement, popup: HTMLElement) {
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelClose = () => clearTimeout(closeTimer);
  const isOpen = () => popup.matches(":popover-open");
  const position = () => {
    if (!isOpen()) return;
    const anchor = button.getBoundingClientRect();
    const margin = 12;
    // Exclude the scrollbar so the panel also fits narrow desktop viewports.
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    popup.style.maxWidth = `${Math.max(0, viewportWidth - margin * 2)}px`;
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    const gap = 10;
    if (anchor.bottom < 0 || anchor.top > viewportHeight) {
      popup.hidePopover();
      return;
    }
    const left = Math.max(margin, Math.min(anchor.right + gap, viewportWidth - width - margin));
    const top = anchor.bottom + gap + height <= viewportHeight - margin
      ? anchor.bottom + gap
      : Math.max(margin, anchor.top - height - gap);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  };
  const show = () => {
    cancelClose();
    if (!isOpen()) popup.showPopover();
    position();
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer = setTimeout(() => {
      if (isOpen() && !button.matches(":hover, :focus-visible") && !popup.matches(":hover"))
        popup.hidePopover();
    }, 200);
  };
  button.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") show();
  });
  button.addEventListener("pointerleave", scheduleClose);
  button.addEventListener("focus", () => {
    if (button.matches(":focus-visible")) show();
  });
  button.addEventListener("blur", scheduleClose);
  popup.addEventListener("pointerenter", cancelClose);
  popup.addEventListener("pointerleave", scheduleClose);
  popup.addEventListener("toggle", () => {
    button.setAttribute("aria-expanded", String(isOpen()));
    if (isOpen()) position();
    else cancelClose();
  });
  // Native popover handles click/tap opening, outside clicks and Escape.
  window.addEventListener("resize", position);
  document.addEventListener("scroll", position, true);
}
