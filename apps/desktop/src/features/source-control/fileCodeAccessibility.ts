export function makeFileCodeFocusable(node: HTMLElement) {
  const columns = node.shadowRoot?.querySelectorAll<HTMLElement>("[data-code]") ?? [];

  for (const column of columns) {
    column.tabIndex = 0;
    column.setAttribute("role", "region");
    column.setAttribute("aria-label", "File contents");
  }
}
