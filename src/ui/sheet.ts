// Phone: bottom sheet with two snap points (peek, full), dragged by its grabber.
// Desktop: a floating card; nothing to do here except report the covered map area.

const PEEK_SHARE = 0.42; // part of the viewport the sheet covers when collapsed

export function bindSheet() {
  const sheet = document.getElementById("sheet")!;
  const grab = document.getElementById("sheet-toggle") as HTMLButtonElement;
  const phone = matchMedia("(max-width: 720px)");
  let expanded = false;

  const peekPx = () => Math.round(innerHeight * PEEK_SHARE);
  const maxOffset = () => Math.max(0, sheet.offsetHeight - peekPx());
  const setOffset = (px: number) => sheet.style.setProperty("--sheet-offset", `${px}px`);

  function snap(exp: boolean) {
    expanded = exp;
    grab.setAttribute("aria-expanded", String(exp));
    grab.querySelector(".sr-only")!.textContent = exp ? "Paneli küçült" : "Paneli büyüt";
    setOffset(exp ? 0 : maxOffset());
    document.documentElement.style.setProperty("--sheet-inset", phone.matches ? `${peekPx()}px` : "0px");
  }

  let startY = 0;
  let startOffset = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0; // px per ms, positive = down
  let moved = false;

  grab.addEventListener("pointerdown", (e) => {
    if (!phone.matches) return;
    grab.setPointerCapture(e.pointerId);
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    startOffset = expanded ? 0 : maxOffset();
    velocity = 0;
    moved = false;
    sheet.classList.add("dragging");
  });

  grab.addEventListener("pointermove", (e) => {
    if (!sheet.classList.contains("dragging")) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = e.timeStamp;
    setOffset(Math.min(maxOffset(), Math.max(0, startOffset + dy)));
  });

  const end = () => {
    if (!sheet.classList.contains("dragging")) return;
    sheet.classList.remove("dragging");
    if (!moved) return; // a tap is handled by click
    const offset = Math.min(maxOffset(), Math.max(0, startOffset + lastY - startY));
    if (Math.abs(velocity) > 0.4) snap(velocity < 0);
    else snap(offset < maxOffset() / 2);
  };
  grab.addEventListener("pointerup", end);
  grab.addEventListener("pointercancel", end);

  grab.addEventListener("click", () => {
    if (!moved) snap(!expanded);
    moved = false;
  });

  // Typing an address needs room for the suggestions.
  sheet.addEventListener("focusin", (e) => {
    if (phone.matches && (e.target as HTMLElement).closest(".place-input")) snap(true);
  });

  addEventListener("resize", () => snap(expanded));
  phone.addEventListener("change", () => snap(false));
  snap(false);

  return {
    // Map area hidden by the sheet, in px, for fitting the route into the visible part.
    insets() {
      if (phone.matches) return { left: 0, bottom: peekPx() };
      return { left: sheet.getBoundingClientRect().right, bottom: 0 };
    },
    collapse: () => phone.matches && snap(false),
  };
}
