const STORAGE_PREFIX = "fur-panel-section-";

function loadOpen(id: string, defaultOpen: boolean): boolean {
  const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
  if (raw === null) return defaultOpen;
  return raw === "1";
}

function saveOpen(id: string, open: boolean): void {
  sessionStorage.setItem(STORAGE_PREFIX + id, open ? "1" : "0");
}

export function initCollapsiblePanel(): void {
  const sections = document.querySelectorAll<HTMLElement>(".panel-section.collapsible");

  for (const section of sections) {
    const id = section.dataset.section;
    if (!id) continue;

    const toggle = section.querySelector<HTMLButtonElement>(".section-toggle");
    const body = section.querySelector<HTMLElement>(".section-body");
    const inner = section.querySelector<HTMLElement>(".section-body-inner");
    if (!toggle || !body) continue;

    const defaultOpen = section.dataset.defaultOpen === "open";
    let open = loadOpen(id, defaultOpen);

    const apply = () => {
      section.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      body.setAttribute("aria-hidden", open ? "false" : "true");
      if (inner) {
        inner.toggleAttribute("inert", !open);
      }
    };

    apply();

    toggle.addEventListener("click", () => {
      open = !open;
      saveOpen(id, open);
      apply();
    });
  }
}
