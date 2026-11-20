# Sign-in form recovery

## Observed failure

During a real sign-out and fresh-login test, the proxy captured a previously
logged-out cookie. Roblox correctly rejected it. The existing recovery UI
covered the login form, while a separate page-load deadline later displayed
another full-page cover. A subsequent DOM inspection showed a complete
document with usable username/password controls, but the timed-out loader
remained visible.

The captured-cookie decision and the availability of the login form are
separate facts. A rejected cookie must stay rejected; a usable form should
remain available for a new login.

## Repair boundaries

- Dismiss the signing overlay once after an authoritative rejection and a
  successful, ownership-checked rollback. Retain the rejected-cookie guard.
  Do not navigate, clear storage, or interrupt entered fields or a challenge.
- Track the actual login-frame navigation and its current document. Require
  completed browser-session setup and controller connection before checking
  form readiness.
- Reveal only a current, usable Roblox username/password form. Inspect
  control identity, ownership, visibility, and editability, never input values.
  An empty form may legitimately have a disabled submit button.
- A page-load timeout still offers recovery, but a form that subsequently
  becomes usable may remove that timeout cover. A blank document or navigation
  shell cannot do so. A failed worker, controller, or MessagePort cannot be
  relabeled as successful by a late page event.
- An explicit return to sign-in starts a new bounded navigation attempt.
  Obsolete events cannot complete that attempt. No navigation or authenticated
  request is replayed automatically.

The readiness notification means only that the sign-in page is usable. The
existing independent Roblox session verification is still required before the
catalog reports a signed-in account or starts a game.

## Verification scope

Regression tests exercise the transformed provider script and the bootstrap's
actual navigation/readiness lifecycle. All 296 runtime tests passed, including
49 focused sign-in, session, and gateway tests; the Worker build, generated
JavaScript syntax check, and whitespace check also passed. Live account and game observations are
recorded in [Live verification](roblox-public-assets-verification.md). Desktop
responsive checks are not physical iPad Safari tests.
