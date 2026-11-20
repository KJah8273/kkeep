# Roblox automatic recovery

## User-facing behavior

The host now opens Loading help for confirmed runtime errors and displays automatic recovery progress. It keeps each selected experience, frame-rate preference, graphics choice and relay preference when starting a fresh recovery launch. It does not reuse an old server ticket or resend an authentication submission.

| Confirmed condition | Automatic action |
| --- | --- |
| Initial sign-in browser connection failure | The isolated runtime repairs worker control or the controller connection, with two retries at most. |
| Browser connection lost after a login form or verification appears | Repair worker control and its local connection in place, using the same shared retry budget. Keep the form visible with a progress notice and Stop control. |
| Exact initial login GET missed the service worker | The runtime reclaims control and reopens only that fixed login GET, provided no form or verification interaction has started. |
| Ready login form | Remove the loading/error covers; authentication is still determined by the normal session checks. |
| Visible login or verification interaction | Keep the document and show a compact, dismissible help notice. |
| Menu, friends, search or profile page failure | Open Loading help with a bounded explanation. A later successful current route clears only this menu failure; an old route cannot cover a game or dismiss a sign-in error. |
| Game download failure | Retry the download through one fresh launch. |
| Confirmed game disconnect or failed game handshake | Request a fresh connection, using relay if it was not already selected. |
| Actual WebGPU initialization failure or unexpected loss of the selected device | Switch once to compatibility graphics and request a fresh join. |
| Unsupported browser features, memory failure or unknown engine error | Open Loading help with the specific available explanation; do not guess an automatic fix. |
| Long join without a confirmed failure | After 60 seconds, reveal the continuing player and a compact help notice without restarting it. |

Game recovery has a total budget of two automatic attempts. A transient running notification never replenishes that budget. A deliberate manual action or selection of a different experience creates a new budget. Offline and hidden tabs wait before starting a pending game recovery; Stop automatic recovery cancels pending work. A later definitive memory, feature or unknown engine error cancels an obsolete pending connection retry. A replaced frame, exited game or stale event cannot launch another recovery.

Stop is recorded immediately in the host, before the runtime acknowledges it, so queued recovery messages cannot resume progress or reopen the cover. Show player keeps subsequent menu errors in a compact notice until an explicit Retry or a new flow. A verified preserved form remains visible through recovery, offline waiting, Stop and terminal connection help. The host requires the runtime's explicit boolean preservation signal; worker preparation alone is not evidence of a visible form or successful authentication.

The host does not retry sign-in navigation itself. The runtime alone observes the form, controller and authentication boundaries. This prevents a second host timer from interrupting a password, challenge or session verification.

## Confirmed sign-in bug

On 2026-11-20 the available cloud browser reproduced the reported failure: a fully loaded, visible Roblox login form remained under the two error covers. Read-only DOM inspection confirmed editable username/password controls in the same form and a visible `button#login-button` with `type="button"`. The previous readiness detector required `button[type="submit"]`. Runtime revision join19 accepts the actual inspected button while retaining exact document, ownership, visibility and form checks. No input values are read.

Production logs also contained sign-in proxy requests reaching the server as 404s. The missing-controller response now signals only the exact initial login iframe GET; account and verification requests retain the existing browser-only handling.

## Verification and limits

- 49 focused host tests passed, including real component state/timer execution for automatic recovery, limits, offline/background waits, stale frames, Stop, Show player, slow joins, current catalog route outcomes, preserved forms and failure priorities.
- The isolated runtime suite covers the inspected engine scripts, sign-in forms, current route notifications and connection/session boundaries; run the entire suite before publication.
- TypeScript checking, runtime syntax checking and the production builds are required before publication.
- The public sign-in form was inspected in cloud Chrome. Physical iPad Safari gameplay has not been verified by these tests. Engine readiness or a hidden loading overlay is not proof of a playable rendered game.

## Compatible worker upgrade

Worker registration keeps the existing `/_jar/sw.js?kk=join18` URL and uses `updateViaCache: "none"`. The wire protocol still reports `version: "join18"` for already-open clients, while new clients require `revision: "join19"` before using the new recovery. This avoids old and new tabs repeatedly replacing each other's worker URL and preserves the same browser-local cookie database.
