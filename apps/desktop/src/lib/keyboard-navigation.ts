export function getWrappedNavigationIndex(
  activeIndex: number,
  itemCount: number,
  goForward: boolean,
): number {
  if (itemCount <= 0) return -1;
  if (activeIndex < 0) return goForward ? 0 : itemCount - 1;
  if (goForward) return (activeIndex + 1) % itemCount;
  return (activeIndex - 1 + itemCount) % itemCount;
}

export function scrollKeyboardNavItemIntoView(region: string, targetIndex: number): void {
  getKeyboardNavItem(region, targetIndex)?.scrollIntoView({ block: "nearest" });
}

export function focusKeyboardNavItem(region: string, targetIndex: number): void {
  const targetItem = getKeyboardNavItem(region, targetIndex);
  targetItem?.scrollIntoView({ block: "nearest" });
  targetItem?.focus({ preventScroll: true });
}

function getKeyboardNavItem(region: string, targetIndex: number): HTMLElement | null {
  if (targetIndex < 0) return null;

  const regionElement = document.querySelector<HTMLElement>(`[data-nav-region="${region}"]`);
  if (!regionElement) return null;

  return regionElement.querySelector<HTMLElement>(`[data-nav-index="${targetIndex}"]`);
}
