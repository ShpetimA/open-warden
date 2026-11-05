import { expect, test } from "vitest";

import { RendererRecovery } from "./rendererRecovery";

test("a failed renderer bypasses saving while one explicit recovery choice is pending", async () => {
  const actions: string[] = [];
  let choose: ((choice: "reload" | "close") => void) | undefined;
  const recovery = new RendererRecovery({
    prompt: () =>
      new Promise((resolve) => {
        choose = resolve;
      }),
    reload: () => actions.push("reload"),
    close: () => actions.push("close"),
    isClosed: () => false,
  });

  const first = recovery.exited(true);
  const second = recovery.exited(true);

  expect(recovery.isUnavailable()).toBe(true);
  expect(first).toBe(second);
  choose?.("reload");
  await first;

  expect(actions).toEqual(["reload"]);
  expect(recovery.isUnavailable()).toBe(true);
  recovery.loaded();
  expect(recovery.isUnavailable()).toBe(false);
});

test("a failed window can close without reloading and shutdown never opens a recovery prompt", async () => {
  const actions: string[] = [];
  const recovery = new RendererRecovery({
    prompt: async () => {
      actions.push("prompt");
      return "close";
    },
    reload: () => actions.push("reload"),
    close: () => actions.push("close"),
    isClosed: () => false,
  });

  await recovery.exited(false);
  expect(actions).toEqual([]);
  expect(recovery.isUnavailable()).toBe(true);

  await recovery.exited(true);
  expect(actions).toEqual(["prompt", "close"]);
});

test("an unavailable prompt closes the failed window and a closed window gets no action", async () => {
  const actions: string[] = [];
  let closed = false;
  const recovery = new RendererRecovery({
    prompt: async () => {
      throw new Error("Dialog unavailable");
    },
    reload: () => actions.push("reload"),
    close: () => actions.push("close"),
    isClosed: () => closed,
  });

  await recovery.exited(true);
  expect(actions).toEqual(["close"]);

  closed = true;
  await recovery.exited(true);
  expect(actions).toEqual(["close"]);
});
