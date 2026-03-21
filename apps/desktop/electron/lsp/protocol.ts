type JsonRpcId = number | string | null;

type JsonRpcResponseError = {
  code: number;
  message: string;
};

type JsonRpcMessage =
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      method: string;
      params?: unknown;
    }
  | {
      jsonrpc: "2.0";
      method: string;
      params?: unknown;
    }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      result?: unknown;
      error?: JsonRpcResponseError;
    };

type JsonRpcProtocolOptions = {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  onNotification(method: string, params: unknown): void;
  onRequest(id: JsonRpcId, method: string, params: unknown): void;
  onResponse(id: JsonRpcId, result: unknown, error?: JsonRpcResponseError): void;
  onTransportError(error: unknown): void;
};

export class JsonRpcProtocol {
  private buffer = Buffer.alloc(0);
  private readonly input: NodeJS.ReadableStream;
  private readonly output: NodeJS.WritableStream;
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
    this.input.on("error", this.onTransportError);
  }

  dispose() {
    this.input.off("data", this.onData);
    this.input.off("error", this.onTransportError);
  }

  sendNotification(method: string, params?: unknown) {
    this.sendMessage({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  sendRequest(id: JsonRpcId, method: string, params?: unknown) {
    this.sendMessage({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
  }

  sendResponse(id: JsonRpcId, result: unknown) {
    this.sendMessage({
      jsonrpc: "2.0",
      id,
      result,
    });
  }

  sendErrorResponse(id: JsonRpcId, error: JsonRpcResponseError) {
    this.sendMessage({
      jsonrpc: "2.0",
      id,
      error,
    });
  }

  private readonly onData = (chunk: Buffer | string) => {
    const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.buffer = Buffer.concat([this.buffer, nextChunk]);
    this.readBufferedMessages();
  };

  private readBufferedMessages() {
    while (true) {
      const headerTerminatorIndex = this.buffer.indexOf("\r\n\r\n");
      if (headerTerminatorIndex < 0) {
        return;
      }

      const headerText = this.buffer.subarray(0, headerTerminatorIndex).toString("ascii");
      const contentLength = this.parseContentLength(headerText);
      if (contentLength === null) {
        this.buffer = Buffer.alloc(0);
        this.onTransportError(new Error("Invalid LSP message header."));
        return;
      }

      const messageStartIndex = headerTerminatorIndex + 4;
      const messageEndIndex = messageStartIndex + contentLength;
      if (this.buffer.length < messageEndIndex) {
        return;
      }

      const body = this.buffer.subarray(messageStartIndex, messageEndIndex).toString("utf8");
      this.buffer = this.buffer.subarray(messageEndIndex);
      this.dispatchMessage(body);
    }
  }

  private parseContentLength(headerText: string) {
    const headers = headerText.split("\r\n");

    for (const header of headers) {
      const separatorIndex = header.indexOf(":");
      if (separatorIndex < 0) {
        continue;
      }

      const name = header.slice(0, separatorIndex).trim().toLowerCase();
      if (name !== "content-length") {
        continue;
      }

      const rawValue = header.slice(separatorIndex + 1).trim();
      const contentLength = Number.parseInt(rawValue, 10);
      return Number.isFinite(contentLength) ? contentLength : null;
    }

    return null;
  }

  private dispatchMessage(body: string) {
    try {
      const message = JSON.parse(body) as JsonRpcMessage;

      if ("method" in message && "id" in message) {
        this.onRequest(message.id, message.method, message.params);
        return;
      }

      if ("method" in message) {
        this.onNotification(message.method, message.params);
        return;
      }

      this.onResponse(message.id, message.result, message.error);
    } catch (error) {
      this.onTransportError(error);
    }
  }

  private sendMessage(message: JsonRpcMessage) {
    const encodedMessage = Buffer.from(JSON.stringify(message), "utf8");
    const encodedHeader = Buffer.from(`Content-Length: ${encodedMessage.length}\r\n\r\n`, "ascii");
    this.output.write(Buffer.concat([encodedHeader, encodedMessage]));
  }
}
