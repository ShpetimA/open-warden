# File pane composition

Repository files, Changes, History files, Compare refs, PR files, and PR commit groups
use `FilePaneHeader` and `FilePaneEmpty`. Headers share title/count alignment, a compact
path field, clear action, and slots for grouping or file actions. Loading is not a zero count.
PR-specific viewed/comment filters stay with the PR feature.

Filters select source files before building the Pierre projection. J/K and mutation selection
continue to use that registered prepared model. No provider-array navigation or tree watchers
were added. Stage all and Unstage all in a filtered Changes section act on the visible files.

Native checks use temporary repositories to verify counts, filtered staging, clear/empty states,
Files selection, and History restore discovery in both themes. Existing browser suites cover
PR grouping, repeated paths, refresh retention, and keyboard navigation.
