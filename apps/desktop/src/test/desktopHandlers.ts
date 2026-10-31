import { captureDesktopOperation, type DesktopResult } from "@/platform/desktop/failure";
import type { DesktopValue } from "@/platform/desktop/contracts";

type Replies<T> = {
  [Key in keyof T]: T[Key] extends (...args: infer Args) => infer Reply
    ? Key extends `on${string}`
      ? T[Key]
      : (...args: Args) => Promise<DesktopResult<DesktopValue<Awaited<Reply>>>>
    : never;
};

export function desktopHandlers<T extends object>(handlers: T): Replies<T> {
  const replies = Object.fromEntries(
    Object.entries(handlers).map(([method, handler]) => [
      method,
      method.startsWith("on")
        ? handler
        : (...args: unknown[]) => captureDesktopOperation(method, () => handler(...args)),
    ]),
  );
  // SAFETY: the test adapter preserves each handler’s arguments and wraps its result at the bridge seam.
  return replies as Replies<T>;
}
