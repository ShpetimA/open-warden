import { useRef } from "react";
import { useThrottledValue } from "@tanstack/react-pacer";

const DIFF_PREVIEW_THROTTLE_MS = 75;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shallowEqual(left: unknown, right: unknown) {
  if (Object.is(left, right)) {
    return true;
  }

  if (!isObjectLike(left) || !isObjectLike(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => Object.is(left[key], right[key]));
}

export function useThrottledDiffSelection<T>(value: T): T {
  const stableValueRef = useRef(value);

  if (!shallowEqual(stableValueRef.current, value)) {
    stableValueRef.current = value;
  }

  const [throttledValue] = useThrottledValue(stableValueRef.current, {
    leading: true,
    trailing: true,
    wait: DIFF_PREVIEW_THROTTLE_MS,
  });

  return throttledValue;
}
