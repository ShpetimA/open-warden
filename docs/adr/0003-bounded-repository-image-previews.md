# Bounded repository image previews

Status: accepted

## Context

Binary files already have a shared read-only panel. Images need visual comparisons without placing encoded bytes in every cached file read or decoding arbitrarily large images.

## Decision

- Recognize PNG, JPEG, GIF, and WebP from their byte signatures. SVG remains text.
- Use the buffer API from [`image-size`](https://github.com/image-size/image-size) to inspect dimensions. Existing adapters have no image-header reader. This adds one dependency and no native decoder.
- Cache only image metadata and a source reference. Git references use immutable blob IDs; worktree references include a SHA-256 digest.
- Load bytes through `getImagePreview` only while a preview is visible. The mounted preview owns its response and releases it when hidden or unmounted. It ignores late IPC replies after its lifetime ends.
- Serialize native preview reads. Limit each image to 8 MiB, 16 megapixels, and 16,384 pixels per dimension before sending bytes to the renderer.
- Transfer bounded typed arrays over IPC and validate replies at the renderer boundary. The mounted owner creates and revokes its Blob URL. Browser decode failures use the standard retry surface.
- Worktree reads verify their digest and reject links. Retrying a stale worktree reference refreshes active working-file queries through the existing query tags.

## Consequences

Before/after, added, deleted, renamed, and repository-file views share the same preview panel. Fit and actual-size controls stay local to each image.

Offscreen conversation cards do not retain image payloads. IPC cannot cancel an in-flight read, so native reads remain bounded and late replies are discarded.

Large or unsupported images keep an explicit information state. Wipe/overlay comparison and SVG rasterization are outside this slice.
