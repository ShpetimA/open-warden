import type { Readable, Writable } from "node:stream";
import { z } from "zod";

const idSchema = z.union([z.number().int(), z.string(), z.null()]);
const responseErrorSchema = z.object({ code: z.number().int(), message: z.string() });
const messageSchema = z.union([
  z.object({
    jsonrpc: z.literal("2.0"),
    id: idSchema,
    method: z.string().min(1),
    params: z.unknown().optional(),
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    method: z.string().min(1),
    params: z.unknown().optional(),
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    id: idSchema,
    result: z.unknown().optional(),
    error: responseErrorSchema.optional(),
  }),
]);

type JsonRpcId = z.infer<typeof idSchema>;
type JsonRpcResponseError = z.infer<typeof responseErrorSchema>;
type JsonRpcMessage = z.infer<typeof messageSchema>;

type JsonRpcProtocolOptions = {
  input: Readable;
  output: Writable;
  onNotification(method: string, params: unknown): void;
  onRequest(id: JsonRpcId, method: string, params: unknown): void;
  onResponse(id: JsonRpcId, result: unknown, error?: JsonRpcResponseError): void;
  onTransportError(error: unknown): void;
};

const MAX_HEADER_BYTES = 8 * 1024;
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

export class JsonRpcProtocol {
  private buffer = Buffer.alloc(0);
  private disposed = false;
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly onNotification: JsonRpcProtocolOptions["onNotification"];
  private readonly onRequest: JsonRpcProtocolOptions["onRequest"];
  private readonly onResponse: JsonRpcProtocolOptions["onResponse"];
  private readonly onTransportError: JsonRpcProtocolOptions["onTransportError"];

  constructor({
    input,
    output,
    onNotification,
    onRequest,
    onResponse,
    onTransportError,
  }: JsonRpcProtocolOptions) {
    this.input = input;
    this.output = output;
    this.onNotification = onNotification;
    this.onRequest = onRequest;
    this.onResponse = onResponse;
    this.onTransportError = onTransportError;

    this.input.on("data", this.onData);
    this.input.on("error", this.fail);
    this.output.on("error", this.fail);

    // Pipe errors can arrive after disposal while the child process is stopping.
    this.input.once("close", () => this.input.off("error", this.fail));
    this.output.once("close", () => this.output.off("error", this.fail));
  }

  dispose() {
    this.disposed = true;
    this.buffer = Buffer.alloc(0);
    this.input.off("data", this.onData);
  }

  private readonly fail = (error: unknown) => {
    if (this.disposed) return;

    this.dispose();
    this.onTransportError(error);
  };

  sendNotification(method: string, params?: unknown) {
    this.sendMessage({ jsonrpc: "2.0", method, params });
  }

  sendRequest(id: JsonRpcId, method: string, params?: unknown) {
    this.sendMessage({ jsonrpc: "2.0", id, method, params });
  }

  sendResponse(id: JsonRpcId, result: unknown) {
    this.sendMessage({ jsonrpc: "2.0", id, result });
  }

  sendErrorResponse(id: JsonRpcId, error: JsonRpcResponseError) {
    this.sendMessage({ jsonrpc: "2.0", id, error });
  }

  private readonly onData = (chunk: Buffer | string) => {
    if (this.disposed) return;

    const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    if (this.buffer.length + nextChunk.length > MAX_HEADER_BYTES + MAX_MESSAGE_BYTES) {
      this.fail(new Error("LSP message exceeds the buffer limit."));
      return;
    }

    this.buffer = Buffer.concat([this.buffer, nextChunk]);
    this.readBufferedMessages();
  };

  private readBufferedMessages() {
    while (!this.disposed) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");

      if (headerEnd < 0) {
        if (this.buffer.length > MAX_HEADER_BYTES)
          this.fail(new Error("LSP header exceeds the limit."));
        return;
      }

      if (headerEnd > MAX_HEADER_BYTES) {
        this.fail(new Error("LSP header exceeds the limit."));
        return;
      }

      const contentLength = this.parseContentLength(
        this.buffer.subarray(0, headerEnd).toString("ascii"),
      );

      if (contentLength === null) {
        this.fail(new Error("Invalid LSP message length."));
        return;
      }

      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (this.buffer.length < bodyEnd) return;

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.subarray(bodyEnd);
      this.dispatchMessage(body);
    }
  }

  private parseContentLength(headerText: string): number | null {
    let length: number | null = null;

    for (const header of headerText.split("\r\n")) {
      const separator = header.indexOf(":");
      if (separator < 0 || header.slice(0, separator).trim().toLowerCase() !== "content-length")
        continue;

      const value = header.slice(separator + 1).trim();
      if (length !== null || !/^\d+$/.test(value)) return null;

      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_MESSAGE_BYTES) return null;

      length = parsed;
    }

    return length;
  }

  private dispatchMessage(body: string) {
    try {
      const raw: unknown = JSON.parse(body);
      const message = messageSchema.parse(raw);

      if ("method" in message) {
        if ("id" in message) this.onRequest(message.id, message.method, message.params);
        else this.onNotification(message.method, message.params);
        return;
      }

      this.onResponse(message.id, message.result, message.error);
    } catch (cause) {
      this.fail(cause);
    }
  }

  private sendMessage(message: JsonRpcMessage) {
    if (this.disposed) return;

    try {
      const body = Buffer.from(JSON.stringify(message), "utf8");
      const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
      this.output.write(Buffer.concat([header, body]));
    } catch (cause) {
      this.fail(cause);
    }
  }
}
