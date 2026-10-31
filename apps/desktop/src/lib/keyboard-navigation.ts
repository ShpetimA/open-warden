import { z } from "zod";

export const VIRTUAL_NAVIGATION_EVENT = "virtual-list-navigation";
export const virtualNavigationSchema = z.object({
  index: z.number().int().nonnegative(),
  focus: z.boolean(),
});

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
  const target = getKeyboardNavItem(region, targetIndex);
  if (target) target.scrollIntoView({ block: "nearest" });
  else requestVirtualNavigation(region, targetIndex, false);
}

export function focusKeyboardNavItem(region: string, targetIndex: number): void {
  const targetItem = getKeyboardNavItem(region, targetIndex);
  if (!targetItem) requestVirtualNavigation(region, targetIndex, true);
  targetItem?.scrollIntoView({ block: "nearest" });
  targetItem?.focus({ preventScroll: true });
}

function requestVirtualNavigation(region: string, index: number, focus: boolean) {
  if (index < 0) return;
  document
    .querySelector(`[data-nav-region="${region}"]`)
    ?.dispatchEvent(new CustomEvent(VIRTUAL_NAVIGATION_EVENT, { detail: { index, focus } }));
}

function getKeyboardNavItem(region: string, targetIndex: number): HTMLElement | null {
  if (targetIndex < 0) return null;

  const regionElement = document.querySelector<HTMLElement>(`[data-nav-region="${region}"]`);
  if (!regionElement) return null;

  return regionElement.querySelector<HTMLElement>(`[data-nav-index="${targetIndex}"]`);
}
