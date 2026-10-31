# Focused PR review panel

The Review action and Submit review command use one panel after choosing a PR.
It shows the decision, message, and full pending inline comments for the prepared revision.

Review messages and decisions are saved through the existing workspace session owner.
Closing with Escape, clicking outside, switching projects, and restarting retain the draft.
Successful submission clears that PR's draft. Other PR drafts and inline contexts remain intact.

Submission pauses while the current revision loads. The dialog stays open during submission,
prevents duplicate activation, and returns focus to its opener after dismissal.
Failures retain the message and show Retry. Confirmed inline receipts are removed before retry.
Bitbucket also records a confirmed message receipt so a later decision retry does not post it again.
A lost network response can still have an unknown provider outcome; receipts only describe confirmed responses.

Verification uses bridge fixtures for both providers, draft/session round trips, partial failure,
keyboard behavior, and light/dark routed UI. No live review is submitted by these checks.
