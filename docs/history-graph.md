# Repository history

History has two views:

- **List** shows the complete history reachable from the checked-out commit. Filtering searches the complete loaded history by message, author, and hash; there is no default 200-commit ceiling. The existing file/diff panes and two-commit selection remain available.
- **Graph** fills the workspace with commit ancestry across local branches, remote-tracking branches, tags, and detached HEAD. Lines follow actual parent IDs in topological order. Internal notes and stash metadata are excluded.

Use J/K or the arrow keys to select graph commits. Double-click a commit, press Enter on its row, or choose **Open changes** to open its files and diff in List. Merge changes compare the merge tree with its first parent, consistently for both the file list and the diff. Graph filtering also matches author email and ref names. Connections are hidden while filtering so nonadjacent results cannot appear connected.

**Contributors** shows unique reachable commits per author, including merge commits, and each author's share of the total. Git mailmap identities are respected. These counts describe commits rather than lines changed or an assessment of effort.

Both views render only the visible rows for large histories. Git metadata is streamed from the subprocess and full commit metadata is retained for searching and graph layout; diffs are loaded when a commit is opened. No graphing dependency is added.

The view reads local Git objects and does not fetch remote history automatically. Shallow clones display an explanation in Graph. A refresh failure retains the graph, filter, and selection and offers Retry.
