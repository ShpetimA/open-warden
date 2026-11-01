# Native provider request coordination

Status: accepted, 1 November 2026.

RTK Query deduplicates one endpoint and argument pair. Conversation, checks, reviewers,
extras, Guidance, and comparison preparation use different native operations, so they
could independently request the same PR. Feature-level partial results also hid rate-limit
responses from the renderer's shared deadline policy.

`ProviderRequestCoordinator` owns account-scoped request coordination below those features.
`providerTransport` composes it with the existing complete-response deadline adapter.
The existing provider adapters retain their DTO mapping and translate typed coordinator
results to `DesktopAdapterError` at their established boundary. Error envelopes are parsed
with Zod. No new transport, persistence store, runtime, or dependency is introduced.

The owner provides:

- At most two active requests and a bounded queue per provider, origin, and credential
  fingerprint. Writes precede queued reads; interactive reads precede background reads.
- Shared cooldowns, including GraphQL errors returned with HTTP 200 and secondary limits
  reported in GitHub error bodies. Ordinary permission and missing-resource errors do not
  turn routine quota-reset headers into account-wide cooldowns.
- Conservative GitHub REST and GraphQL remaining-budget observations. Background detail
  polling preserves a quota reserve. Manual refresh can use that reserve but cannot bypass
  exhausted quota or a hard cooldown. Bitbucket near-limit headers slow subsequent requests;
  its hourly limit header is not treated as a remaining count.
- Coalesced identical in-flight reads. Each reader receives its own response body. Cancelling
  one reader does not cancel another; cancelling the last reader aborts the shared request.
- A bounded in-memory successful-response cache. Keys include credential fingerprint,
  complete URL, representation, API version, and GraphQL query/variables. Failures and
  oversized or `no-store` responses are not retained.
- GitHub REST ETag revalidation, including cached body and pagination headers on 304.
  Bitbucket is not assumed to provide GitHub's conditional-request quota exemption.
- Generation guards around writes and explicit refresh. Late reads cannot refill the cache
  after invalidation. Writes are never coalesced or automatically replayed. Ambiguous write
  outcomes retain the existing refresh-before-retry guidance.

PR detail has its own desktop read contract. Initial reads can share a short cached snapshot;
manual refresh revalidates; polling runs at background priority. Checks and file metadata no
longer request the full conversation merely to obtain revision identifiers. Inbox descriptions
use detail directly. Full review contexts still demand conversations for their threads.

The existing refresh controller remains the only renderer polling owner. It pauses while
hidden or offline, throttles focus/reconnect recovery, and polls closed PRs less often. Files
are reused while head and base match; extras use a slower cadence. Manual refresh includes
all demanded resources. Unchanged polls do not invalidate inbox pages. Relevant summary
changes and explicit inbox refresh still reconcile the list. Earlier GitHub search pages
reuse short-lived cached cursor responses while the requested page is revalidated.

Existing revision handoff guards remain responsible for displaying complete comparisons,
threads, files, and status together. Immutable refs do not imply that checks or comments are
unchanged. Native repository freshness and file selection remain with their existing owners.

The cache is process-local. Credential changes isolate all state; renderer shutdown uses
the desktop disposal owner. Local abort support does not imply cancellation of an IPC call.
Provider-wide traffic from other applications can still exhaust quota. GraphQL cost prediction,
multi-account scheduling, webhook infrastructure, and summary-alias batching are not added.

Deterministic provider fixtures cover request counts, cache isolation and eviction, conditional
responses, swallowed failures, cooldown recovery, cancellation, concurrency, and writes racing
with reads. A local HTTP fixture exercises the production transport. Renderer tests cover
demand, permanent failures, cadence, visibility, inbox reconciliation, and revision handoff.
No comments, reviews, or other mutations are sent to a real provider account for validation.

T3 Code's shared read cache, conditional checks, and quota ownership informed the design.
Open Warden keeps its Electron/Redux architecture.
