/// <reference lib="webworker" />

import { parseDiffFromFile } from "@pierre/diffs";

type DiffFile = {
  name: string;
  contents: string;
  cacheKey?: string;
};

type ParseRequestMessage = {
  type: "parse";
  requestId: number;
  oldFile: DiffFile;
  newFile: DiffFile;
};

type ParseResponseMessage =
  | {
      type: "parsed";
      requestId: number;
      data: ReturnType<typeof parseDiffFromFile>;
    }
  | {
      type: "error";
      requestId: number;
      message: string;
    };

self.addEventListener("message", (event: MessageEvent<ParseRequestMessage>) => {
  const message = event.data;
  if (message.type !== "parse") return;

  try {
    const data = parseDiffFromFile(message.oldFile, message.newFile);
    const response: ParseResponseMessage = {
      type: "parsed",
      requestId: message.requestId,
      data,
    };
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- WorkerGlobalScope.postMessage does not accept targetOrigin
    self.postMessage(response);
  } catch (error) {
    const response: ParseResponseMessage = {
      type: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- WorkerGlobalScope.postMessage does not accept targetOrigin
    self.postMessage(response);
  }
});
