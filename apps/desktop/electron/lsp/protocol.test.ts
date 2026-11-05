import { PassThrough, Writable } from "node:stream";
import { expect, test } from "vitest";

import { JsonRpcProtocol } from "./protocol";

function fixture(output = new PassThrough()) {
  const input = new PassThrough();
  const errors: unknown[] = [];
  const messages: unknown[] = [];
  const protocol = new JsonRpcProtocol({
    input,
    output,
    onNotification: (method, params) => messages.push({ method, params }),
    onRequest: (id, method, params) => messages.push({ id, method, params }),
    onResponse: (id, result, error) => messages.push({ id, result, error }),
    onTransportError: (error) => errors.push(error),
  });

  return { input, output, errors, messages, protocol };
}

function frame(message: unknown) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

test("reads fragmented and coalesced JSON-RPC messages", () => {
  const { input, messages, errors, protocol } = fixture();
  const first = frame({ jsonrpc: "2.0", method: "ready", params: { text: "你好" } });

  input.write(first.slice(0, 12));
  expect(messages).toEqual([]);
  input.write(first.slice(12) + frame({ jsonrpc: "2.0", id: 1, result: null }));

  expect(messages).toEqual([
    { method: "ready", params: { text: "你好" } },
    { id: 1, result: null, error: undefined },
  ]);
  expect(errors).toEqual([]);
  protocol.dispose();
});

test.each(["-100", "0", "12garbage", "1.5", "16777217", "9007199254740992"])(
  "rejects invalid message length %s and stops consuming the stream",
  (length) => {
    const { input, errors, messages } = fixture();

    input.write(`Content-Length: ${length}\r\n\r\n`);
    input.write(frame({ jsonrpc: "2.0", method: "ignored" }));

    expect(errors).toHaveLength(1);
    expect(messages).toEqual([]);
    expect(input.listenerCount("data")).toBe(0);
  },
);

test("rejects oversized incomplete headers and duplicate lengths", () => {
  for (const header of ["x".repeat(8193), "Content-Length: 2\r\nContent-Length: 3\r\n\r\n{}"]) {
    const { input, errors } = fixture();

    input.write(header);

    expect(errors).toHaveLength(1);
    expect(input.listenerCount("data")).toBe(0);
  }
});

test.each([null, [], { jsonrpc: "1.0", method: "wrong-version" }, { jsonrpc: "2.0", method: 7 }])(
  "rejects invalid JSON-RPC message %j",
  (message) => {
    const { input, errors, messages } = fixture();

    input.write(frame(message));

    expect(errors).toHaveLength(1);
    expect(messages).toEqual([]);
  },
);

test("reports an asynchronous broken output pipe once without an unhandled stream error", async () => {
  const output = new Writable({
    write(_chunk, _encoding, complete) {
      complete(Object.assign(new Error("Pipe closed"), { code: "EPIPE" }));
    },
  });
  const closed = new Promise<void>((resolve) => output.once("close", resolve));
  const input = new PassThrough();
  const errors: unknown[] = [];
  const protocol = new JsonRpcProtocol({
    input,
    output,
    onNotification() {},
    onRequest() {},
    onResponse() {},
    onTransportError: (error) => errors.push(error),
  });

  protocol.sendNotification("textDocument/didChange", {});
  await closed;

  expect(errors).toHaveLength(1);
  expect(input.listenerCount("data")).toBe(0);
  expect(output.listenerCount("error")).toBe(0);
});

test("absorbs late pipe errors after disposal while the child exits", async () => {
  const { input, output, protocol, errors } = fixture();
  const closed = new Promise<void>((resolve) => output.once("close", resolve));

  protocol.dispose();
  output.destroy(new Error("Late pipe error"));
  input.write(frame({ jsonrpc: "2.0", method: "ignored" }));
  await closed;

  expect(errors).toEqual([]);
  expect(output.listenerCount("error")).toBe(0);
});
