# Roblox black screen investigation — join17

## Reproduction in the actual desktop browser

The owner's existing signed-in Kkeep tab was tested in the connected Brave browser. The first Tower of Hell launch displayed the map, character, other players, and timer. A short movement input moved the character.

Using **Loading help → Rejoin this game** reproduced the reported failure: the loading screen disappeared and the game connection reported an open data stream, but the full canvas stayed black. The canvas was visible, uncovered, opaque, and had a 1440×895 CSS viewport with a 1299×807 backing buffer.

Changing that same live viewport to 1180×734 was followed by the visible game returning without navigation, rejoining, or authentication. Restoring the original viewport kept the picture visible. This is useful resize-related evidence, but delayed game loading remains a possible confounder; it does not yet identify the exact broken graphics resource or prove a source repair.

![Reproduced black canvas on rejoin](roblox-desktop-black-before-join17.jpg)

![First live desktop gameplay before this release](roblox-desktop-play-join17.jpg)

Returning to the catalog and reloading Kkeep preserved the authenticated account. This test is desktop Brave, not physical iPad Safari.

## Confirmed session defects repaired

The original provider cached both failed and successful identity responses indefinitely. An upstream 503 could keep a recovered account signed out; an expired session could continue to look authenticated. The guarded worker transform now checks identity afresh for the session and launch endpoints, limits catalog memoization to 30 seconds, distinguishes authoritative 401/403 responses from temporary failures, and prevents late identity reads from overriding newer account state.

The catalog also ignored failed logout responses and navigated as if logout had succeeded. It now requires a successful response and shows a retry message on a network or HTTP failure. No failed logout request is automatically replayed.

## Graphics evidence repaired

The native `Canvas:` and lifecycle messages use the actual `emscripten_console_log` import, bypassing the previously instrumented `Module.print`. The exact inspected 1ef engine bridge now forwards only the existing bounded numeric records and three fixed lifecycle names. It accepts the native line ending without changing console output. No raw account logs are stored or transmitted by this diagnostic.

The provider's existing GPU error listener now exposes its first validation error in the local browser console. Sensitive fields, URLs, paths, resource labels and opaque strings are removed; output is bounded. This adds no network request and does not change GPU calls or rendering flags.

This intermediate release repairs demonstrated authentication and diagnostic bugs. The black-screen graphics repair still requires the actual validation/resize evidence from the reproduced case; visible gameplay from the first launch is not proof that rejoining is fixed.

## Follow-up authentication maintenance

Remote logout is now required to return 200 or 204 before the local session is removed. A delayed provider HTTP response may rotate a session cookie only if the previous token is still the stored token, checked and written in one IndexedDB transaction. Anonymous responses cannot create a session through this rotation path. A normal cookie rotation during identity checking receives one additional read-only verification; it never replays a join or logout.

When an old captured cookie is authoritatively rejected, **Back to sign-in** reveals the Roblox form while keeping that old cookie rejected. A newer successful sign-in can complete normally. Obsolete connectivity timers cannot erase the rejection and cover the form again.

This does not claim universal deletion or coordination of every active Scramjet controller's cookie store. It addresses confirmed remote logout, late provider HTTP rotation, and manual recovery from a rejected transfer.

The actual desktop Timebomb experience subsequently rendered its map, avatar, interface, and other players. Its native lifecycle diagnostic still reported no event. Therefore those lifecycle messages must not be used as a required success gate. Window dimensions changed during a browser connection interruption; that run is useful live gameplay evidence, but does not resolve the black-screen root cause.

A subsequent controlled rejoin at a fixed 1440 × 895 viewport displayed the game after approximately 117 seconds without a resize, focus change, or canvas click. This demonstrates that startup delay can account for an apparent recovery after resizing. The exact native presentation handoff repair and its narrower guarantee are documented in [Native presentation](roblox-native-presentation.md).

![Controlled fixed-viewport Timebomb gameplay before the presentation repair](roblox-timebomb-fixed-viewport.jpg)

Direct sign-out no longer uses a browser confirmation dialog. It permits one pending request, disables mounted controls, preserves the catalog and restores controls after a failed response, and accepts successful 200 or empty 204 responses. Cached catalog header HTML is unchanged so delayed page rendering cannot permanently reinsert a disabled sign-out button after failure.
