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
  if (targetIndex < 0) return;

  const regionElement = document.querySelector<HTMLElement>(`[data-nav-region="${region}"]`);
  if (!regionElement) return;

  const targetItem = regionElement.querySelector<HTMLElement>(
    `[data-nav-index="${targetIndex}"]`,
  );
  targetItem?.scrollIntoView({ block: "nearest" });
}
