export interface MenuItem {
  label: string;
  hint?: string; // smaller text on the right
  action(): void;
}

let open: { el: HTMLElement; close(): void } | null = null;

export const closeMenu = () => open?.close();

// Context menu at a screen point, like a map app's right-click menu. Closes on a pick, Escape,
// a click elsewhere, scroll or resize. Arrow keys move between items.
export function openMenu(x: number, y: number, items: MenuItem[], label: string) {
  closeMenu();
  const el = document.createElement("div");
  el.className = "map-menu";
  el.setAttribute("role", "menu");
  el.setAttribute("aria-label", label);
  const buttons = items.map((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.textContent = it.label;
    if (it.hint) {
      const h = document.createElement("span");
      h.className = "map-menu-hint";
      h.textContent = it.hint;
      b.append(h);
    }
    b.addEventListener("click", () => {
      close();
      it.action();
    });
    return b;
  });
  el.append(...buttons);
  document.body.append(el);
  // Keep it inside the viewport.
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;

  const onKey = (e: KeyboardEvent) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") buttons[(i + 1) % buttons.length].focus();
    else if (e.key === "ArrowUp") buttons[(i - 1 + buttons.length) % buttons.length].focus();
    else return;
    e.preventDefault();
  };
  const onDown = (e: Event) => {
    if (!el.contains(e.target as Node)) close();
  };
  function close() {
    el.remove();
    removeEventListener("keydown", onKey, true);
    removeEventListener("pointerdown", onDown, true);
    removeEventListener("resize", close);
    removeEventListener("wheel", close, true);
    if (open?.el === el) open = null;
  }
  addEventListener("keydown", onKey, true);
  addEventListener("pointerdown", onDown, true);
  addEventListener("resize", close);
  addEventListener("wheel", close, true);
  open = { el, close };
  buttons[0]?.focus();
}
