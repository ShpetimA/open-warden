import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";

import type {
  RepositoryConfiguration,
  RepositoryConfigurationCommand,
} from "@/platform/desktop/repositoryManagement";
import { RepositoryConfigurationPanel } from "./RepositoryRemotes";

const configuration: RepositoryConfiguration = {
  revision: "a".repeat(64),
  branch: "main",
  upstream: "origin/main",
  remoteBranches: ["origin/main"],
  remotes: [{ name: "origin", fetchUrls: ["https://github.com/org/repo.git"], pushUrls: [] }],
};

test("retains a remote edit against its original revision and keeps it after failure", async () => {
  const commands: RepositoryConfigurationCommand[] = [];
  const props = {
    busy: false,
    onRun: async (command: RepositoryConfigurationCommand) => {
      commands.push(command);

      return false;
    },
    onFetch: () => {},
  };

  const view = render(<RepositoryConfigurationPanel configuration={configuration} {...props} />);

  fireEvent.click(screen.getByRole("button", { name: "Edit URL" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Repository URL" }), {
    target: { value: "https://bitbucket.org/workspace/repo.git" },
  });

  view.rerender(
    <RepositoryConfigurationPanel
      configuration={{ ...configuration, revision: "b".repeat(64) }}
      {...props}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Save remote" }));

  await waitFor(() => expect(commands).toHaveLength(1));
  expect(commands[0]).toEqual({
    kind: "edit-remote",
    name: "origin",
    url: "https://bitbucket.org/workspace/repo.git",
    expectedRevision: configuration.revision,
  });
  expect(screen.getByRole("textbox", { name: "Repository URL" })).toHaveValue(
    "https://bitbucket.org/workspace/repo.git",
  );
});

test("requires an explicit removal and can clear tracking even after a remote branch disappeared", async () => {
  const commands: RepositoryConfigurationCommand[] = [];

  render(
    <RepositoryConfigurationPanel
      configuration={{ ...configuration, remoteBranches: [] }}
      busy={false}
      onFetch={() => {}}
      onRun={async (command) => {
        commands.push(command);

        return true;
      }}
    />,
  );

  fireEvent.click(
    within(screen.getByRole("group", { name: "Remote origin" })).getByRole("button", {
      name: "Remove",
    }),
  );

  expect(commands).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "Remove remote" }));

  await waitFor(() => expect(commands).toHaveLength(1));
  expect(commands[0]?.kind).toBe("remove-remote");

  fireEvent.click(screen.getByRole("button", { name: "Stop tracking" }));

  await waitFor(() => expect(commands).toHaveLength(2));
  expect(commands[1]).toEqual({
    kind: "set-upstream",
    branch: "main",
    upstream: null,
    expectedRevision: configuration.revision,
  });
});
