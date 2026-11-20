# Roblox join18 live verification

## Published source

- Runtime v22: `2ac423558103b81ccfda2a746e8fcc87e6eb5fc1`.
- Main website v318: `cb807a4b410efe155a17ed68518cac5390ee81c9`.
- Website: https://kkeep.fun/roblox.

The runtime waits for the next native WebGPU presentation submission before
beginning the HTML loading-screen dismissal when the native game canvas is
already configured. See [the presentation contract](roblox-native-presentation.md)
for its exact scope. Submission is not proof of nonblack pixels or successful
asynchronous GPU validation.

The website also exposes its existing manual compatibility-graphics action on
desktop WebGPU sessions. It retains the selected game and account session and
does not force desktop users into mobile performance settings.

## Browser checks

These checks used the user's connected desktop Brave browser and authorized
alternate account. No credentials or account tokens are recorded here. This is
not a physical iPad Safari test.

1. Reloaded the newly published website. An initial session-version mismatch
   persisted through one catalog retry. The built-in session check subsequently
   passed its strict join18 handshake, and fresh catalog navigation loaded the
   account. The precise cause of the initial mismatch was not established; the
   revision check was not weakened.
2. Clicked Sign out. The control became disabled while pending and completed
   without a native confirmation dialog. A previously captured cookie was
   rejected on the sign-in page.
3. Used Back to sign-in to reveal the actual Roblox password form. The first
   interaction occurred while that form was still initializing. Once it had
   finished loading, entering the supplied credentials and submitting returned
   successfully to the account's authenticated catalog.
4. Reloaded Kkeep. The fresh authenticated session remained available.
5. Launched Timebomb Duels [Alpha] through Resume. The HTML loading screen
   remained visible during startup. At approximately 111 seconds after launch,
   the actual map, avatar, game interface, and other players were visible.
6. Focused the game canvas and held W for one second. The avatar's position and
   camera view changed. The canvas filled the 1440 × 895 CSS viewport with a
   1299 × 807 drawing buffer. No bounded Kkeep WebGPU validation error was
   recorded for this run.
7. Opened Loading help and confirmed that Rejoin this game and Try compatibility
   graphics were available for the desktop WebGPU session.
8. Attempted Rejoin this game without changing the viewport. The provider
   reported that Roblox was already running in another tab. Browser inventory
   showed a second Kkeep Roblox tab owned by another active browser session;
   that session was not interrupted. This attempt does not establish a rejoin
   defect or a successful second join. The origin-wide player lock was kept.
9. Returned to the catalog; the account remained signed in. Checked catalog
   layout at 1180 × 734 and 820 × 1100. The document had no horizontal overflow
   and Resume remained accessible. Restored the browser's original viewport.

![Timebomb gameplay after fresh password login and movement](roblox-timebomb-join18.jpg)

## Automated verification

- Runtime: 245 tests passed, zero failed or skipped.
- Main website: 26 focused tests passed; TypeScript check passed.
- Production builds and whitespace checks passed.
- Presentation tests execute the actual saved provider loader and native
  configure/presentation functions, preserving GPU call order and cancellation.
- Auth tests cover remote logout failures, delayed session-cookie rotation,
  rejected-cookie recovery, overlapping identity requests, repeated sign-out
  clicks, empty 204 responses, and delayed cached-header rendering.

These checks do not establish every game, every device, every network, or
unexercised account flows such as registration, password reset, or two-factor
verification. The live game picture and movement are the rendering evidence;
transport connection, FPS samples, and loading events alone are not.
