# Automatic Roblox sign-in recovery

## Confirmed readiness bug

Live browser inspection found the complete, visible Roblox username/password form underneath both recovery covers. Its real control is `button#login-button` with `type="button"`. The previous readiness check accepted only `button[type="submit"]`, so it rejected that otherwise usable form and eventually displayed a connection failure.

The readiness check now accepts the observed exact `#login-button` (a `BUTTON` with type `button` or `submit`) or a conventional submit button. The button must be visible and belong to the same current form as the editable username and password controls. It never reads either input value. A structurally ready form at `interactive` is usable without waiting for unrelated subresources to make the document `complete`.

This reports form readiness, not a successful login. Existing browser-local cookie verification and session ownership still determine whether authentication succeeded.

## Recovery behavior

The sign-in bootstrap owns a budget of two automatic recovery attempts per sign-in document, with one- and three-second backoff. A deliberate Back to sign-in navigation starts a new bounded attempt. Completing a form or repairing a port does not silently reset the budget.

- Browser worker preparation and the initial controller handshake retry read-only setup after a transient failure. They never replay an authentication request.
- A page that misses service-worker interception receives a local, fail-closed recovery document only for the exact initial login GET. The owning sign-in frame validates the sender, origin, route prefix and current DOM marker before repairing control and opening that one fixed GET again.
- An ordinary slow-page deadline repairs the browser connection and continues observing the same document. A timeout is not permission to navigate an authentication page again.
- A visible form, input, verification iframe, active provider verification overlay, or observed interaction protects the current document from automatic navigation, including while its ready state is still `loading`.
- Offline recovery waits for an online event. Background recovery waits for the document to become visible. Those events do not bypass backoff.
- Stop automatic recovery is accepted only from the exact parent window at an approved Kkeep origin. Pending read-only work may finish, but its late result cannot restart navigation or override the paused state with a provider-catch failure.
- A missing current worker or failed local controller-port attachment can be retried while retaining the exact form or verification document. The form remains available throughout recovery, offline waiting, Stop and terminal connection help. Recovery neither resubmits nor reloads that document.

Late form readiness cancels pending recovery and removes the loading cover. Replaced frames, discarded pages, obsolete documents, old callbacks and mismatched message origins cannot authorize a new navigation.

## Parent status contract

All messages retain `type: "kkeep:roblox-runtime"`. They carry bounded status strings only, with no credentials, account state, raw errors or remote request URLs.

| Stage | Detail | Meaning |
| --- | --- | --- |
| `session-recovering` | `service-worker`, `connection`, or `session` | Bounded connectivity recovery is active. |
| `session-waiting` | `offline` | Recovery is waiting for network access. |
| `session-paused` | `user` | Automatic recovery was stopped. |
| `session-help` | `input` or `connection` | The preserved form or verification flow needs user input, or its bounded connection repair could not finish. Reveal the player and show nonblocking help; do not cover its controls or claim that sign-in failed. |
| `session-ready` | empty | The worker/form reached its existing readiness boundary. This does not assert authentication. |
| `session-failed` | existing bounded failure detail | Recovery exhausted its budget or reached a terminal startup failure. |

The stop command is `{type: "kkeep:roblox-recovery", action: "stop"}`. The nested initial-navigation signal is `{type: "kkeep:signin-control-missing"}` and is accepted only with the owned current frame's local marker document.

`session-recovering` and `session-waiting` may additionally carry `preserveForm: true` only when recovery is repairing the still-owned, already visible form or protected verification flow in place. The parent keeps that page available and displays compact progress instead of a blocking cover. Initial worker preparation and pre-form recovery omit this flag; `session-ready` alone is not evidence that a form is visible because preparation also uses that readiness stage.

## Validation

Forty focused sign-in tests pass. They cover the live type=button form contract; interactive readiness; exact origin/frame/route/marker validation; two-attempt limits; offline/visibility timing; Stop during backoff, offline waits, active work and provider catches; late form cancellation; missing-control notices arriving during an existing repair; preservation of visible and transient verification UI; and single-document port recovery. Added regressions cover a null current worker, permanent and hung reclaim failures, the shared budget across successive controller losses, protected progress messaging, and disposal or frame replacement while a worker claim is pending. The slow-page claim also checks cancellation and interaction again after its wait; a late result cannot attach after Stop or after verification takes over. These suites assert no automatic full-page reloads and no input-value reads.

These are deterministic runtime tests. Physical iPad Safari gameplay and authenticated live account verification remain separate checks and must not be inferred from these results.

## Follow-up: controller loss after the form appears

The v29 sign-in bootstrap retired its page-loading observers when a usable login form appeared, which is correct. Its controller-change handler then returned immediately if `navigator.serviceWorker.controller` became `null`. Together those conditions left no recovery, deadline or help event after a later loss of control. A deterministic before-change reproduction advanced three minutes after that transition and observed zero worker reclaims, zero port repairs, zero new status events and no remaining timer. This demonstrates the source defect; it does not establish that the latest physical iPad screenshot was caused by that transition.

The handler now routes that explicit missing-controller condition through the existing two-attempt connectivity budget. It requests current-worker control and reattaches the existing owned controller port without navigating, resubmitting, reading credentials, clearing the cookie jar or replacing the form. A verification flow that advances during the repair remains in the same frame. Current frame identity and source, Stop and disposal are rechecked before a pending worker claim may attach a port or report readiness. Repeated controller-change events coalesce while a repair is active.

If a form or challenge first appears while the page's missing-controller repair is pending, the navigation-capable repair retires before it can attach a port or reopen a page. The preserved current frame can then use only the remaining shared budget for an in-place connection repair. Its form and authentication requests remain untouched.

If the worker remains unavailable or the claim hangs beyond its bounded deadline, the form remains visible and `session-help` with `connection` opens nonblocking Loading help. Stop also preserves the form and rejects late recovery/readiness results. A later loss of control does not reset the already consumed recovery budget. The new regression fails against the previous code and passes with these changes.

## Follow-up: existing browser worker after publication

Live verification of runtime v27 with Kkeep v320 reached the sign-in document and then the catalog, but the catalog displayed “This Roblox page needs an update. Reload to continue.” This is the exact `session-version` recovery state.

The client requires the new `join19` implementation revision while keeping the compatible wire protocol and stable registration URL at `join18`. Calling `register()` with the same script URL, worker type and cache mode may simply return the existing registration; it does not guarantee an update check. The prior readiness loop only pinged that unchanged active worker, so an existing `join18` worker could never satisfy the new revision check during its deadline.

The client now requests `registration.update()` once after an actual revision mismatch, then continues its bounded readiness poll. Live v28 verification showed the updated worker becoming available after the initial 15-second poll had already failed: the separate session check then passed, and returning to the menu reached the visible login form. A confirmed revision update therefore receives up to 45 seconds for download and activation; ordinary inactive-worker failures retain the 15-second deadline. The client does not await an unbounded update, change the registration URL, weaken the revision check, reload the page, or dispatch/replay an account request before the current worker is ready. An already-current worker causes no extra update. Failed or hung updates remain bounded and produce the existing terminal readiness error.

Reference: [Service Workers specification, Register algorithm](https://w3c.github.io/ServiceWorker/#register-algorithm), the existing-registration early-return step; [ServiceWorkerRegistration.update](https://w3c.github.io/ServiceWorker/#service-worker-registration-update).

The focused session and catalog recovery suites pass **26/26 tests**. Added cases model a browser whose registration remains unchanged until `update()` runs, parallel catalog/readiness calls sharing one update, rejected or hung updates with no account fallback, the already-current worker avoiding unnecessary updates, activation after twenty seconds completing the original catalog request once, and ordinary missing-worker failures retaining the shorter deadline. Live validation of this final timing change is still a separate step.
