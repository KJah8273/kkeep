# Roblox disconnect recovery — join12

The reported iPad session briefly displayed a game, then showed engine error 277. The outer player now offers **Rejoin using relay** when the selected game connection was direct or has not been reported. Clicking it creates a fresh same-experience request through the runtime's existing relay, with the validated renderer and selected FPS retained. There is no automatic rejoin. Once relay is selected, ordinary retry and FPS changes keep that choice; choosing a different game resets the recovery state.

The player accepts transport and renderer reports only from its current runtime iframe and a fixed set of values. Reports arriving after exit do not change the next game's recovery state. Game URLs are rebuilt from the validated place ID and display/transport choices, without copying old job or authentication parameters. The connection label reports Direct or Relay only after the runtime says that transport was adopted.

## Verification

- 23 focused session/touch tests passed, including real component state transitions, fresh relay navigation, renderer/FPS retention, source validation, and exit-to-new-game state reset.
- The complete main-site production build passed.
- The actual component was tested in the browser using `scripts/preview-roblox-recovery.mjs`. Its labelled mock frame emitted a controlled 277. The recovery button navigated to `placeId=123&perf=performance&fps=30&res=auto&gpu=webgl&wt=relay` and the mock frame displayed those received values.
- Runtime join12 passed its separate 134-test suite and build. It forwards the explicit relay preference through both provider worker layouts, handles abandoned transport promises, keeps URL preferences when storage writes fail, and forwards bounded worker connection diagnostics.

The screenshot below is a **controlled UI test**, not a live Roblox game or an iPad gameplay test. No authenticated game join or sustained physical-iPad session was verified. The runtime changes fix reproduced code defects and supply a manual recovery path; the exact cause of the user's immediate 277 remains unconfirmed.

![Controlled 277 recovery UI](roblox-relay-recovery-join12.jpg)
