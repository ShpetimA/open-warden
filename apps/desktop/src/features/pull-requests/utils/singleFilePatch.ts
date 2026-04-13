import type { PullRequestChangedFile } from "@/platform/desktop";

export function toRenderableSingleFilePatch(file: PullRequestChangedFile): string {
  const patchBody = file.patch?.trim() ?? "";
  if (!patchBody) {
    return "";
  }

  if (patchBody.startsWith("diff --git ")) {
    return patchBody;
  }

  const nextPath = file.path;
  const previousPath = file.previousPath ?? file.path;
  const lines: string[] = [`diff --git a/${previousPath} b/${nextPath}`];

  if (file.status === "added") {
    lines.push("new file mode 100644", "--- /dev/null", `+++ b/${nextPath}`);
  } else if (file.status === "deleted") {
    lines.push("deleted file mode 100644", `--- a/${previousPath}`, "+++ /dev/null");
  } else if (file.status === "renamed") {
    lines.push(
      `rename from ${previousPath}`,
      `rename to ${nextPath}`,
      `--- a/${previousPath}`,
      `+++ b/${nextPath}`,
    );
  } else {
    lines.push(`--- a/${previousPath}`, `+++ b/${nextPath}`);
  }

  lines.push(patchBody);
  return lines.join("\n");
}
