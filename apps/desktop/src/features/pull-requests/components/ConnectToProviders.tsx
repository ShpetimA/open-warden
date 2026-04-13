import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConnectProviderMutation } from "@/features/hosted-repos/api";
import { useState, type SubmitEvent } from "react";

type ConnectBitbucketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ConnectBitbucketDialog({ open, onOpenChange }: ConnectBitbucketDialogProps) {
  const [identifier, setIdentifier] = useState("");
  const [token, setToken] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [connectProvider, { isLoading }] = useConnectProviderMutation();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextIdentifier = identifier.trim();
    const nextToken = token.trim();
    if (!nextToken) {
      setSubmitError("Bitbucket token or app password is required.");
      return;
    }

    try {
      await connectProvider({
        providerId: "bitbucket",
        method: "pat",
        token: nextToken,
        identifier: nextIdentifier || null,
        authType: "auto",
      }).unwrap();
      setIdentifier("");
      setToken("");
      setSubmitError("");
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Bitbucket</DialogTitle>
          <DialogDescription>
            Add Bitbucket credentials so OpenWarden can list pull requests and prepare local review
            workspaces.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <div className="text-sm font-medium">Username or email (optional)</div>
            <Input
              autoFocus
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                if (submitError) {
                  setSubmitError("");
                }
              }}
              placeholder="your-username"
            />
            <div className="text-muted-foreground text-xs leading-5">
              Needed for app password basic auth. Leave empty to try bearer token auth.
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Token or app password</div>
            <Input
              type="password"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                if (submitError) {
                  setSubmitError("");
                }
              }}
              placeholder="App password or access token"
            />
            {submitError ? <div className="text-destructive text-xs">{submitError}</div> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ConnectGitHubDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ConnectGitHubDialog({ open, onOpenChange }: ConnectGitHubDialogProps) {
  const [token, setToken] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [connectProvider, { isLoading }] = useConnectProviderMutation();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextToken = token.trim();
    if (!nextToken) {
      setSubmitError("GitHub token is required.");
      return;
    }

    try {
      await connectProvider({
        providerId: "github",
        method: "pat",
        token: nextToken,
      }).unwrap();
      setToken("");
      setSubmitError("");
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect GitHub</DialogTitle>
          <DialogDescription>
            Add a GitHub personal access token so OpenWarden can list pull requests and prepare
            local review workspaces.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <div className="text-sm font-medium">Personal access token</div>
            <Input
              type="password"
              autoFocus
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                if (submitError) {
                  setSubmitError("");
                }
              }}
              placeholder="github_pat_..."
            />
            <div className="text-muted-foreground text-xs leading-5">
              Use a token with repository read access. Private repositories usually require the
              `repo` scope.
            </div>
            {submitError ? <div className="text-destructive text-xs">{submitError}</div> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
