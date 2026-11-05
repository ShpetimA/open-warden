type RecoveryChoice = "reload" | "close";

type RecoveryActions = {
  prompt(): Promise<RecoveryChoice>;
  reload(): void;
  close(): void;
  isClosed(): boolean;
};

/** Keeps a failed renderer from blocking shutdown or starting an automatic reload loop. */
export class RendererRecovery {
  private unavailable = false;
  private pending: Promise<void> | undefined;

  constructor(private readonly actions: RecoveryActions) {}

  isUnavailable() {
    return this.unavailable;
  }

  loaded() {
    this.unavailable = false;
  }

  exited(showRecovery: boolean): Promise<void> {
    this.unavailable = true;
    if (!showRecovery || this.actions.isClosed()) return Promise.resolve();
    if (this.pending) return this.pending;

    this.pending = this.recover().finally(() => {
      this.pending = undefined;
    });

    return this.pending;
  }

  private async recover() {
    let choice: RecoveryChoice;

    try {
      choice = await this.actions.prompt();
    } catch {
      choice = "close";
    }

    if (this.actions.isClosed() || !this.unavailable) return;

    if (choice === "reload") this.actions.reload();
    else this.actions.close();
  }
}
