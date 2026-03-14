import { useThrottledValue } from "@tanstack/react-pacer";

const DIFF_PREVIEW_THROTTLE_MS = 75;

export function useThrottledDiffSelection<T>(value: T): T {
  const [throttledValue] = useThrottledValue(value, {
    leading: true,
    trailing: true,
    wait: DIFF_PREVIEW_THROTTLE_MS,
  });

  return throttledValue;
}
