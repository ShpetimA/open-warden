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

  const navItems = Array.from(regionElement.querySelectorAll<HTMLElement>("[data-nav-index]"));
  const targetItem = navItems.find((item) => Number(item.dataset.navIndex) === targetIndex);
  targetItem?.scrollIntoView({ block: "nearest" });
}
