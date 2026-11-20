# Roblox black-screen recovery — join13

The user reported that an experience opens but stays black. Source-based tests reproduced two ways that a failed engine can continue displaying an empty game canvas: the provider loading controller suppresses failures after success, and the inspected WebClient catches frame-loop exceptions and only reports crash telemetry. The runtime release addresses those failure-reporting paths. These reproductions do not establish which exception occurred on the physical iPad or prove that its renderer now produces a playable scene.

## Main player

Loading help now displays the graphics mode reported by the trusted current runtime frame. An active mobile game reporting WebGPU has a **Try compatibility graphics** action even after its loading stage completed. The user can start the same experience with WebGL, preserving the selected FPS and relay preference, without reusing a previous server job or ticket. Unknown modes do not imply WebGPU, and a WebGL game does not offer the same switch. Navigating to a different game or leaving the experience clears the displayed graphics mode.

This is a manual recovery action. Default graphics, transport, and FPS selection are unchanged. The new action does not erase saved authentication.

## Verification

The 27 focused session/touch tests passed, including the actual component's post-load help flow, new URL construction, preference retention, wrong-frame and wrong-origin rejection, and renderer state reset. The main production build passed.

The browser fixture uses the actual player component with simulated iPad UI selection and clearly labelled local mock frames. It simulated a black WebGPU scene, opened Loading help, and clicked **Try compatibility graphics**. The resulting frame received `placeId=123&perf=performance&fps=30&res=auto&gpu=webgl&wt=relay`. This confirms recovery navigation, not a Roblox join or physical-iPad rendering.

To reproduce the controlled browser check, run `node scripts/preview-roblox-recovery.mjs <absolute-output-directory> graphics` and use the managed preview on that directory. The fixture is not part of the production site.

![Controlled graphics recovery test](roblox-graphics-recovery-join13.jpg)
