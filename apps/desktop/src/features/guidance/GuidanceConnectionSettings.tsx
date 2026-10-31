import { useState } from "react";
import { Plug, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useGetGuidanceConnectionQuery, useChangeGuidanceConnectionMutation } from "./api";

export function GuidanceConnectionSettings() {
  const { data, isLoading, error } = useGetGuidanceConnectionQuery(undefined, {
    pollingInterval: 3000,
  });
  const [change, { isLoading: changing }] = useChangeGuidanceConnectionMutation();
  const [notice, setNotice] = useState("");
  const running = data?.status === "running";

  async function copy() {
    if (!data?.clientConfig) return;

    try {
      await navigator.clipboard.writeText(data.clientConfig);
      setNotice("Connection configuration copied.");
    } catch {
      setNotice("Could not copy. Try again.");
    }
  }

  return (
    <section
      className="border-border bg-surface-toolbar rounded-md border p-4"
      aria-label="Agent connection"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Plug className="size-4" />
            Agent connection
          </h2>
          <p className="text-muted-foreground max-w-xl text-xs leading-5">
            Connect T3 Code or another MCP client to build guided PR walkthroughs. Agents can read
            open repositories and save guidance and replies.
          </p>
        </div>
        <Button
          size="sm"
          variant={running ? "outline" : "default"}
          disabled={isLoading || changing}
          onClick={() => {
            setNotice("");
            void change(!running);
          }}
        >
          {isLoading || changing ? <Spinner aria-hidden="true" /> : null}
          {running ? "Stop MCP server" : "Start MCP server"}
        </Button>
      </div>
      {running ? (
        <div className="mt-4 space-y-3">
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Check className="text-success size-4" />
            Listening locally at <code>{data.endpoint}</code>
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void copy();
            }}
          >
            <Copy />
            Copy MCP configuration
          </Button>
          <p className="text-muted-foreground text-xs">
            Add this server configuration to your agent client. It contains a local access key. The
            connection stays configured across app restarts.
          </p>
          <p className="text-muted-foreground text-xs">
            Then ask: “Guide me through this PR in Open Warden.” For saved questions, ask: “Check
            Open Warden for messages.”
          </p>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="text-muted-foreground mt-3 text-xs">
          {notice}
        </p>
      ) : null}
      {data?.error || error ? (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {data?.error ?? "The agent connection could not be loaded."}
        </p>
      ) : null}
    </section>
  );
}
