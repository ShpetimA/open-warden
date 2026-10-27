import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  guidanceFailure,
  guidanceLocatorSchema,
  guidanceMessageInputSchema,
  guidanceProgressSchema,
  publishGuidanceSchema,
  type GuidanceResult,
} from "../../src/platform/desktop/guidance";
import { GuidanceService } from "./service";

function result(value: unknown) {
  const failed = z.object({ ok: z.literal(false) }).safeParse(value).success;
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], isError: failed };
}

export function createGuidanceMcpServer(service: GuidanceService) {
  const server = new McpServer(
    { name: "Open Warden", version: "1.0.0" },
    {
      instructions:
        "Build concise, code-led PR walkthroughs in Open Warden. First list open workspaces, read review context, then read file comparisons before citing lines. The user reads explanations directly above highlighted code. Make each step one review decision: a concrete 3–8 word title, then 2–4 short bullets covering the behavior change, why it matters, and what to verify. Aim for under 100 words per step and a one-sentence summary under 40 words. Do not repeat the PR description, list files in prose, paste code already visible in the diff, or add generic introductions and recaps. Put optional background in Markdown details blocks. Use a reference note for a focused one- or two-sentence explanation of that exact range; otherwise the step body appears above the code. Attach file-and-line references to every code explanation: Markdown paths alone do not open code. Empty references are only for intentional text-only steps. Publish against the exact headSha and preserve stable step IDs. User questions are stored locally; check list_guidance_messages when asked, save replies with add_guidance_message, and acknowledge handled questions. Never claim a reply was saved unless it was. Guidance does not approve or change the remote PR.",
    },
  );
  server.registerTool(
    "list_review_workspaces",
    { description: "List repositories and PR workspaces open in Open Warden.", inputSchema: {} },
    async () => result(await service.listWorkspaces()),
  );
  server.registerTool(
    "get_review_context",
    {
      description:
        "Read the PR headSha, description, changed files, checks, and discussion. Only open repositories are accessible.",
      inputSchema: guidanceLocatorSchema,
    },
    async (input) => result(await service.context(input)),
  );
  server.registerTool(
    "get_review_file",
    {
      description: "Read base/head file contents to explain changes and cite exact line numbers.",
      inputSchema: guidanceLocatorSchema.extend({ path: z.string().min(1) }),
    },
    async (input) => result(await service.diff(input, input.path)),
  );
  server.registerTool(
    "publish_guidance",
    {
      description:
        "Save a concise ordered walkthrough: one review decision per step, 2–4 short bullets under 100 words, and a one-sentence summary. Preserve existing step IDs. Attach changed-file references with side=head or base and inclusive line ranges. Optional reference.note is a short explanation rendered above that highlighted range; the step body is the default. Do not duplicate visible code or narrate every file. Rejects a stale expectedHeadSha.",
      inputSchema: publishGuidanceSchema,
    },
    async (input) => result(await service.publish(input)),
  );
  server.registerTool(
    "get_guidance_state",
    {
      description:
        "Read saved steps, selected step, reviewed steps, and message history for this PR.",
      inputSchema: guidanceLocatorSchema,
    },
    async (input) => result(await service.read(input)),
  );
  server.registerTool(
    "show_guidance_step",
    {
      description:
        "Open Guidance in Open Warden and select a saved step. Use when the user asks to be guided; background reads do not change their screen.",
      inputSchema: guidanceProgressSchema.omit({ reviewed: true }),
    },
    async (input) => result(await service.show(input)),
  );
  server.registerTool(
    "list_guidance_messages",
    {
      description:
        "Check stored, unacknowledged user questions across walkthroughs in open repositories. Reading does not consume them. Each message includes its step and commit context.",
      inputSchema: {},
    },
    async () => result(await service.inbox()),
  );
  server.registerTool(
    "add_guidance_message",
    {
      description:
        "Save an agent reply in the walkthrough, optionally attached to a step. Replies are visible in the Guidance tab.",
      inputSchema: guidanceMessageInputSchema,
    },
    async (input) => result(await service.message(input, "agent")),
  );
  server.registerTool(
    "acknowledge_guidance_messages",
    {
      description:
        "Mark specific user messages handled after saving replies. Other and newer messages remain in the inbox.",
      inputSchema: guidanceLocatorSchema.extend({
        messageIds: z.array(z.string().min(1)).min(1).max(1000),
      }),
    },
    async (input) => result(await service.acknowledge(input, input.messageIds)),
  );
  return server;
}

export async function startGuidanceMcpServer(
  service: GuidanceService,
  options: { token: string; port: number },
): Promise<GuidanceResult<{ endpoint: string; close(): Promise<void> }>> {
  const active = new Set<McpServer>();
  const token = Buffer.from(`Bearer ${options.token}`);
  const server = createServer((request, response) => {
    void (async () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : options.port;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      const origin = request.headers.origin;
      if (
        !allowedHosts.includes(request.headers.host ?? "") ||
        (origin !== undefined && !allowedHosts.some((host) => origin === `http://${host}`))
      ) {
        response.writeHead(403).end();
        return;
      }
      const received = Buffer.from(request.headers.authorization ?? "");
      if (received.length !== token.length || !timingSafeEqual(received, token)) {
        response.writeHead(401, { "WWW-Authenticate": "Bearer" }).end();
        return;
      }
      if (request.url !== "/mcp") {
        response.writeHead(404).end();
        return;
      }
      if (request.method !== "POST") {
        response.writeHead(405, { Allow: "POST" }).end();
        return;
      }
      const mcp = createGuidanceMcpServer(service);
      active.add(mcp);
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
          maxRequestBodySize: 1024 * 1024,
        });
        await mcp.connect(transport);
        await transport.handleRequest(request, response);
      } finally {
        active.delete(mcp);
        await mcp.close();
      }
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  server.requestTimeout = 30000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      return guidanceFailure("unavailable", "The MCP endpoint could not be started.");
    return {
      ok: true,
      value: {
        endpoint: `http://127.0.0.1:${address.port}/mcp`,
        async close() {
          await Promise.allSettled([...active].map((mcp) => mcp.close()));
          await new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          });
        },
      },
    };
  } catch {
    return guidanceFailure(
      "unavailable",
      "The MCP port is unavailable. Close the other Open Warden instance and try again.",
    );
  }
}
