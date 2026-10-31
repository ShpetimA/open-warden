import { appendFileSync } from "node:fs";

const eventLogPath = process.argv[2];
let input = Buffer.alloc(0);

function record(event) {
  appendFileSync(eventLogPath, `${event}\n`, "utf8");
}

function send(message) {
  const json = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

function handleMessage(message) {
  if (message.method) {
    record(message.method);
  }

  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { capabilities: {} } });
    return;
  }

  if (message.method === "shutdown") {
    send({ jsonrpc: "2.0", id: message.id, result: null });
    return;
  }

  if (message.method === "exit") {
    process.exit(0);
  }
}

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);

  while (input.length > 0) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;

    const header = input.subarray(0, headerEnd).toString("utf8");
    const contentLengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
    if (!contentLengthMatch) process.exit(2);

    const contentLength = Number(contentLengthMatch[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;
    if (input.length < bodyEnd) return;

    const message = JSON.parse(input.subarray(bodyStart, bodyEnd).toString("utf8"));
    input = input.subarray(bodyEnd);
    handleMessage(message);
  }
});

record("started");
